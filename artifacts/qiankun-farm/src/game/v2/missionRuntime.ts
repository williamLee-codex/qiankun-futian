import { startOfFarmDay, startOfFarmWeek } from './timeRuntime';

export type FarmMissionEvent = 'SOW' | 'HARVEST' | 'EXCHANGE';
export type FarmMissionPeriod = 'DAILY' | 'WEEKLY';

export interface FarmMissionReward {
  coins: number;
  materialId: '蘊靈砂' | '九霄玉髓';
  materialQuantity: number;
}

export interface FarmMissionDefinition {
  id: string;
  period: FarmMissionPeriod;
  event?: FarmMissionEvent;
  target: number;
  prerequisiteIds?: readonly string[];
  reward: FarmMissionReward;
}

export const FARM_V2_MISSIONS: readonly FarmMissionDefinition[] = [
  { id: 'MISSION_D01', period: 'DAILY', event: 'SOW', target: 1, reward: { coins: 2, materialId: '蘊靈砂', materialQuantity: 1 } },
  { id: 'MISSION_D02', period: 'DAILY', event: 'HARVEST', target: 1, reward: { coins: 3, materialId: '蘊靈砂', materialQuantity: 1 } },
  { id: 'MISSION_D03', period: 'DAILY', event: 'EXCHANGE', target: 1, reward: { coins: 3, materialId: '蘊靈砂', materialQuantity: 1 } },
  { id: 'MISSION_D04', period: 'DAILY', target: 1, prerequisiteIds: ['MISSION_D01', 'MISSION_D02', 'MISSION_D03'], reward: { coins: 5, materialId: '蘊靈砂', materialQuantity: 3 } },
  { id: 'MISSION_W01', period: 'WEEKLY', event: 'SOW', target: 10, reward: { coins: 10, materialId: '九霄玉髓', materialQuantity: 1 } },
  { id: 'MISSION_W02', period: 'WEEKLY', event: 'HARVEST', target: 10, reward: { coins: 15, materialId: '九霄玉髓', materialQuantity: 1 } },
  { id: 'MISSION_W03', period: 'WEEKLY', event: 'EXCHANGE', target: 5, reward: { coins: 15, materialId: '九霄玉髓', materialQuantity: 1 } },
  { id: 'MISSION_W04', period: 'WEEKLY', target: 1, prerequisiteIds: ['MISSION_W01', 'MISSION_W02', 'MISSION_W03'], reward: { coins: 20, materialId: '九霄玉髓', materialQuantity: 1 } },
] as const;

export interface MissionProgress {
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface MissionState {
  dailyPeriodStart: number;
  weeklyPeriodStart: number;
  progress: Record<string, MissionProgress>;
}

function emptyProgress(): Record<string, MissionProgress> {
  return Object.fromEntries(FARM_V2_MISSIONS.map((m) => [
    m.id, { progress: 0, completed: false, claimed: false },
  ]));
}

export function createMissionState(now: number): MissionState {
  return {
    dailyPeriodStart: startOfFarmDay(now),
    weeklyPeriodStart: startOfFarmWeek(now),
    progress: emptyProgress(),
  };
}

export function rollMissionPeriods(state: MissionState, now: number): MissionState {
  const daily = startOfFarmDay(now);
  const weekly = startOfFarmWeek(now);
  let progress = { ...state.progress };

  if (daily !== state.dailyPeriodStart) {
    for (const mission of FARM_V2_MISSIONS.filter((m) => m.period === 'DAILY')) {
      progress[mission.id] = { progress: 0, completed: false, claimed: false };
    }
  }
  if (weekly !== state.weeklyPeriodStart) {
    for (const mission of FARM_V2_MISSIONS.filter((m) => m.period === 'WEEKLY')) {
      progress[mission.id] = { progress: 0, completed: false, claimed: false };
    }
  }

  return { dailyPeriodStart: daily, weeklyPeriodStart: weekly, progress };
}

function recomputeMeta(progress: Record<string, MissionProgress>): Record<string, MissionProgress> {
  const next = { ...progress };
  for (const mission of FARM_V2_MISSIONS.filter((m) => m.prerequisiteIds)) {
    const completed = mission.prerequisiteIds!.every((id) => next[id]?.completed);
    next[mission.id] = {
      ...next[mission.id],
      progress: completed ? 1 : 0,
      completed,
    };
  }
  return next;
}

export function recordMissionEvent(
  state: MissionState,
  event: FarmMissionEvent,
  now: number,
): MissionState {
  const rolled = rollMissionPeriods(state, now);
  const progress = { ...rolled.progress };

  for (const mission of FARM_V2_MISSIONS.filter((m) => m.event === event)) {
    const current = progress[mission.id];
    const value = Math.min(mission.target, current.progress + 1);
    progress[mission.id] = { ...current, progress: value, completed: value >= mission.target };
  }

  return { ...rolled, progress: recomputeMeta(progress) };
}

export function claimMissionReward(state: MissionState, missionId: string, now: number): {
  state: MissionState;
  reward: FarmMissionReward;
} {
  const rolled = rollMissionPeriods(state, now);
  const mission = FARM_V2_MISSIONS.find((m) => m.id === missionId);
  if (!mission) throw new Error('UNKNOWN_MISSION');

  const current = rolled.progress[missionId];
  if (!current.completed) throw new Error('MISSION_NOT_COMPLETE');
  if (current.claimed) throw new Error('MISSION_ALREADY_CLAIMED');

  return {
    reward: mission.reward,
    state: {
      ...rolled,
      progress: {
        ...rolled.progress,
        [missionId]: { ...current, claimed: true },
      },
    },
  };
}
