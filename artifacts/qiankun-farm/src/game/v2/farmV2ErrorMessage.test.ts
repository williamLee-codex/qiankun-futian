import { test, expect } from "vitest";
import { farmV2ErrorMessage as message } from "./farmV2ErrorMessage";
test("authentication failures explain re-login", () =>
  expect(message("FARM_SESSION_EXPIRED")).toContain("重新登入"));
test("timeouts and unknown results preserve original-key retry instructions", () => {
  for (const code of [
    "FARM_REQUEST_RESULT_UNKNOWN",
    "FARM_PAID_AUTHORITY_UNAVAILABLE",
    "55P03",
    "The operation was aborted due to timeout",
    "Failed to fetch",
  ])
    expect(message(code)).toContain("沿用原請求鍵");
});
test("unresolved recovery does not pretend failure or encourage a new transaction", () =>
  expect(message("PERMANENT_MUTATION_RECOVERY_FAILURE")).toContain(
    "保留原請求",
  ));
test("confirmed compensation is distinct and unknown internal errors are not exposed", () => {
  expect(message("FARM_MUTATION_COMPENSATED")).toContain("已補償");
  expect(message("private server detail")).not.toContain("private");
});
