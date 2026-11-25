import { pool } from "@workspace/db";
import { farmAuthorityPool } from "../lib/farm-v2-authority";
import { farmV2WalletJournalPool } from "../lib/farm-v2-wallet-saga";
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
  if (apply || args.includes("--authorization"))
    throw new Error("READ_ONLY_OPERATOR_REQUIRED");
  const user = value("--user"),
    request = value("--request");
  if (!user || !/^[A-Za-z0-9._:-]{1,120}$/.test(request))
    throw new Error("RECOVERY_IDENTITY_REQUIRED");
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const inspected = await client.query(
      "SELECT public.farm_v2_inspect_recovery($1::uuid,$2) AS result",
      [user, request],
    );
    await client.query("ROLLBACK");
    console.log(JSON.stringify(inspected.rows[0].result));
  } finally {
    client.release(true);
  }
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
