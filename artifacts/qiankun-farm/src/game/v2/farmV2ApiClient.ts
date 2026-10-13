/**
 * Farm V2 transport boundary. The server, never localStorage, owns all farm assets.
 * The launch token must be provided by the platform launch integration.
 * Do not persist it in browser storage or fall back to prototype GameContext.
 */
export type FarmV2Operation =
  | "sow"
  | "harvest"
  | "purchaseSeeds"
  | "exchangeCrops"
  | "setFarmerEnabled"
  | "claimChaosSeeds"
  | "unlockCoinLand"
  | "claimMission";

export type FarmV2MissionId =
  | "MISSION_D01" | "MISSION_D02" | "MISSION_D03" | "MISSION_D04"
  | "MISSION_W01" | "MISSION_W02" | "MISSION_W03" | "MISSION_W04";
export type FarmV2MissionProgress = { progress: number; completed: boolean; claimed: boolean };
export type FarmV2MissionState = {
  dailyPeriodStart: number;
  weeklyPeriodStart: number;
  progress: Record<FarmV2MissionId, FarmV2MissionProgress>;
  expiredMissionIds?: FarmV2MissionId[];
};
export type FarmV2MaterialId = "蘊靈砂" | "九霄玉髓";

export type FarmV2Land = {
  landId: number;
  lifecycle: "LOCKED" | "EMPTY" | "GROWING" | "MATURE";
  accessActive: boolean;
  plantedQuantity: number;
  plantedAt: string | null;
  maturesAt: string | null;
};

export type FarmV2Warehouse = {
  seeds: Record<string, number>;
  crops: Record<string, number>;
  materials?: Partial<Record<FarmV2MaterialId, number>>;
};

export type FarmV2State = {
  serverTime: number;
  player: {
    warehouseState: FarmV2Warehouse;
    missionState: FarmV2MissionState;
    firstFarmEnteredAt: string | null;
  };
  lands: FarmV2Land[];
};

export type FarmV2MutationResult = {
  land: FarmV2Land;
  warehouse: FarmV2Warehouse;
  creditedQuantity?: number;
};

export class FarmV2ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly definitive = false,
  ) {
    super(code);
    this.name = "FarmV2ApiError";
  }
}

export function createFarmV2Api(input: {
  baseUrl: string;
  launchToken: string;
}) {
  const { baseUrl, launchToken } = input;
  if (!launchToken.trim()) throw new Error("FARM_V2_LAUNCH_TOKEN_REQUIRED");
  const normalizedApiBase = new URL(baseUrl);
  const localDev =
    normalizedApiBase.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(normalizedApiBase.hostname);
  if (normalizedApiBase.protocol !== "https:" && !localDev)
    throw new Error("FARM_V2_SECURE_API_REQUIRED");
  if (
    normalizedApiBase.username ||
    normalizedApiBase.password ||
    normalizedApiBase.search ||
    normalizedApiBase.hash
  )
    throw new Error("FARM_V2_INVALID_API_BASE");
  const endpoint = (path: string) => {
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    return new URL(normalizedPath, normalizedBase).toString();
  };

  async function request<T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
    retryRequestId?: string,
  ): Promise<T> {
    const requestId =
      method === "POST" ? (retryRequestId ?? crypto.randomUUID()) : undefined;
    const response = await fetch(endpoint(path), {
      method,
      headers: {
        Authorization: `Bearer ${launchToken}`,
        ...(requestId ? { "x-request-id": requestId } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        definitive?: boolean;
      } | null;
      throw new FarmV2ApiError(
        response.status,
        payload?.error ?? "FARM_V2_REQUEST_FAILED",
        payload?.definitive === true,
      );
    }
    return response.json() as Promise<T>;
  }

  return {
    setFarmerEnabled: (landId: number, enabled: boolean, requestId?: string) =>
      request<unknown>(
        `farm/v2/lands/${landId}/farmer`,
        "POST",
        { enabled },
        requestId,
      ),
    claimChaosSeeds: (requestId?: string) =>
      request<unknown>(
        "farm/v2/chaos-seeds/claim",
        "POST",
        undefined,
        requestId,
      ),
    readState: () => request<FarmV2State>("farm/v2/state", "GET"),
    sow: (landId: number, requestId?: string) =>
      request<FarmV2MutationResult>(
        `farm/v2/lands/${landId}/sow`,
        "POST",
        undefined,
        requestId,
      ),
    harvest: (landId: number, requestId?: string) =>
      request<FarmV2MutationResult>(
        `farm/v2/lands/${landId}/harvest`,
        "POST",
        undefined,
        requestId,
      ),
    purchaseSeeds: (landId: number, packs: number, requestId?: string) =>
      request<unknown>(
        `farm/v2/seeds/${landId}/purchase`,
        "POST",
        { packs },
        requestId,
      ),
    exchangeCrops: (landId: number, cropQuantity: number, requestId?: string) =>
      request<unknown>(
        `farm/v2/crops/${landId}/exchange`,
        "POST",
        { cropQuantity },
        requestId,
      ),
    claimMission: (missionId: FarmV2MissionId, requestId?: string) =>
      request<unknown>(
        `farm/v2/missions/${missionId}/claim`,
        "POST",
        undefined,
        requestId,
      ),
    unlockCoinLand: (landId: number, requestId?: string) => {
      if (landId !== 2 && landId !== 3)
        throw new Error("INVALID_COIN_LAND_ID");
      return request<unknown>(
        `farm/v2/lands/${landId}/unlock`,
        "POST",
        undefined,
        requestId,
      );
    },
  };
}
