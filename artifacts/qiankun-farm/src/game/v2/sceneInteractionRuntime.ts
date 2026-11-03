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
// Percent coordinates measured independently against the approved originals.
// Keep the complete image visible; never use cover/cropped coordinates.
export const SCENE_LAYOUTS = {
  mobile: {
    aspectRatio: "941 / 1672",
    lands: [
      region(22.2, 55.7, 18.0, 6.6),
      region(42.3, 55.7, 18.0, 6.6),
      region(63.3, 55.7, 18.1, 6.6),
      region(20.2, 64.3, 19.3, 7.2),
      region(42.3, 64.3, 18.5, 7.2),
      region(64.6, 64.3, 18.5, 7.2),
    ],
    cave: region(43.5, 27, 21.0, 10.5),
    pots: [region(34, 36.5, 6, 4.8), region(40, 37.1, 6, 4.8), region(46, 37.5, 6, 4.8), region(60, 37.5, 6, 4.8), region(66, 37.1, 6, 4.8), region(72, 36.5, 6, 4.8)],
    potEntry: region(74, 42.5, 17, 4),
    pets: [
      region(3, 43.7, 13.5, 3.5),
      region(23, 43.1, 13.5, 3.5),
      region(19, 49.4, 13.5, 3.5),
      region(3, 54.1, 13.5, 3.5),
    ],
    formation: region(41, 38.5, 29, 4),
  },
  desktop: {
    aspectRatio: "1215 / 1295",
    lands: [
      region(25.6, 49.9, 18.1, 8.6),
      region(47.0, 49.9, 16.0, 8.6),
      region(65.2, 49.9, 17.5, 8.6),
      region(22.2, 60.5, 18.5, 10.3),
      region(43.8, 60.5, 17.0, 10.3),
      region(64, 60.5, 18.4, 10.3),
    ],
    cave: region(44.8, 12.4, 21.8, 12.2),
    pots: [region(34, 23.1, 7, 7), region(41, 23.8, 7, 7), region(48, 24.2, 7, 7), region(60, 24.2, 7, 7), region(67, 23.8, 7, 7), region(74, 23.1, 7, 7)],
    potEntry: region(72, 31.7, 13, 4.5),
    pets: [
      region(5.5, 35.7, 10.5, 4.3),
      region(25, 35.7, 10.5, 4.3),
      region(21.7, 42.2, 10.5, 4.3),
      region(5.5, 46.8, 10.5, 4.3),
    ],
    formation: region(43, 25.4, 23.6, 5.1),
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
