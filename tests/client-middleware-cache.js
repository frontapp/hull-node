/* global describe, it */
import { expect, should } from "chai";
import sinon from "sinon";
import cacheManager from "cache-manager";
import jwt from "jwt-simple";

import Middleware from "../src/middleware/client";
import { Cache } from "../src/infra";

import HullStub from "./support/hull-stub";

let reqStub;

describe("Client Middleware", () => {
  beforeEach(function beforeEachHandler() {
    this.getStub = sinon.stub(HullStub.prototype, "get");
    this.getStub.onCall(0).returns(Promise.resolve({
        id: "ship_id",
        private_settings: {
          value: "test"
        }
      }))
      .onCall(1).returns(Promise.resolve({
        id: "ship_id",
        private_settings: {
          value: "test1"
        }
      }));
    this.putStub = sinon.stub(HullStub.prototype, "put");
    this.putStub.onCall(0).returns(Promise.resolve(''));
    reqStub = {
      query: {
        organization: "local",
        secret: "secret",
        ship: "ship_id"
      }
    };
  });

  afterEach(function afterEachHandler() {
    this.getStub.restore();
    this.putStub.restore();
  });

  it("should take a ShipCache", function (done) {
    const cache = new Cache({ store: "memory", max: 100, ttl: 1/*seconds*/ });
    cache.contextMiddleware()(reqStub, {}, () => {});
    const instance = Middleware(HullStub, { hostSecret: "secret"});
    instance(reqStub, {}, (err) => {
      expect(reqStub.hull.ship.private_settings.value).to.equal("test");
      const newShip = {
        private_settings: {
          value: "test2"
        }
      };

      reqStub.hull.cache.set("ship_id", newShip)
        .then((arg) => {
          instance(reqStub, {}, () => {
            expect(reqStub.hull.ship.private_settings.value).to.equal("test2");
            expect(this.getStub.calledOnce).to.be.true;
            done();
          });
        });
    });
  });

  it("should allow for disabling caching", function (done) {
    const cache = new Cache({ store: "memory", isCacheableValue: () => false });

    cache.contextMiddleware()(reqStub, {}, () => {});
    const instance = Middleware(HullStub, { hostSecret: "secret" });
    instance(reqStub, {}, () => {
      expect(reqStub.hull.ship.private_settings.value).to.equal("test");
      instance(reqStub, {}, () => {
        expect(reqStub.hull.ship.private_settings.value).to.equal("test1");
        expect(this.getStub.calledTwice).to.be.true;
        done();
      });
    });
  });
});
