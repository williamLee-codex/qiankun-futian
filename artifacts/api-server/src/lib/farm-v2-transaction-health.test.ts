import { afterEach, describe, expect, it, vi } from "vitest";
import {
  farmV2OperatorKeyMatches,
  isFarmV2Fault,
} from "./farm-v2-transaction-health.policy";

describe("operator gate for transaction health", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is closed when no operator key is configured", () => {
    vi.stubEnv("FARM_V2_ADMIN_KEY", "");
    expect(farmV2OperatorKeyMatches("anything")).toBe(false);
  });

  it("refuses a short key so a guessable secret cannot open the surface", () => {
    vi.stubEnv("FARM_V2_ADMIN_KEY", "short");
    expect(farmV2OperatorKeyMatches("short")).toBe(false);
  });

  it("accepts only the exact operator key", () => {
    vi.stubEnv("FARM_V2_ADMIN_KEY", "operator-key-0123456789");
    expect(farmV2OperatorKeyMatches("operator-key-0123456789")).toBe(true);
    expect(farmV2OperatorKeyMatches("operator-key-0123456788")).toBe(false);
    expect(farmV2OperatorKeyMatches("operator-key-01234567890")).toBe(false);
    expect(farmV2OperatorKeyMatches(undefined)).toBe(false);
  });
});

describe("fault classification", () => {
  it("keeps a normal resource shortage out of the fault list", () => {
    expect(isFarmV2Fault({ severity: "NORMAL" })).toBe(false);
  });

  it("counts an unrecovered or unconfirmed request as a fault", () => {
    expect(isFarmV2Fault({ severity: "MAJOR" })).toBe(true);
    expect(isFarmV2Fault({ severity: "PENDING" })).toBe(true);
  });
});
