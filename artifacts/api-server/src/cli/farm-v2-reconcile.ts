import { pool } from "@workspace/db";
import { farmAuthorityPool } from "../lib/farm-v2-authority";
import { farmV2WalletJournalPool } from "../lib/farm-v2-wallet-saga";
import {
  reconcileFarmWallet,
  fenceFarmAuthorization,
  type CoreOperatorRpc,
} from "../lib/farm-v2-reconciliation";
const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  return index < 0 ? "" : (args[index + 1] ?? "");
};
const apply = args.includes("--apply");
async function main() {
  if (args.includes("--list")) {
    const cases = (
      await pool.query(
        "select id,user_id,request_id,status,resolution,updated_at from farm_v2_reconciliation_case where status<>'CLOSED' order by created_at",
      )
    ).rows;
    const attempts = (
      await pool.query(
        "select id,user_id,request_id,state,created_at from farm_v2_authorization_attempt where core_settled_at is null order by created_at",
      )
    ).rows;
    const mutations = (
      await pool.query(
        "select user_id,request_id,action,transaction_state,updated_at from farm_v2_mutation where response is null order by created_at",
      )
    ).rows;
    console.log(JSON.stringify({ cases, attempts, mutations }));
    return;
  }
  const input = {
    userId: value("--user"),
    requestId: value("--request"),
    caseId: value("--case"),
    actor: value("--actor"),
    evidence: value("--evidence"),
    apply,
  };
  if (apply && value("--confirm-case") !== input.caseId)
    throw new Error("RECONCILIATION_CONFIRMATION_REQUIRED");
  const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("INVALID_CORE_OPERATOR_ORIGIN");
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("CORE_OPERATOR_NOT_CONFIGURED");
  const core: CoreOperatorRpc = async (name, body) => {
    const response = await fetch(new URL("/rest/v1/rpc/" + name, base), {
      method: "POST",
      headers: {
        apikey: secret,
        Authorization: "Bearer " + secret,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("CORE_OPERATOR_UNAVAILABLE");
    return response.status === 204 ? null : response.json();
  };
  const result = args.includes("--authorization")
    ? await fenceFarmAuthorization(
        { ...input, operationId: value("--authorization") },
        core,
      )
    : await reconcileFarmWallet(input, core);
  console.log(JSON.stringify(result));
}
main()
  .catch((error) => {
    const code =
      error instanceof Error && /^[A-Z_]{1,80}$/.test(error.message)
        ? error.message
        : "RECONCILIATION_FAILED";
    console.error(JSON.stringify({ error: code }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([
      pool.end(),
      farmAuthorityPool.end(),
      farmV2WalletJournalPool.end(),
    ]);
  });
