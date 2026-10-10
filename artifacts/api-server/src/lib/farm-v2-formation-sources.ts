import { timingSafeEqual } from "node:crypto";
import { farmV2PlatformConnection } from "./farm-v2-platform";
import type {
  FestivalDefinition,
  AchievementFormation,
} from "../../../qiankun-farm/src/game/v2/formationSourcesRuntime";
export function findOfficialFestivalCode(codeHash: string): FestivalDefinition {
  if (!/^[a-f0-9]{64}$/.test(codeHash))
    throw new Error("INVALID_FORMATION_CODE");
  const raw = process.env.FARM_V2_FESTIVAL_CODES;
  if (!raw) throw new Error("FORMATION_SOURCE_NOT_CONFIGURED");
  const definitions: unknown = JSON.parse(raw);
  if (!Array.isArray(definitions))
    throw new Error("INVALID_FORMATION_SOURCE_CONFIGURATION");
  for (const entry of definitions) {
    if (
      !entry ||
      typeof entry !== "object" ||
      !/^[a-f0-9]{64}$/.test(entry.codeHash) ||
      !["FORMATION_FESTIVAL_SPRING", "FORMATION_FESTIVAL_MOON"].includes(
        entry.id,
      ) ||
      !Number.isSafeInteger(entry.startsAt) ||
      !Number.isSafeInteger(entry.expiresAt) ||
      entry.expiresAt <= entry.startsAt ||
      !Number.isInteger(entry.year)
    )
      throw new Error("INVALID_FORMATION_SOURCE_CONFIGURATION");
  }
  const matches = definitions.filter((entry) =>
    timingSafeEqual(
      Buffer.from(entry.codeHash, "hex"),
      Buffer.from(codeHash, "hex"),
    ),
  );
  if (matches.length !== 1) throw new Error("INVALID_FORMATION_CODE");
  return matches[0] as FestivalDefinition;
}
export async function readTrustedFormationGrants(launchToken: string) {
  const { base, secret } = farmV2PlatformConnection();
  const response = await fetch(
    new URL("/api/replit/farm-v2/formations", base),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-replit-shared-secret": secret,
      },
      body: JSON.stringify({ launchToken }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) throw new Error("FORMATION_SOURCE_UNAVAILABLE");
  const data = (await response.json()) as {
    configured?: boolean;
    grants?: AchievementFormation[];
  };
  if (data.configured !== true)
    throw new Error("FORMATION_SOURCE_NOT_CONFIGURED");
  if (
    !Array.isArray(data.grants) ||
    !data.grants.every(
      (g) =>
        typeof g.id === "string" &&
        g.completed === true &&
        (g.expiresAt === null || Number.isSafeInteger(g.expiresAt)),
    )
  )
    throw new Error("INVALID_FORMATION_SOURCE");
  return data.grants;
}
