/** Shared transport contract; intentionally independent of React/JSX. */
export type DailyActivitySnapshot = {
  status: string;
  day: string;
  points: number;
  maximum: number;
  tasks: { id: string; label: string; target: number; progress: number; complete: boolean }[];
  milestones: { activity: number; reward: string; eligible: boolean; claimed: boolean }[];
};
