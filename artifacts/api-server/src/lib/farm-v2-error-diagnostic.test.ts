import { expect, it } from "vitest";
import { farmV2ErrorDiagnostic } from "./farm-v2-error-diagnostic";
it("logs only bounded codes, never SQL, parameters, tokens or driver messages", () => {
  const error = Object.assign(new Error("postgres://password@host private-token"), {
    cause: Object.assign(new Error("select private-value"), { code: "42501", query: "secret SQL" }),
  });
  expect(farmV2ErrorDiagnostic(error)).toEqual({ sqlState: "42501" });
  expect(farmV2ErrorDiagnostic(new Error("FARM_MUTATION_NOT_FOUND"))).toEqual({ domainCode: "FARM_MUTATION_NOT_FOUND" });
  expect(farmV2ErrorDiagnostic({ code: "password" })).toEqual({});
});
