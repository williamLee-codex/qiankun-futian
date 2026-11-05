import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() };
  return { client, connect: vi.fn(async () => client), end: vi.fn() };
});
vi.mock("@workspace/db", () => ({
  createDatabaseConnection: () => ({ pool: { connect: mocks.connect, end: mocks.end } }),
  pool: { query: vi.fn() },
}));
vi.mock("./farm-v2-authority", () => ({
  farmAuthorityLockKey: (userId: string) => "farm-v2-authority:" + userId,
}));
import { fenceFarmAuthorization } from "./farm-v2-reconciliation";

const input = {
  userId: "user-1",
  operationId: "operation-1",
  requestId: "request-1",
  caseId: "case-1",
  actor: "operator-1",
  evidence: "verified-evidence",
  apply: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("select * from farm_v2_authorization_attempt"))
      return { rows: [{ id: input.operationId, user_id: input.userId }] };
    if (sql.startsWith("select id from farm_v2_reconciliation_case"))
      return { rows: [{ id: input.caseId }] };
    return { rowCount: 1, rows: [] };
  });
});

it("rolls back and never closes the case if Core receipt updates zero rows", async () => {
  mocks.client.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("select * from farm_v2_authorization_attempt"))
      return { rows: [{ id: input.operationId, user_id: input.userId }] };
    if (sql.startsWith("select id from farm_v2_reconciliation_case"))
      return { rows: [{ id: input.caseId }] };
    if (sql.includes("set core_settled_at=now()"))
      return { rowCount: 0 };
    return { rowCount: 1, rows: [] };
  });
  const core = vi.fn(async () => ({ settled: true }));
  await expect(fenceFarmAuthorization(input, core))
    .rejects.toThrow("FARM_CORE_SETTLEMENT_RECEIPT_NOT_CONFIRMED");
  expect(core).toHaveBeenCalledTimes(1);
  expect(mocks.client.query.mock.calls.some(([sql]: [string]) =>
    sql.includes("set status='CLOSED'"))).toBe(false);
  expect(mocks.client.query.mock.calls.some(([sql]: [string]) => sql === "ROLLBACK")).toBe(true);
  expect(mocks.client.query.mock.calls.some(([sql]: [string]) => sql === "COMMIT")).toBe(false);
  expect(mocks.client.release).toHaveBeenCalledWith(true);
  expect(mocks.end).toHaveBeenCalledTimes(1);
});

it("commits the authorization fence only after a one-row receipt", async () => {
  const core = vi.fn(async () => ({ settled: true }));
  await expect(fenceFarmAuthorization(input, core))
    .resolves.toEqual({ status: "CLOSED", resolution: "AUTHORIZATION_FENCED" });
  const sqls = mocks.client.query.mock.calls.map(([sql]: [string]) => sql);
  const receiptIndex = sqls.findIndex((sql: string) => sql.includes("set core_settled_at=now()"));
  const closeIndex = sqls.findIndex((sql: string) => sql.includes("set status='CLOSED'"));
  expect(receiptIndex).toBeGreaterThan(-1);
  expect(closeIndex).toBeGreaterThan(receiptIndex);
  expect(sqls).toContain("COMMIT");
  expect(mocks.client.release).toHaveBeenCalledWith(true);
});
