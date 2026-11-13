/**
 * Farm V2 daily activity pool: 17 canonical tasks, eight categories.
 * The server must persist each player's six task IDs per Taipei 05:00 day.
 * This module only selects tasks; it never grants currency or items.
 */
export type DailyTaskEvent =
  | 'plant' | 'harvest' | 'buy_seeds' | 'synthesize_pot' | 'place_pot'
  | 'open_warehouse' | 'feed_pet' | 'view_pet' | 'friend_interaction'
  | 'visit_friend';

export type DailyTask = Readonly<{
  id: string;
  category: string;
  title: string;
  event: DailyTaskEvent;
  target: number;
  metric: 'count' | 'quantity' | 'distinct_species';
  feature?: 'pets' | 'friends' | 'synthesis' | 'pots';
  exclusiveGroup?: 'plant_threshold' | 'harvest_threshold' | 'seed_quantity_threshold';
  clickOnly?: boolean;
}>;

export const DAILY_TASK_POOL: readonly DailyTask[] = [
  { id:'plant_once', category:'播種', title:'初試耕耘', event:'plant', target:1, metric:'count' },
  { id:'buy_seeds_5', category:'種子', title:'種子小補給', event:'buy_seeds', target:5, metric:'quantity', exclusiveGroup:'seed_quantity_threshold' },
  { id:'plant_5', category:'播種', title:'播種新手', event:'plant', target:5, metric:'quantity', exclusiveGroup:'plant_threshold' },
  { id:'plant_10', category:'播種', title:'勤勞耕種', event:'plant', target:10, metric:'quantity', exclusiveGroup:'plant_threshold' },
  { id:'harvest_5', category:'收成', title:'小小豐收', event:'harvest', target:5, metric:'quantity', exclusiveGroup:'harvest_threshold' },
  { id:'harvest_10', category:'收成', title:'豐收喜悅', event:'harvest', target:10, metric:'quantity', exclusiveGroup:'harvest_threshold' },
  { id:'buy_seeds_once', category:'種子', title:'種子補給', event:'buy_seeds', target:1, metric:'count' },
  { id:'buy_seeds_10', category:'種子', title:'種子儲備', event:'buy_seeds', target:10, metric:'quantity', exclusiveGroup:'seed_quantity_threshold' },
  { id:'synthesize_pot', category:'盆栽', title:'靈植巧匠', event:'synthesize_pot', target:1, metric:'count', feature:'synthesis' },
  { id:'place_pot', category:'盆栽', title:'盆栽整理', event:'place_pot', target:1, metric:'count', feature:'pots' },
  { id:'open_warehouse', category:'倉庫', title:'倉庫巡查', event:'open_warehouse', target:1, metric:'count', clickOnly:true },
  { id:'feed_pet', category:'靈寵', title:'靈寵照料', event:'feed_pet', target:1, metric:'count', feature:'pets' },
  { id:'view_pet', category:'靈寵', title:'靈寵關懷', event:'view_pet', target:1, metric:'count', feature:'pets', clickOnly:true },
  { id:'friend_interaction', category:'好友', title:'好友問候', event:'friend_interaction', target:1, metric:'count', feature:'friends' },
  { id:'visit_friend', category:'好友', title:'好友拜訪', event:'visit_friend', target:1, metric:'count', feature:'friends' },
  { id:'plant_distinct_2', category:'種植', title:'多樣種植', event:'plant', target:2, metric:'distinct_species' },
  { id:'harvest_distinct_2', category:'收成', title:'多樣收成', event:'harvest', target:2, metric:'distinct_species' },
] as const;

export type TaskEligibility = Readonly<{
  pets: boolean;
  friends: boolean;
  synthesis: boolean;
  pots: boolean;
  /** Distinct species that can actually be planted and harvested today. */
  availablePlantSpecies: number;
  availableHarvestSpecies: number;
}>;

export function eligibleDailyTasks(eligibility: TaskEligibility): DailyTask[] {
  return DAILY_TASK_POOL.filter(task => {
    if (task.feature && !eligibility[task.feature]) return false;
    if (task.id === 'plant_distinct_2' && eligibility.availablePlantSpecies < 2) return false;
    if (task.id === 'harvest_distinct_2' && eligibility.availableHarvestSpecies < 2) return false;
    return true;
  });
}

/** Can the remaining pool supply enough compatible tasks? Exhaustive search is bounded by 17 candidates. */
function canCompleteSix(tasks: readonly DailyTask[], selected: readonly DailyTask[]): boolean {
  if (selected.length === 6) return true;
  if (selected.length + tasks.length < 6) return false;
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (selected.some(prior =>
      (task.exclusiveGroup && prior.exclusiveGroup === task.exclusiveGroup)
      || (task.clickOnly && prior.clickOnly)
    )) continue;
    if (canCompleteSix(tasks.slice(i + 1), [...selected, task])) return true;
  }
  return false;
}

/** Inject a cryptographically secure server-side random index generator. */
export function selectDailyTasks(
  eligibility: TaskEligibility,
  randomIndex: (upperExclusive: number) => number,
): DailyTask[] {
  let pool = eligibleDailyTasks(eligibility);
  const selected: DailyTask[] = [];
  if (!canCompleteSix(pool, selected)) throw new Error('INSUFFICIENT_ELIGIBLE_DAILY_TASKS');
  while (selected.length < 6) {
    const candidates = pool.filter(task => {
      const remaining = pool.filter(other => other.id !== task.id && !(
        (task.exclusiveGroup && other.exclusiveGroup === task.exclusiveGroup)
        || (task.clickOnly && other.clickOnly)
      ));
      return canCompleteSix(remaining, [...selected, task]);
    });
    if (!candidates.length) throw new Error('INSUFFICIENT_ELIGIBLE_DAILY_TASKS');
    const index = randomIndex(candidates.length);
    if (!Number.isInteger(index) || index < 0 || index >= candidates.length) {
      throw new Error('INVALID_RANDOM_INDEX');
    }
    const task = candidates[index];
    selected.push(task);
    pool = pool.filter(other => other.id !== task.id && !(
      (task.exclusiveGroup && other.exclusiveGroup === task.exclusiveGroup)
      || (task.clickOnly && other.clickOnly)
    ));
  }
  return selected;
}
