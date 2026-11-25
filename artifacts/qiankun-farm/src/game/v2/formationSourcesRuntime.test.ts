import { expect, test } from "vitest";
import {
  recordFarmAttendance,
  redeemFestivalFormation,
  grantAchievementFormations,
} from "./formationSourcesRuntime";
import { createEmptyFarmWarehouse } from "./warehouseRuntime";
import { workshopState } from "./workshopRuntime";
const day = (month: number, n: number) => Date.UTC(2026, month - 1, n, 0);
test("FORMATION-ATTEND-003/004/005: distinct server days grant next month only and expire without fallback", () => {
  let w = createEmptyFarmWarehouse();
  for (let n = 1; n <= 28; n++) w = recordFarmAttendance(w, day(10, n));
  const repeat = recordFarmAttendance(w, day(10, 28));
  expect(repeat).toEqual(w);
  expect(workshopState(w).formations ?? []).toEqual([]);
  w = recordFarmAttendance(w, day(11, 1));
  expect(workshopState(w).formations).toEqual([
    { id: "FORMATION_ATTEND", expiresAt: Date.UTC(2026, 10, 30, 21) },
  ]);
  expect(workshopState(w).activeFormation ?? null).toBe(null);
});
test("FORMATION-FEST-002: official annual code window, idempotent right, expired code cannot grant", () => {
  const w = createEmptyFarmWarehouse(),
    definition = {
      id: "FORMATION_FESTIVAL_SPRING",
      startsAt: day(2, 1),
      expiresAt: day(2, 10),
      year: 2026,
    };
  const got = redeemFestivalFormation(w, definition, day(2, 2));
  expect(redeemFestivalFormation(got, definition, day(2, 2))).toEqual(got);
  expect(() => redeemFestivalFormation(w, definition, day(2, 10))).toThrow(
    "FORMATION_CODE_NOT_ACTIVE",
  );
  expect(() =>
    redeemFestivalFormation(w, { ...definition, year: 2025 }, day(2, 2)),
  ).toThrow("FORMATION_CODE_NOT_ACTIVE");
});
test("FORMATION-RPG-PROP-005: only explicit completed trusted mappings grant permanent rights", () => {
  const w = createEmptyFarmWarehouse();
  const got = grantAchievementFormations(
    w,
    [{ id: "PROP_FORM_RPG_01", completed: true }],
    day(10, 1),
  );
  expect(workshopState(got).formations).toEqual([
    { id: "PROP_FORM_RPG_01", expiresAt: null },
  ]);
  expect(grantAchievementFormations(got, [], day(10, 2))).toEqual(got);
  expect(() =>
    grantAchievementFormations(
      w,
      [{ id: "made-up", completed: true }],
      day(10, 1),
    ),
  ).toThrow("INVALID_FORMATION_SOURCE");
});

test("attendance thresholds for 28/29/30/31 day months, expiry removes equipped right without fallback", () => {
  for (const [year, month, length, threshold] of [
    [2026, 2, 28, 26],
    [2028, 2, 29, 27],
    [2026, 4, 30, 27],
    [2026, 10, 31, 28],
  ]) {
    for (const count of [threshold - 1, threshold]) {
      let w = createEmptyFarmWarehouse();
      for (let n = 1; n <= count; n++)
        w = recordFarmAttendance(w, Date.UTC(year, month - 1, n));
      w = recordFarmAttendance(w, Date.UTC(year, month, 1));
      expect(
        workshopState(w).formations?.some((f) => f.id === "FORMATION_ATTEND") ??
          false,
      ).toBe(count === threshold);
      if (count === threshold) {
        w = {
          ...w,
          workshop: {
            ...workshopState(w),
            activeFormation: "FORMATION_ATTEND",
          },
        };
        w = recordFarmAttendance(w, Date.UTC(year, month + 1, 1));
        expect(workshopState(w).activeFormation).toBeNull();
        expect(
          workshopState(w).formations?.some((f) => f.id === "FORMATION_ATTEND"),
        ).toBe(false);
      }
      expect(length).toBeGreaterThanOrEqual(threshold);
    }
  }
});
