import { createHash } from "node:crypto";
import { DAILY_ACTIVITY } from "./farmV2Catalog";

/** Tasks are counters of authoritative server-side events, never client-reported completion. */
export const DAILY_ACTIVITY_TASK_POOL = [
  { id: "sow_1", event: "sow", target: 1, label: "播種 1 株" },
  { id: "sow_3", event: "sow", target: 3, label: "播種 3 株" },
  { id: "sow_5", event: "sow", target: 5, label: "播種 5 株" },
  { id: "harvest_1", event: "harvest", target: 1, label: "收成 1 株" },
  { id: "harvest_3", event: "harvest", target: 3, label: "收成 3 株" },
  { id: "harvest_5", event: "harvest", target: 5, label: "收成 5 株" },
  { id: "purchase_1", event: "seed_purchase", target: 1, label: "購買種子 1 次" },
  { id: "purchase_2", event: "seed_purchase", target: 2, label: "購買種子 2 次" },
  { id: "signin_1", event: "signin", target: 1, label: "完成今日簽到" },
  { id: "cave_1", event: "cave_visit", target: 1, label: "進入洞府 1 次" },
] as const;

export type DailyActivityEvent = (typeof DAILY_ACTIVITY_TASK_POOL)[number]["event"];

export function taipeiActivityDate(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_ACTIVITY_TIME");
  // Taipei has no daylight-saving offset. Shift five hours before extracting date.
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Stable per-player, per-day selection. No Math.random and no client authority. */
export function selectDailyActivityTasks(userId: string, day: string) {
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("INVALID_ACTIVITY_KEY");
  const scored = DAILY_ACTIVITY_TASK_POOL.map(task => ({
    task,
    score: createHash("sha256").update(JSON.stringify([userId, day, task.id])).digest("hex"),
  }));
  scored.sort((a, b) => a.score.localeCompare(b.score) || a.task.id.localeCompare(b.task.id));
  return scored.slice(0, DAILY_ACTIVITY.tasksPerDay).map(({ task }) => task);
}

export function activitySnapshot(
  tasks: ReturnType<typeof selectDailyActivityTasks>,
  counters: Partial<Record<DailyActivityEvent, number>>,
) {
  const progress = tasks.map(task => {
    const raw = counters[task.event] ?? 0;
    if (!Number.isSafeInteger(raw) || raw < 0) throw new Error("INVALID_ACTIVITY_COUNTER");
    return { ...task, progress: Math.min(raw, task.target), complete: raw >= task.target };
  });
  const points = Math.min(DAILY_ACTIVITY.maximumActivity,
    progress.filter(task => task.complete).length * DAILY_ACTIVITY.activityPerTask);
  return {
    points,
    tasks: progress,
    milestones: DAILY_ACTIVITY.milestones.map(m => ({
      ...m, eligible: points >= m.activity,
    })),
  };
}
