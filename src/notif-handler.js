import MessageValidator from 'sns-validator';
import connect from 'connect';
import https from 'https';
import _ from 'lodash';
import Client from './index';
import rawBody from 'raw-body';

function parseRequest() {
  return function (req, res, next) {
    req.hull = req.hull || {};
    rawBody(req, true, function(err, body) {
      // Because we can't reuse streams and express middlewares
      // throw them away
      req.hull.message = JSON.parse(body);
      return next();
    });
  };
}

function verifySignature(options = {}) {
  const validator = new MessageValidator();

  return function (req, res, next) {

    if (!req.hull.message) {
      return res.handleError('Empty Message', 400);
    }

    validator.validate(req.hull.message, function(err, message) {
      if (err) {
        return res.handleError(err.toString(), 400);
      }

      req.hull = req.hull || {}

      if (message['Type'] === 'SubscriptionConfirmation') {
        https.get(message['SubscribeURL'], function (sub) {
          if (typeof options.onSubscribe === 'function') {
            options.onSubscribe(req);
          }
          return res.end('subscribed');
        }, function(err) {
          return res.handleError('Failed to subscribe', 400);
        });
      } else if (message['Type'] === 'Notification') {
        try {
          req.hull.notification = {
            subject: message['Subject'],
            message: JSON.parse(message['Message']),
            timestamp: new Date(message['Timestamp'])
          }
          next();
        } catch (err) {
          res.handleError('Invalid message', 400);
        }
      }
    });
  }
}

function processHandlers(handlers) {
  return function(req, res, next) {
    try {
      const eventName = req.hull.message.Subject;
      const eventHandlers = handlers[eventName];
      if (eventHandlers && eventHandlers.length > 0) {
        const context = {
          hull: req.hull.client,
          ship: req.hull.ship
        };

        const processors = eventHandlers.map(fn => fn(req.hull.notification, context));

        Promise.all(processors).then(() => {
          next();
        }, () => {
          res.handleError('Failed to process message', 500);
        });
      } else {
        next();
      }
    } catch ( err ) {
      res.handleError(err.toString(), 500);
    }
  };
}


function enrichWithHullClient() {
  var _cache = [];

  function getCurrentShip(shipId, client) {
    _cache[shipId] = _cache[shipId] || client.get(shipId);
    return _cache[shipId];
  }

  return function(req, res, next) {
    const config = ['organization', 'ship', 'secret'].reduce((cfg, k)=> {
      const val = req.query[k];
      if (typeof val === 'string') {
        cfg[k] = val;
      } else if (val && val.length) {
        cfg[k] = val[0];
      }
      return cfg;
    }, {});

    req.hull = req.hull || {};

    if (config.organization && config.ship && config.secret) {
      const client = req.hull.client = new Client({
        orgUrl: 'https://' + config.organization,
        platformId: config.ship,
        platformSecret: config.secret
      });
      getCurrentShip(config.ship, client).then((ship) => {
        req.hull.ship = ship;
        next();
      }, (err) => {
        res.handleError(err.toString(), 400);
      });
    } else {
      next();
    }
  };
}

function errorHandler(onError) {
  return function(req, res, next) {
    res.handleError = function(message, status) {
      if (onError) onError(message, status);
      res.status(status);
      res.end(message);
    };
    next();
  };
}


export default function NotifHandler(options = {}) {
  const _handlers = {};
  const app = connect();

  function addEventHandlers(eventsHash) {
    _.map(eventsHash, (fn, eventName) => addEventHandler(eventName, fn));
    return this;
  }

  function addEventHandler(eventName, fn) {
    _handlers[eventName] = _handlers[eventName] || [];
    _handlers[eventName].push(fn);
    return this;
  }

  if (options.events) {
    addEventHandlers(options.events);
  }

  app.use(errorHandler(options.onError));
  app.use(parseRequest());
  app.use(verifySignature({ onSubscribe: options.onSubscribe }));
  app.use(enrichWithHullClient());
  app.use(processHandlers(_handlers));
  app.use((req, res) => { res.end('ok'); });

  function handler(req, res) {
    return app.handle(req, res);
  }

  handler.addEventHandler = addEventHandler;

  return handler;
}
