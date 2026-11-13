/**
 * Farm V2 daily activity pool: 15 canonical tasks, eight categories.
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
  exclusiveGroup?: 'plant_threshold' | 'harvest_threshold';
  clickOnly?: boolean;
}>;

export const DAILY_TASK_POOL: readonly DailyTask[] = [
  { id:'plant_5', category:'播種', title:'播種新手', event:'plant', target:5, metric:'quantity', exclusiveGroup:'plant_threshold' },
  { id:'plant_10', category:'播種', title:'勤勞耕種', event:'plant', target:10, metric:'quantity', exclusiveGroup:'plant_threshold' },
  { id:'harvest_5', category:'收成', title:'小小豐收', event:'harvest', target:5, metric:'quantity', exclusiveGroup:'harvest_threshold' },
  { id:'harvest_10', category:'收成', title:'豐收喜悅', event:'harvest', target:10, metric:'quantity', exclusiveGroup:'harvest_threshold' },
  { id:'buy_seeds_once', category:'種子', title:'種子補給', event:'buy_seeds', target:1, metric:'count' },
  { id:'buy_seeds_10', category:'種子', title:'種子儲備', event:'buy_seeds', target:10, metric:'quantity' },
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

/** Inject a cryptographically secure server-side random index generator. */
export function selectDailyTasks(
  eligibility: TaskEligibility,
  randomIndex: (upperExclusive: number) => number,
): DailyTask[] {
  const pool = eligibleDailyTasks(eligibility);
  const selected: DailyTask[] = [];
  while (pool.length && selected.length < 6) {
    const index = randomIndex(pool.length);
    if (!Number.isInteger(index) || index < 0 || index >= pool.length) {
      throw new Error('INVALID_RANDOM_INDEX');
    }
    const [task] = pool.splice(index, 1);
    selected.push(task);
    if (task.exclusiveGroup) {
      for (let i = pool.length - 1; i >= 0; i--) {
        if (pool[i].exclusiveGroup === task.exclusiveGroup) pool.splice(i, 1);
      }
    }
    if (task.clickOnly) {
      for (let i = pool.length - 1; i >= 0; i--) {
        if (pool[i].clickOnly) pool.splice(i, 1);
      }
    }
  }
  if (selected.length !== 6) {
    throw new Error('INSUFFICIENT_ELIGIBLE_DAILY_TASKS');
  }
  return selected;
}
