export type MaterialShortage = {
  material: string;
  name: string;
  required: number;
  held: number;
  missing: number;
};

export const materialShortageTitle = "您的合成材料不足";

/** One approved line per short material: name, required, held, missing. */
export function materialShortageLine(shortage: MaterialShortage): string {
  return `${shortage.name}：需求 ${shortage.required}、持有 ${shortage.held}、不足 ${shortage.missing}。`;
}

export function materialShortageLines(shortages: MaterialShortage[]): string[] {
  return shortages.map(materialShortageLine);
}

/**
 * Read the refusal details the server sends with FARM_MATERIALS_INSUFFICIENT.
 * Anything malformed yields no notice rather than an invented amount.
 */
export function readMaterialShortages(details: unknown): MaterialShortage[] {
  if (!details || typeof details !== "object") return [];
  const value = (details as { shortages?: unknown }).shortages;
  if (!Array.isArray(value)) return [];
  const shortages: MaterialShortage[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const { material, name, required, held, missing } = row as Record<string, unknown>;
    if (
      typeof material !== "string" ||
      typeof name !== "string" ||
      !Number.isSafeInteger(required) ||
      !Number.isSafeInteger(held) ||
      !Number.isSafeInteger(missing) ||
      (required as number) <= 0 ||
      (missing as number) <= 0
    )
      continue;
    shortages.push({
      material,
      name,
      required: required as number,
      held: held as number,
      missing: missing as number,
    });
  }
  return shortages;
}
