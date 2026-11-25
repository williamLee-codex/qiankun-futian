import { describe, expect, it } from "vitest";
import { planBackgroundRecovery } from "./backgroundRecovery";

describe("planBackgroundRecovery", () => {
  it("waits until the scheduled time", () => {
    expect(planBackgroundRecovery({ attempts: 1, permanent: false, nextAt: 2000, now: 1000 })).toEqual({ action: "idle" });
  });

  it("backs off exponentially from five seconds", () => {
    expect(planBackgroundRecovery({ attempts: 0, permanent: false, nextAt: null, now: 0 })).toEqual({ action: "retry", attempt: 1, delayMs: 5000 });
    expect(planBackgroundRecovery({ attempts: 3, permanent: false, nextAt: null, now: 0 })).toEqual({ action: "retry", attempt: 4, delayMs: 40000 });
  });

  it("caps the delay at five minutes", () => {
    expect(planBackgroundRecovery({ attempts: 7, permanent: false, nextAt: null, now: 0 })).toEqual({ action: "retry", attempt: 8, delayMs: 300000 });
  });

  it("never retries a permanent failure", () => {
    expect(planBackgroundRecovery({ attempts: 0, permanent: true, nextAt: null, now: 0 })).toEqual({ action: "give_up", reason: "permanent" });
  });

  it("gives up after eight attempts", () => {
    expect(planBackgroundRecovery({ attempts: 8, permanent: false, nextAt: null, now: 0 })).toEqual({ action: "give_up", reason: "attempts_exhausted" });
  });
});
