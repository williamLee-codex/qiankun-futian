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

it("does not call Core end when local settlement updates zero rows", async () => {
  mocks.dbQuery.mockResolvedValueOnce({ rowCount: 1 });
  mocks.dbQuery.mockResolvedValueOnce({ rowCount: 0 });
  await expect(withFarmAuthority(input, async () => "domain-complete"))
    .rejects.toThrow("FARM_LOCAL_SETTLEMENT_NOT_CONFIRMED");
  const phases = mocks.platformFetch.mock.calls.map(([_url, init]: [URL, RequestInit]) =>
    JSON.parse(String(init.body)).phase,
  );
  expect(phases).toEqual(["begin"]);
  expect(mocks.dbQuery.mock.calls.some(([sql]: [string]) =>
    sql.includes("core_settled_at=now()"))).toBe(false);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("does not acknowledge Core end when local settlement update throws", async () => {
  mocks.dbQuery.mockResolvedValueOnce({ rowCount: 1 });
  mocks.dbQuery.mockRejectedValueOnce(new Error("FARM_LOCAL_SETTLEMENT_FAILED"));
  await expect(withFarmAuthority(input, async () => "domain-complete"))
    .rejects.toThrow("FARM_LOCAL_SETTLEMENT_FAILED");
  const phases = mocks.platformFetch.mock.calls.map(([_url, init]: [URL, RequestInit]) =>
    JSON.parse(String(init.body)).phase,
  );
  expect(phases).toEqual(["begin"]);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("does not mark Core settled when end returns HTTP 503", async () => {
  mocks.platformFetch.mockImplementation(async (_url: URL, init: RequestInit) => {
    const { phase, operationId } = JSON.parse(String(init.body));
    return phase === "begin"
      ? Response.json({ operationId, effectivePaidCrystals: 10 })
      : Response.json({ error: "unavailable" }, { status: 503 });
  });
  await expect(withFarmAuthority(input, async () => "domain-complete"))
    .rejects.toThrow("FARM_PAID_AUTHORITY_UNAVAILABLE");
  expect(mocks.dbQuery.mock.calls.some(([sql]: [string]) =>
    sql.includes("core_settled_at=now()"))).toBe(false);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("rejects HTTP 200 without Core settled acknowledgement", async () => {
  mocks.platformFetch.mockImplementation(async (_url: URL, init: RequestInit) => {
    const { phase, operationId } = JSON.parse(String(init.body));
    return phase === "begin"
      ? Response.json({ operationId, effectivePaidCrystals: 10 })
      : Response.json({ settled: false });
  });
  await expect(withFarmAuthority(input, async () => "domain-complete"))
    .rejects.toThrow("FARM_PAID_AUTHORITY_UNAVAILABLE");
  expect(mocks.dbQuery.mock.calls.some(([sql]: [string]) =>
    sql.includes("core_settled_at=now()"))).toBe(false);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("rejects mismatched operation ID from Core begin", async () => {
  mocks.platformFetch.mockImplementation(async (_url: URL, init: RequestInit) => {
    const { phase, operationId } = JSON.parse(String(init.body));
    return phase === "begin"
      ? Response.json({ operationId: 'incorrect-operation-id', effectivePaidCrystals: 10 })
      : Response.json({ settled: true });
  });
  const run = vi.fn(async () => "should-not-run");
  await expect(withFarmAuthority(input, run)).rejects.toThrow("INVALID_FARM_PAID_AUTHORIZATION");
  expect(run).not.toHaveBeenCalled();
  expect(mocks.platformFetch).toHaveBeenCalledTimes(2);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("rejects negative paid crystals from Core begin", async () => {
  mocks.platformFetch.mockImplementation(async (_url: URL, init: RequestInit) => {
    const { phase, operationId } = JSON.parse(String(init.body));
    return phase === "begin"
      ? Response.json({ operationId, effectivePaidCrystals: -1 })
      : Response.json({ settled: true });
  });
  const run = vi.fn(async () => "should-not-run");
  await expect(withFarmAuthority(input, run)).rejects.toThrow("INVALID_FARM_PAID_AUTHORIZATION");
  expect(run).not.toHaveBeenCalled();
  expect(mocks.platformFetch).toHaveBeenCalledTimes(2);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("rejects fractional paid crystals from Core begin", async () => {
  mocks.platformFetch.mockImplementation(async (_url: URL, init: RequestInit) => {
    const { phase, operationId } = JSON.parse(String(init.body));
    return phase === "begin"
      ? Response.json({ operationId, effectivePaidCrystals: 1.5 })
      : Response.json({ settled: true });
  });
  const run = vi.fn(async () => "should-not-run");
  await expect(withFarmAuthority(input, run)).rejects.toThrow("INVALID_FARM_PAID_AUTHORIZATION");
  expect(run).not.toHaveBeenCalled();
  expect(mocks.platformFetch).toHaveBeenCalledTimes(2);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("rejects overflow paid crystals from Core begin", async () => {
  mocks.platformFetch.mockImplementation(async (_url: URL, init: RequestInit) => {
    const { phase, operationId } = JSON.parse(String(init.body));
    return phase === "begin"
      ? Response.json({ operationId, effectivePaidCrystals: 2147483648 })
      : Response.json({ settled: true });
  });
  const run = vi.fn(async () => "should-not-run");
  await expect(withFarmAuthority(input, run)).rejects.toThrow("INVALID_FARM_PAID_AUTHORIZATION");
  expect(run).not.toHaveBeenCalled();
  expect(mocks.platformFetch).toHaveBeenCalledTimes(2);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("preserves domain failure if local settlement SQL also fails", async () => {
  const domainError = new Error("FARM_DOMAIN_OPERATION_FAILED");
  mocks.dbQuery.mockResolvedValueOnce({ rowCount: 1 });
  mocks.dbQuery.mockRejectedValueOnce(new Error("FARM_LOCAL_SETTLEMENT_FAILED"));
  await expect(withFarmAuthority(input, async () => { throw domainError; }))
    .rejects.toBe(domainError);
  const phases = mocks.platformFetch.mock.calls.map(([_url, init]: [URL, RequestInit]) =>
    JSON.parse(String(init.body)).phase,
  );
  expect(phases).toEqual(["begin"]);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

for (const rowCount of [2, -1]) {
  it(`rejects unexpected local settlement rowCount ${rowCount}`, async () => {
    mocks.dbQuery.mockResolvedValueOnce({ rowCount: 1 });
    mocks.dbQuery.mockResolvedValueOnce({ rowCount });
    await expect(withFarmAuthority(input, async () => "completed"))
      .rejects.toThrow("FARM_LOCAL_SETTLEMENT_NOT_CONFIRMED");
    expect(mocks.platformFetch).toHaveBeenCalledTimes(1);
    expect(mocks.client.release).toHaveBeenCalledWith(true);
  });
}

it("preserves domain error when local settlement updates two rows", async () => {
  const original = new Error("FARM_DOMAIN_OPERATION_FAILED");
  mocks.dbQuery.mockResolvedValueOnce({ rowCount: 1 });
  mocks.dbQuery.mockResolvedValueOnce({ rowCount: 2 });
  await expect(withFarmAuthority(input, async () => { throw original; }))
    .rejects.toBe(original);
  expect(mocks.platformFetch).toHaveBeenCalledTimes(1);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});

it("rejects missing local Core settlement receipt after successful Core end", async () => {
  mocks.dbQuery.mockResolvedValueOnce({ rowCount: 1 });
  mocks.dbQuery.mockResolvedValueOnce({ rowCount: 1 });
  mocks.dbQuery.mockResolvedValueOnce({ rowCount: 0 });
  await expect(withFarmAuthority(input, async () => "domain-complete"))
    .rejects.toThrow("FARM_CORE_SETTLEMENT_RECEIPT_NOT_CONFIRMED");
  const phases = mocks.platformFetch.mock.calls.map(([_url, init]: [URL, RequestInit]) =>
    JSON.parse(String(init.body)).phase,
  );
  expect(phases).toEqual(["begin", "end"]);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});
