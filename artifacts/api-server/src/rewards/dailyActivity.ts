import { DAILY_TASK_POOL, type DailyTask, type DailyTaskEvent } from './dailyTaskPool';

/**
 * Activity day is defined in Asia/Taipei (UTC+08), starting at 05:00.
 * Return YYYY-MM-DD of the activity day, not the civil date.
 */
export function taipeiActivityDay(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new Error('INVALID_DATE');
  const shifted = new Date(now.getTime() + 8 * 60 * 60_000 - 5 * 60 * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export type VerifiedFarmEvent = Readonly<{
  /** Stable ID from an already committed, server-verified game transaction. */
  transactionId: string;
  event: DailyTaskEvent;
  quantity: number;
  speciesId?: string;
}>;

export type TaskProgress = Readonly<{
  taskId: string;
  count: number;
  species: readonly string[];
  completed: boolean;
}>;

/** Pure projection; callers must deduplicate transaction IDs in the database. */
export function applyVerifiedEvent(
  tasks: readonly DailyTask[],
  progress: readonly TaskProgress[],
  event: VerifiedFarmEvent,
): TaskProgress[] {
  if (!event.transactionId || !Number.isSafeInteger(event.quantity) || event.quantity <= 0) {
    throw new Error('INVALID_VERIFIED_EVENT');
  }
  const byId = new Map(progress.map(p => [p.taskId, p]));
  return tasks.map(task => {
    const prior = byId.get(task.id) ?? { taskId: task.id, count: 0, species: [], completed: false };
    if (task.event !== event.event || prior.completed) return prior;
    const species = task.metric === 'distinct_species' && event.speciesId
      ? [...new Set([...prior.species, event.speciesId])]
      : [...prior.species];
    const count = task.metric === 'distinct_species'
      ? species.length
      : prior.count + (task.metric === 'quantity' ? event.quantity : 1);
    return { taskId: task.id, count, species, completed: count >= task.target };
  });
}

export function dailyActivityPoints(progress: readonly TaskProgress[]): number {
  const known = new Set(DAILY_TASK_POOL.map(task => task.id));
  const unique = new Set(progress.filter(p => known.has(p.taskId) && p.completed).map(p => p.taskId));
  return Math.min(120, unique.size * 20);
}

export function claimableMilestones(
  points: number,
  claimed: readonly number[],
): readonly number[] {
  if (!Number.isInteger(points) || points < 0 || points > 120) throw new Error('INVALID_ACTIVITY');
  return [30, 60, 100].filter(threshold => points >= threshold && !claimed.includes(threshold));
}
