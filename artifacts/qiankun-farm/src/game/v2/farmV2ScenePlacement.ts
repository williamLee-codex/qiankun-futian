/** Existing approved-art placement only; not gameplay state or V1 rules.
 * Source: imperial-compass-platform FarmV1Dashboard.tsx blob
 * f1cda92d4655aea98cd8419151fb5bbe0eaeb5b9, FARM_LAND_HOTSPOTS.
 * Full LandEntity world/camera acceptance remains outstanding.
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
export function farmV2ScenePlacement(landId: number, desktopView: boolean) {
  const coordinates = (desktopView ? desktop : mobile)[landId - 1];
  if (!coordinates || !Number.isInteger(landId))
    throw new Error("INVALID_LAND_ID");
  const xs = coordinates.filter((_, i) => i % 2 === 0);
  const ys = coordinates.filter((_, i) => i % 2 === 1);
  const left = Math.min(...xs),
    top = Math.min(...ys);
  const width = Math.max(...xs) - left,
    height = Math.max(...ys) - top;
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
    clipPath: `polygon(${xs.map((x, i) => `${((x - left) / width) * 100}% ${((ys[i] - top) / height) * 100}%`).join(", ")})`,
    center: {
      x: `${xs.reduce((a, b) => a + b) / 4}%`,
      y: `${ys.reduce((a, b) => a + b) / 4}%`,
    },
  };
}
