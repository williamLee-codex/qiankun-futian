export interface SceneRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}
const region = (x: number, y: number, w: number, h: number): SceneRegion => ({
  x,
  y,
  w,
  h,
});
// Provisional interaction coordinates only. Approved image alignment remains blocked.
export const SCENE_LAYOUTS = {
  mobile: {
    aspectRatio: "390 / 843",
    lands: [43, 61].flatMap((y) =>
      [4, 36, 68].map((x) => region(x, y, 28, 14)),
    ),
    cave: region(35, 10, 30, 14),
    pots: [5, 20, 35, 50, 65, 80].map((x) => region(x, 27, 12, 8)),
    pets: [5, 28, 51, 74].map((x) => region(x, 82, 20, 8)),
    formation: region(30, 35, 40, 7),
  },
  desktop: {
    aspectRatio: "1440 / 800",
    lands: [32, 58].flatMap((y) =>
      [4, 22, 40].map((x) => region(x, y, 16, 20)),
    ),
    cave: region(67, 8, 26, 25),
    pots: [60, 66, 72, 78, 84, 90].map((x) => region(x, 39, 6, 9)),
    pets: [60, 70, 80, 90].map((x) => region(x, 53, 8, 10)),
    formation: region(67, 69, 27, 23),
  },
} as const;
export function sceneLandAction(plot: { unlocked: boolean; state: string }) {
  if (!plot.unlocked) return null;
  return plot.state === "empty"
    ? "sow"
    : plot.state === "ready"
      ? "harvest"
      : null;
}
