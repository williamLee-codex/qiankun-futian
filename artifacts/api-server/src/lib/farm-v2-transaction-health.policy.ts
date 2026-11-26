/**
 * Transaction health rules that need no connection: severity classification
 * and the operator gate.
 */
export type FarmV2HealthRow = {
  request_id: string;
  anomaly_type: string;
  severity: "NORMAL" | "MINOR" | "PENDING" | "MAJOR";
  wallet_scope: string | null;
  original_amount: number | null;
  compensated_amount: number | null;
  transaction_state: string;
  recovery_state: string | null;
  retry_count: number | null;
  anomaly_at: string;
  recovered_at: string | null;
  reason: string | null;
  user_repeat_count: string;
};

/** A normal shortage is usage, not a fault, and never counts as an incident. */
export const isFarmV2Fault = (row: { severity: string }) =>
  row.severity === "MAJOR" || row.severity === "PENDING";

/** Shared-secret operator gate. Unset means the surface is closed. */
export function farmV2OperatorKeyMatches(offered: string | undefined): boolean {
  const expected = process.env.FARM_V2_ADMIN_KEY ?? "";
  if (expected.length < 16 || !offered) return false;
  if (offered.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ offered.charCodeAt(i);
  return diff === 0;
}
