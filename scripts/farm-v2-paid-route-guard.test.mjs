import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../artifacts/api-server/src/routes/farm-v2.ts", import.meta.url), "utf8");
const paidAccess = readFileSync(new URL("../artifacts/api-server/src/lib/farm-v2-paid-access.ts", import.meta.url), "utf8");
const idempotency = readFileSync(new URL("../artifacts/api-server/src/lib/farm-v2-idempotency.ts", import.meta.url), "utf8");

function routeBody(method, path) {
  const start = route.indexOf(`router.${method}("${path}", async (req, res, next) => {`);
  assert.notEqual(start, -1, `route missing: ${method} ${path}`);
  const next = route.indexOf("\nrouter.", start + 1);
  return route.slice(start, next < 0 ? undefined : next);
}

test("paid gameplay routes refresh Core qualification before mutation", () => {
  const cases = [
    ["post", "/farm/v2/lands/:landId/sow", "sowFarmV2Land("],
    ["post", "/farm/v2/lands/:landId/harvest", "harvestFarmV2Land("],
    ["post", "/farm/v2/seeds/:landId/purchase", "purchaseFarmV2SeedPacks("],
    ["post", "/farm/v2/crops/:landId/exchange", "exchangeFarmV2Crops("],
  ];
  for (const [method, path, mutation] of cases) {
    const body = routeBody(method, path);
    const refresh = body.indexOf("await reconcileFarmV2PaidAccessFromCore(");
    const action = body.indexOf("await " + mutation);
    assert.ok(refresh >= 0, `missing refresh: ${path}`);
    assert.ok(action > refresh, `refresh must precede mutation: ${path}`);
  }
});

test("Core refresh reexecutes on repeated refresh request ID", () => {
  assert.match(paidAccess, /refreshCompleted:\s*true/);
  assert.match(idempotency, /if \(input\.refreshCompleted\)/);
  assert.match(idempotency, /const refreshed = await input\.execute\(tx\)/);
});

test("Core authority is fetched after the Farm player row lock", () => {
  const lock = paidAccess.lastIndexOf('.for("update")', paidAccess.indexOf("await fetchFarmV2CorePaidQualification(input.launchToken)"));
  const fetch = paidAccess.indexOf("await fetchFarmV2CorePaidQualification(input.launchToken)");
  assert.ok(lock >= 0 && fetch > lock);
});

test("KNOWN GAP: paid refresh and gameplay remain separate transactions", () => {
  const sow = routeBody("post", "/farm/v2/lands/:landId/sow");
  assert.match(sow, /await reconcileFarmV2PaidAccessFromCore\(/);
  assert.match(sow, /await sowFarmV2Land\(/);
  assert.match(paidAccess, /return runFarmV2IdempotentMutation\(/);
  // Characterization only: does not prove atomicity across Core and Farm.
});
