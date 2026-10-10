import {
  startOfFarmDay,
  startOfFarmMonth,
  nextFarmMonthReset,
} from "./timeRuntime";
import {
  workshopState,
  settleWorkshopTimedRights,
  type WorkshopWarehouse,
} from "./workshopRuntime";
export const FORMATION_NAMES: Record<string, string> = {
  FORMATION_PREMIUM_V2: "太虛星河大陣",
  FORMATION_ATTEND: "天道酬勤",
  FORMATION_FESTIVAL_SPRING: "春節節慶護陣",
  FORMATION_FESTIVAL_MOON: "中秋節慶護陣",
  PROP_FORM_RPG_01: "九霄雷劫陣",
  PROP_FORM_RPG_02: "萬劍朝宗陣",
  PROP_FORM_RPG_03: "鎮岳玄天陣",
  PROP_FORM_RPG_04: "諸天星辰陣",
  PROP_FORM_EVENT_01: "萬象迎春陣",
  PROP_FORM_EVENT_02: "太陰月華陣",
  PROP_FORM_EVENT_03: "乾坤萬象陣",
};
export interface AttendanceState {
  monthStart: number;
  days: number[];
}
export function recordFarmAttendance(
  input: WorkshopWarehouse,
  now: number,
): WorkshopWarehouse {
  const w = settleWorkshopTimedRights(input, now),
    state = workshopState(w),
    monthStart = startOfFarmMonth(now),
    day = startOfFarmDay(now);
  let attendance = state.attendance ?? { monthStart, days: [] };
  let formations = [...(state.formations ?? [])];
  if (attendance.monthStart !== monthStart) {
    const next = nextFarmMonthReset(attendance.monthStart),
      days = Math.round((next - attendance.monthStart) / 86400000);
    if (
      monthStart === next &&
      new Set(attendance.days).size >= Math.ceil(days * 0.9)
    )
      formations = [
        ...formations.filter((f) => f.id !== "FORMATION_ATTEND"),
        { id: "FORMATION_ATTEND", expiresAt: nextFarmMonthReset(monthStart) },
      ];
    attendance = { monthStart, days: [] };
  }
  if (
    attendance.days.includes(day) &&
    formations.length === (state.formations ?? []).length
  )
    return w;
  attendance = { ...attendance, days: [...new Set([...attendance.days, day])] };
  return { ...w, workshop: { ...state, attendance, formations } };
}
export interface FestivalDefinition {
  id: string;
  startsAt: number;
  expiresAt: number;
  year: number;
}
export function redeemFestivalFormation(
  w: WorkshopWarehouse,
  definition: FestivalDefinition,
  now: number,
): WorkshopWarehouse {
  const year = new Date(now + 8 * 3600000).getUTCFullYear();
  if (
    !["FORMATION_FESTIVAL_SPRING", "FORMATION_FESTIVAL_MOON"].includes(
      definition.id,
    ) ||
    !Number.isFinite(definition.startsAt) ||
    !Number.isFinite(definition.expiresAt) ||
    definition.expiresAt <= definition.startsAt ||
    definition.year !== year ||
    now < definition.startsAt ||
    now >= definition.expiresAt
  )
    throw new Error("FORMATION_CODE_NOT_ACTIVE");
  const settled = settleWorkshopTimedRights(w, now),
    state = workshopState(settled),
    formations = state.formations ?? [];
  const old = formations.find((f) => f.id === definition.id);
  if (old && old.expiresAt === definition.expiresAt) return settled;
  return {
    ...w,
    workshop: {
      ...state,
      activeFormation: state.activeFormation ?? null,
      formations: [
        ...formations.filter((f) => f.id !== definition.id),
        { id: definition.id, expiresAt: definition.expiresAt },
      ],
    },
  };
}
export interface AchievementFormation {
  id: string;
  completed: boolean;
  expiresAt?: number | null;
}
export function grantAchievementFormations(
  w: WorkshopWarehouse,
  grants: AchievementFormation[],
  now: number,
): WorkshopWarehouse {
  const state = workshopState(settleWorkshopTimedRights(w, now));
  let formations = [...(state.formations ?? [])];
  for (const grant of grants) {
    const permanent = [
      "PROP_FORM_RPG_01",
      "PROP_FORM_RPG_02",
      "PROP_FORM_RPG_03",
      "PROP_FORM_RPG_04",
      "PROP_FORM_EVENT_03",
    ].includes(grant.id);
    const limited = ["PROP_FORM_EVENT_01", "PROP_FORM_EVENT_02"].includes(
      grant.id,
    );
    if (!permanent && !limited) throw new Error("INVALID_FORMATION_SOURCE");
    if (!grant.completed) continue;
    if (
      limited &&
      (!Number.isFinite(grant.expiresAt) || grant.expiresAt! <= now)
    )
      continue;
    if (permanent && grant.expiresAt != null)
      throw new Error("INVALID_FORMATION_SOURCE");
    if (
      formations.some(
        (f) =>
          f.id === grant.id &&
          (f.expiresAt === null || f.expiresAt === (grant.expiresAt ?? null)),
      )
    )
      continue;
    formations = [
      ...formations.filter((f) => f.id !== grant.id),
      { id: grant.id, expiresAt: permanent ? null : grant.expiresAt! },
    ];
  }
  return {
    ...w,
    workshop: {
      ...state,
      formations,
      activeFormation: state.activeFormation ?? null,
    },
  };
}
