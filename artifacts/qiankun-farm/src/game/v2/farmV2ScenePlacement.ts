/** Existing approved-art placement only; not gameplay state or V1 rules.
 * Source: imperial-compass-platform FarmV1Dashboard.tsx blob
 * f1cda92d4655aea98cd8419151fb5bbe0eaeb5b9, FARM_LAND_HOTSPOTS.
 * Shared world surfaces use the existing desktop calibration. Mobile art
 * correspondence changes rendering only; it never changes land identity/state.
 */
const desktop = [
  [21, 50.5, 42, 50, 41.5, 58, 20, 58.5],
  [44, 50, 59.5, 49.8, 60.5, 58, 43.5, 58],
  [61, 49.8, 81.5, 50.5, 82.5, 58.5, 61.5, 58],
  [19, 60, 41.5, 59.5, 41, 69, 17.5, 69.5],
  [43.5, 59.5, 61, 59.5, 62, 69, 43, 69],
  [63, 59.5, 83, 60, 84.5, 69.5, 63, 69],
];
const mobile = [
  [20, 55.4, 41.5, 55, 41, 62, 19.5, 62.5],
  [43.5, 55, 59.5, 55, 60.5, 62, 43, 62],
  [61, 55, 80.5, 55.5, 81.5, 62.5, 61.5, 62],
  [19, 63, 41, 62.5, 40.5, 71.5, 18, 72],
  [43, 62.5, 61, 62.5, 61.5, 71.5, 42.5, 71.5],
  [63, 62.5, 82, 63, 83, 72, 63, 71.5],
];
export function farmV2WorldSurface(landId: number) {
  if (!Number.isInteger(landId) || landId < 1 || landId > 6)
    throw new Error("INVALID_LAND_ID");
  const coordinates = desktop[landId - 1];
  const corners = Array.from({ length: 4 }, (_, i) =>
    Object.freeze({ x: coordinates[i * 2], y: coordinates[i * 2 + 1] }),
  );
  return Object.freeze({
    landId,
    corners: Object.freeze(corners),
    center: Object.freeze({
      x: corners.reduce((sum, p) => sum + p.x, 0) / 4,
      y: corners.reduce((sum, p) => sum + p.y, 0) / 4,
    }),
  });
}

/** Bilinear terrain correspondence from the existing art calibrations.
 * Each terrain surface stays in the shared world. No global flat-plane camera
 * assumption is imposed on the two independently composed original artworks.
 */
function projectWorldPoint(
  surface: ReturnType<typeof farmV2WorldSurface>,
  point: { x: number; y: number },
  desktopView: boolean,
) {
  if (desktopView) return point;
  const [a, b, c, d] = farmV2WorldSurface(surface.landId).corners;
  let u = 0.5,
    v = 0.5;
  const blend = (
    points: readonly { x: number; y: number }[],
    u: number,
    v: number,
  ) => ({
    x:
      points[0].x * (1 - u) * (1 - v) +
      points[1].x * u * (1 - v) +
      points[2].x * u * v +
      points[3].x * (1 - u) * v,
    y:
      points[0].y * (1 - u) * (1 - v) +
      points[1].y * u * (1 - v) +
      points[2].y * u * v +
      points[3].y * (1 - u) * v,
  });
  for (let i = 0; i < 12; i++) {
    const q = blend([a, b, c, d], u, v),
      dx = q.x - point.x,
      dy = q.y - point.y;
    if (Math.abs(dx) + Math.abs(dy) < 1e-10) break;
    const ux = (b.x - a.x) * (1 - v) + (c.x - d.x) * v,
      uy = (b.y - a.y) * (1 - v) + (c.y - d.y) * v;
    const vx = (d.x - a.x) * (1 - u) + (c.x - b.x) * u,
      vy = (d.y - a.y) * (1 - u) + (c.y - b.y) * u;
    const det = ux * vy - uy * vx;
    if (Math.abs(det) < 1e-12) throw new Error("INVALID_WORLD_SURFACE");
    u -= (dx * vy - dy * vx) / det;
    v -= (dy * ux - dx * uy) / det;
  }
  const coordinates = mobile[surface.landId - 1];
  return blend(
    Array.from({ length: 4 }, (_, i) => ({
      x: coordinates[i * 2],
      y: coordinates[i * 2 + 1],
    })),
    u,
    v,
  );
}
export function projectFarmV2WorldSurface(
  surface: ReturnType<typeof farmV2WorldSurface>,
  desktopView: boolean,
) {
  const corners = surface.corners.map((point) =>
    projectWorldPoint(surface, point, desktopView),
  );
  const center = projectWorldPoint(surface, surface.center, desktopView);
  const xs = corners.map((p) => p.x),
    ys = corners.map((p) => p.y);
  const left = Math.min(...xs),
    top = Math.min(...ys),
    width = Math.max(...xs) - left,
    height = Math.max(...ys) - top;
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
    clipPath: `polygon(${corners.map((p) => `${((p.x - left) / width) * 100}% ${((p.y - top) / height) * 100}%`).join(", ")})`,
    center: { x: `${center.x}%`, y: `${center.y}%` },
  };
}
export function farmV2ScenePlacement(landId: number, desktopView: boolean) {
  return projectFarmV2WorldSurface(farmV2WorldSurface(landId), desktopView);
}
