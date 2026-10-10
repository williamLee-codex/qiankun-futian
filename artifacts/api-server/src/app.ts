import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((req, res, next) => {
  const origin = req.header("origin");
  if (
    process.env.NODE_ENV === "production" &&
    origin &&
    origin !== process.env.FARM_V2_ALLOWED_ORIGIN
  ) {
    res.status(403).json({ error: "FARM_ORIGIN_NOT_ALLOWED" });
    return;
  }
  next();
});
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.FARM_V2_ALLOWED_ORIGIN || false
        : true,
    credentials: false,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
// Unexpected driver/runtime errors must not expose connection details.
app.use(((error, _req, res, _next) => {
  logger.error({ code: "FARM_API_INTERNAL_ERROR" });
  if (!res.headersSent) res.status(503).json({ error: "FARM_API_UNAVAILABLE" });
}) as ErrorRequestHandler);

export default app;
