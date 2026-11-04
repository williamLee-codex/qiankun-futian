import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = {
    on: vi.fn(),
    query: vi.fn(),
    release: vi.fn(),
  };
  const dbQuery = vi.fn();
  return {
    client,
    dbQuery,
    connect: vi.fn(async () => client),
    platformFetch: vi.fn(),
  };
});

vi.mock("@workspace/db", () => ({
  createDatabaseConnection: () => ({
    pool: { connect: mocks.connect },
  }),
  pool: { query: mocks.dbQuery },
}));
vi.mock("./farm-v2-platform", () => ({
  farmV2PlatformConnection: () => ({
    base: "https://platform.test",
    secret: "test-only",
  }),
}));
vi.mock("./farm-v2-platform-fetch", () => ({
  farmV2PlatformFetch: mocks.platformFetch,
}));
vi.mock("./farm-v2-authority-context", () => ({
  farmAuthorityContext: {
    run: async (_context: unknown, run: () => Promise<unknown>) => run(),
  },
}));

import { withFarmAuthority } from "./farm-v2-authority";

const input = {
  userId: "00000000-0000-4000-8000-000000000001",
  launchToken: "test-launch-token",
  requestId: "test-request-1",
  action: "SOW:1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.query.mockResolvedValue({ rows: [] });
  mocks.dbQuery.mockResolvedValue({ rowCount: 1 });
  mocks.platformFetch.mockImplementation(async (_url: URL, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.phase === "begin")
      return Response.json({
        operationId: body.operationId,
        effectivePaidCrystals: 10,
      });
    return Response.json({ settled: true });
  });
});
afterEach(() => vi.restoreAllMocks());

it("settles an authorized operation and destroys its advisory-lock connection", async () => {
  await expect(withFarmAuthority(input, async () => "done")).resolves.toBe("done");
  expect(mocks.platformFetch).toHaveBeenCalledTimes(2);
  expect(mocks.dbQuery).toHaveBeenCalledTimes(3);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("attempts end settlement even if begin is rejected", async () => {
  mocks.platformFetch.mockImplementation(async (_url: URL, init: RequestInit) => {
    const { phase } = JSON.parse(String(init.body));
    return phase === "begin"
      ? Response.json({ error: "unavailable" }, { status: 503 })
      : Response.json({ settled: true });
  });
  const run = vi.fn();
  await expect(withFarmAuthority(input, run)).rejects.toThrow("FARM_PAID_AUTHORITY_UNAVAILABLE");
  expect(run).not.toHaveBeenCalled();
  expect(mocks.platformFetch).toHaveBeenCalledTimes(2);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("REGRESSION: preserves the domain failure when end settlement also fails", async () => {
  const domainError = new Error("FARM_DOMAIN_OPERATION_FAILED");
  mocks.platformFetch.mockImplementation(async (_url: URL, init: RequestInit) => {
    const { phase, operationId } = JSON.parse(String(init.body));
    return phase === "begin"
      ? Response.json({ operationId, effectivePaidCrystals: 10 })
      : Response.json({ error: "unavailable" }, { status: 503 });
  });
  const run = vi.fn(async () => { throw domainError; });
  // Expected safe behavior. This test should FAIL against the current implementation:
  // the finally block currently replaces domainError with the settlement error.
  await expect(withFarmAuthority(input, run)).rejects.toBe(domainError);
  expect(mocks.platformFetch).toHaveBeenCalledTimes(2);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("does not release the local authorization lock as reusable", async () => {
  mocks.dbQuery.mockRejectedValueOnce(new Error("FARM_LOCAL_REGISTRATION_FAILED"));
  await expect(withFarmAuthority(input, async () => "not-run")).rejects.toThrow("FARM_LOCAL_REGISTRATION_FAILED");
  expect(mocks.platformFetch).not.toHaveBeenCalled();
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("preserves begin failure when end fails, without invoking the domain action", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.platformFetch.mockResolvedValue(Response.json({ error: "unavailable" }, { status: 503 }));
  const run = vi.fn();
  await expect(withFarmAuthority(input, run)).rejects.toThrow("FARM_PAID_AUTHORITY_UNAVAILABLE");
  expect(run).not.toHaveBeenCalled();
  expect(mocks.platformFetch).toHaveBeenCalledTimes(2);
  expect(mocks.dbQuery).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledTimes(1);
  const diagnostic = JSON.parse(String(log.mock.calls[0]?.[0]));
  expect(diagnostic).toEqual({
    code: "FARM_AUTHORITY_CLEANUP_FAILED",
    primaryCode: "FARM_PAID_AUTHORITY_UNAVAILABLE",
    settlementCode: "FARM_PAID_AUTHORITY_UNAVAILABLE",
  });
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("does not leak arbitrary driver errors or credentials through cleanup diagnostics", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const secret = "DO_NOT_LOG_SECRET";
  mocks.platformFetch.mockImplementation(async (_url: URL, init: RequestInit) => {
    const { phase, operationId } = JSON.parse(String(init.body));
    return phase === "begin"
      ? Response.json({ operationId, effectivePaidCrystals: 10 })
      : Response.json({ error: "unavailable" }, { status: 503 });
  });
  const original = new Error("driver detail: " + secret);
  await expect(withFarmAuthority(input, async () => { throw original; })).rejects.toBe(original);
  const emitted = log.mock.calls.map((args) => args.join(" ")).join("\n");
  expect(emitted).toContain("FARM_AUTHORITY_CLEANUP_FAILED");
  expect(emitted).toContain("UNCLASSIFIED");
  expect(emitted).not.toContain(secret);
  expect(emitted).not.toContain(input.launchToken);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});
