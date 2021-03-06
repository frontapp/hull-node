import { renderFile } from "ejs";
import timeout from "connect-timeout";

import { staticRouter, tokenMiddleware, notifMiddleware } from "../utils";


/**
 * Base Express app for Ships front part
 */
export default function setupApp({ instrumentation, queue, cache, app }) {
  app.use(tokenMiddleware());
  app.use(notifMiddleware());
  app.use(instrumentation.startMiddleware());

  app.use(instrumentation.contextMiddleware());
  app.use(queue.contextMiddleware());
  app.use(cache.contextMiddleware());

  // the main responsibility of following timeout middleware
  // is to make the web app respond always in time
  app.use(timeout("25s"));
  app.engine("html", renderFile);

  app.set("views", `${process.cwd()}/views`);
  app.set("view engine", "ejs");

  app.use("/", staticRouter());

  return app;
}
