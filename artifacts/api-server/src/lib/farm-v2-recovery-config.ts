/**
 * Recovery retry policy and timings. Kept free of any database import so the
 * schedule maths can be checked without a connection.
 */
export type FarmV2RecoveryConfig = {
  leaseSeconds: number;
  batch: number;
  maxAttempts: number;
  backoffSeconds: number;
  maxBackoffSeconds: number;
};

const int = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
};
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** Retry timings are configuration, never a fixed operating policy. */
export function readFarmV2RecoveryConfig(
  env: Record<string, string | undefined> = process.env,
): FarmV2RecoveryConfig {
  return {
    leaseSeconds: clamp(int(env.FARM_V2_RECOVERY_LEASE_SECONDS, 60), 5, 3600),
    batch: clamp(int(env.FARM_V2_RECOVERY_BATCH, 10), 1, 100),
    maxAttempts: clamp(int(env.FARM_V2_RECOVERY_MAX_ATTEMPTS, 8), 1, 100),
    backoffSeconds: clamp(int(env.FARM_V2_RECOVERY_BACKOFF_SECONDS, 30), 1, 86400),
    maxBackoffSeconds: clamp(
      int(env.FARM_V2_RECOVERY_MAX_BACKOFF_SECONDS, 3600),
      1,
      86400,
    ),
  };
}

/** Exponential backoff, capped, so a broken dependency is not hammered. */
export function recoveryBackoffSeconds(
  attempts: number,
  config: Pick<FarmV2RecoveryConfig, "backoffSeconds" | "maxBackoffSeconds">,
): number {
  const exponent = Math.max(attempts - 1, 0);
  return Math.min(
    config.backoffSeconds * 2 ** exponent,
    config.maxBackoffSeconds,
  );
}


export type FarmV2RecoverySweepResult = {
  claimed: number;
  done: number;
  retried: number;
  abandoned: number;
  failed: number;
};
