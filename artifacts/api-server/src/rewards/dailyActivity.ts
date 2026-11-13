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

/**
 * Rebuild a day's progress from committed authoritative events.
 * The caller must load only events belonging to this user and activity day.
 * Sorting removes dependence on database row order; duplicate transaction IDs
 * never count twice, including when a retry reaches the same transaction.
 */
export function projectDailyActivity(
  assignedTasks: readonly DailyTask[],
  committedEvents: readonly VerifiedFarmEvent[],
): TaskProgress[] {
  if (assignedTasks.length !== 6 || new Set(assignedTasks.map(t => t.id)).size !== 6) {
    throw new Error('INVALID_ASSIGNED_TASKS');
  }
  const known = new Set(DAILY_TASK_POOL.map(t => t.id));
  if (assignedTasks.some(task => !known.has(task.id))) throw new Error('UNKNOWN_ASSIGNED_TASK');
  const transactions = new Map<string, VerifiedFarmEvent>();
  for (const event of committedEvents) {
    if (!event.transactionId || !Number.isSafeInteger(event.quantity) || event.quantity <= 0) {
      throw new Error('INVALID_VERIFIED_EVENT');
    }
    if (transactions.has(event.transactionId)) {
      const previous = transactions.get(event.transactionId)!;
      if (JSON.stringify(previous) !== JSON.stringify(event)) throw new Error('CONFLICTING_TRANSACTION_EVENT');
      continue;
    }
    transactions.set(event.transactionId, event);
  }
  let progress: TaskProgress[] = [];
  for (const event of [...transactions.values()].sort((a, b) => a.transactionId.localeCompare(b.transactionId))) {
    progress = applyVerifiedEvent(assignedTasks, progress, event);
  }
  return assignedTasks.map(task =>
    progress.find(item => item.taskId === task.id)
      ?? { taskId: task.id, count: 0, species: [], completed: false }
  );
}

/** Compute points only for the six tasks assigned to this player on this day. */
export function assignedDailyActivityPoints(
  assignedTasks: readonly DailyTask[],
  progress: readonly TaskProgress[],
): number {
  const assigned = new Set(assignedTasks.map(t => t.id));
  if (assigned.size !== 6) throw new Error('INVALID_ASSIGNED_TASKS');
  return Math.min(120, new Set(progress.filter(p => assigned.has(p.taskId) && p.completed).map(p => p.taskId)).size * 20);
}
