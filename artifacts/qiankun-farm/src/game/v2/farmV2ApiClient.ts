/**
 * Farm V2 transport boundary. The server, never localStorage, owns all farm assets.
 * The launch token must be provided by the platform launch integration.
 * Do not persist it in browser storage or fall back to prototype GameContext.
 */
export type FarmV2Land = {
  landId: number;
  lifecycle: 'LOCKED' | 'EMPTY' | 'GROWING' | 'MATURE';
  accessActive: boolean;
  plantedQuantity: number;
  plantedAt: string | null;
  maturesAt: string | null;
};

export type FarmV2Warehouse = {
  seeds: Record<string, number>;
  crops: Record<string, number>;
};

export type FarmV2State = {
  player: {
    warehouseState: FarmV2Warehouse;
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
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'FarmV2ApiError';
  }
}

export function createFarmV2Api(input: { baseUrl: string; launchToken: string }) {
  const { baseUrl, launchToken } = input;
  if (!launchToken.trim()) throw new Error('FARM_V2_LAUNCH_TOKEN_REQUIRED');
  const endpoint = (path: string) => {
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    return new URL(normalizedPath, normalizedBase).toString();
  };

  async function request<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    const requestId = method === 'POST' ? crypto.randomUUID() : undefined;
    const response = await fetch(endpoint(path), {
      method,
      headers: {
        Authorization: `Bearer ${launchToken}`,
        ...(requestId ? { 'x-request-id': requestId } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new FarmV2ApiError(response.status, payload?.error ?? 'FARM_V2_REQUEST_FAILED');
    }
    return response.json() as Promise<T>;
  }

  return {
    readState: () => request<FarmV2State>('farm/v2/state', 'GET'),
    sow: (landId: number) => request<FarmV2MutationResult>(`farm/v2/lands/${landId}/sow`, 'POST'),
    harvest: (landId: number) => request<FarmV2MutationResult>(`farm/v2/lands/${landId}/harvest`, 'POST'),
    purchaseSeeds: (landId: number, packs: number) =>
      request<unknown>(`farm/v2/seeds/${landId}/purchase`, 'POST', { packs }),
    exchangeCrops: (landId: number, cropQuantity: number) =>
      request<unknown>(`farm/v2/crops/${landId}/exchange`, 'POST', { cropQuantity }),
  };
}
