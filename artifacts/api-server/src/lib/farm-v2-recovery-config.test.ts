import { describe, expect, it } from "vitest";
import {
  readFarmV2RecoveryConfig,
  recoveryBackoffSeconds,
} from "./farm-v2-recovery-config";

describe("recovery retry configuration", () => {
  it("uses documented defaults when nothing is configured", () => {
    expect(readFarmV2RecoveryConfig({})).toEqual({
      leaseSeconds: 60,
      batch: 10,
      maxAttempts: 8,
      backoffSeconds: 30,
      maxBackoffSeconds: 3600,
    });
  });

  it("takes every timing from configuration", () => {
    expect(
      readFarmV2RecoveryConfig({
        FARM_V2_RECOVERY_LEASE_SECONDS: "120",
        FARM_V2_RECOVERY_BATCH: "25",
        FARM_V2_RECOVERY_MAX_ATTEMPTS: "4",
        FARM_V2_RECOVERY_BACKOFF_SECONDS: "45",
        FARM_V2_RECOVERY_MAX_BACKOFF_SECONDS: "900",
      }),
    ).toEqual({
      leaseSeconds: 120,
      batch: 25,
      maxAttempts: 4,
      backoffSeconds: 45,
      maxBackoffSeconds: 900,
    });
  });

  it("keeps unsafe or malformed values inside their bounds", () => {
    expect(
      readFarmV2RecoveryConfig({
        FARM_V2_RECOVERY_LEASE_SECONDS: "0",
        FARM_V2_RECOVERY_BATCH: "1000",
        FARM_V2_RECOVERY_MAX_ATTEMPTS: "0",
        FARM_V2_RECOVERY_BACKOFF_SECONDS: "nonsense",
      }),
    ).toEqual({
      leaseSeconds: 5,
      batch: 100,
      maxAttempts: 1,
      backoffSeconds: 30,
      maxBackoffSeconds: 3600,
    });
  });

  it("backs off exponentially and caps the wait", () => {
    const config = { backoffSeconds: 30, maxBackoffSeconds: 600 };
    expect([1, 2, 3, 4, 5, 6].map((n) => recoveryBackoffSeconds(n, config))).toEqual([
      30, 60, 120, 240, 480, 600,
    ]);
  });
});
