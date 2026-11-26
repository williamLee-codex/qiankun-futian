import type { RequestHandler } from "express";

// 60s requested host limit minus 10s acknowledgement/cleanup margin.
// This is an acknowledgement deadline, NOT a database cancellation/rollback.
export function requestDeadline(milliseconds = 50_000): RequestHandler {
  return (_req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.setHeader("Cache-Control", "no-store");
        res.status(503).json({
          error: "FARM_REQUEST_RESULT_UNKNOWN",
          retry: "same_request_id",
        });
      }
    }, milliseconds);
    timer.unref();
    const clear = () => clearTimeout(timer);
    res.once("finish", clear);
    res.once("close", clear);
    next();
  };
}
