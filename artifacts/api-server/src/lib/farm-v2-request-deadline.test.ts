import { expect, test } from "vitest";
import express from "express";
import { requestDeadline } from "./farm-v2-request-deadline";

test("deadline reports an unknown result instead of success or a new mutation", async () => {
  const app = express();
  app.use(requestDeadline(30));
  app.get("/probe", (_req, _res) => {
    /* Simulate an unanswered operation. */
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/probe`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "FARM_REQUEST_RESULT_UNKNOWN",
      retry: "same_request_id",
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
