import { createHash } from "node:crypto";
import { DAILY_ACTIVITY } from "./farmV2Catalog";

/** Tasks are counters of authoritative server-side events, never client-reported completion. */
export const DAILY_ACTIVITY_TASK_POOL = [
  { id: "plant_once", event: "plant", target: 1, label: "播種 1 次" },
  { id: "plant_5", event: "plant", target: 5, label: "播種 5 株" },
  { id: "harvest_5", event: "harvest", target: 5, label: "收成 5 株" },
  { id: "buy_seeds_once", event: "buy_seeds", target: 1, label: "購買種子 1 次" },
  { id: "open_warehouse", event: "open_warehouse", target: 1, label: "開啟倉庫" },
  { id: "view_pet", event: "view_pet", target: 1, label: "查看靈寵" },
  { id: "visit_friend", event: "visit_friend", target: 1, label: "拜訪好友" },
  { id: "friend_interaction", event: "friend_interaction", target: 1, label: "好友互動 1 次" },
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
  const selected: (typeof DAILY_ACTIVITY_TASK_POOL)[number][] = [];
  for (const { task } of scored) {
    if (selected.length >= DAILY_ACTIVITY.tasksPerDay) break;
    // Existing SQL assignment validator forbids this combination.
    if (selected.some(t => (t.id === "open_warehouse" && task.id === "view_pet") ||
                           (t.id === "view_pet" && task.id === "open_warehouse"))) continue;
    selected.push(task);
  }
  if (selected.length !== DAILY_ACTIVITY.tasksPerDay) throw new Error("INSUFFICIENT_ACTIVITY_TASKS");
  return selected;
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
