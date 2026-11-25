import { describe, expect, it } from "vitest";
import { planCompensation } from "./coinCompensation";

const base = { requestId: "r-1", wallet: "central" as const, amount: 50, coreApplied: true, farmApplied: true };

describe("planCompensation", () => {
  it("does nothing when both sides agree", () => {
    expect(planCompensation(base)).toEqual({ action: "none", why: "balanced" });
  });

  it("reverses the core debit exactly once when the farm leg is missing", () => {
    const decision = planCompensation({ ...base, farmApplied: false });
    expect(decision).toEqual({
      action: "compensate",
      entry: {
        idempotencyKey: "compensate:r-1:central",
        wallet: "central",
        amount: 50,
        reason: "core_debited_farm_missing",
      },
    });
  });

  it("keeps the key stable so a retry cannot pay twice", () => {
    const a = planCompensation({ ...base, farmApplied: false });
    const b = planCompensation({ ...base, farmApplied: false });
    expect(a).toEqual(b);
  });

  it("escalates instead of guessing when the amount is unusable", () => {
    expect(planCompensation({ ...base, amount: null, farmApplied: false })).toEqual({
      action: "escalate", why: "ambiguous_amount",
    });
    expect(planCompensation({ ...base, amount: 0, farmApplied: false })).toEqual({
      action: "escalate", why: "ambiguous_amount",
    });
  });

  it("escalates when neither side recorded the transfer", () => {
    expect(planCompensation({ ...base, coreApplied: false, farmApplied: false })).toEqual({
      action: "escalate", why: "unknown_direction",
    });
  });
});
