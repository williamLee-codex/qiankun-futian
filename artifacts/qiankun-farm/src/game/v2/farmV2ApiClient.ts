/**
 * Farm V2 transport boundary. The server, never localStorage, owns all farm assets.
 * The launch token must be provided by the platform launch integration.
 * Do not persist it in browser storage or fall back to prototype GameContext.
 */
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
  constructor(
    readonly status: number,
    readonly code: string,
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

  let revoked = false;
  let sessionPromise: Promise<string> | null = null;
  let reauthenticateUrl: string | null = null;
  const pendingRequests = new Map<string, string>();
  let journalKey: string | null = null;
  function savePendingRequests() {
    if (!journalKey) return;
    try {
      sessionStorage.setItem(
        journalKey,
        JSON.stringify(Object.fromEntries(pendingRequests)),
      );
    } catch {
      /* Storage may be disabled; in-memory IDs still protect active retries. */
    }
  }
  async function decode<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        reauthenticateUrl?: string;
      } | null;
      if (payload?.reauthenticateUrl) {
        const login = new URL(payload.reauthenticateUrl);
        if (
          (login.protocol === "https:" ||
            (login.protocol === "http:" &&
              ["localhost", "127.0.0.1", "[::1]"].includes(login.hostname))) &&
          !login.username &&
          !login.password
        )
          reauthenticateUrl = login.toString();
      }
      throw new FarmV2ApiError(
        response.status,
        payload?.error ?? "FARM_V2_REQUEST_FAILED",
      );
    }
    return response.json() as Promise<T>;
  }
  async function session(): Promise<string> {
    if (revoked) throw new FarmV2ApiError(401, "FARM_SESSION_NOT_ACTIVE");
    sessionPromise ??= (async () => {
      const response = await fetch(endpoint("farm/v2/session"), {
        method: "POST",
        headers: { Authorization: `Bearer ${launchToken}` },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      const result = await decode<{
        userId: string;
        sessionToken: string;
        reauthenticateUrl: string;
      }>(response);
      if (
        typeof result.userId !== "string" ||
        !result.userId ||
        typeof result.sessionToken !== "string" ||
        !result.sessionToken.startsWith("fvs1.") ||
        typeof result.reauthenticateUrl !== "string"
      )
        throw new Error("INVALID_FARM_SESSION_RESPONSE");
      journalKey = `farm-v2:pending:${normalizedApiBase.toString()}:${result.userId}`;
      try {
        const saved = JSON.parse(
          sessionStorage.getItem(journalKey) ?? "{}",
        ) as Record<string, unknown>;
        for (const [operation, id] of Object.entries(saved)) {
          if (typeof id === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(id))
            pendingRequests.set(operation, id);
        }
      } catch {
        /* No credential is read from browser storage. */
      }
      const login = new URL(result.reauthenticateUrl);
      if (
        login.protocol !== "https:" &&
        !(
          login.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(login.hostname)
        )
      )
        throw new Error("INVALID_FARM_SESSION_RESPONSE");
      if (login.username || login.password)
        throw new Error("INVALID_FARM_SESSION_RESPONSE");
      reauthenticateUrl = login.toString();
      return result.sessionToken;
    })().catch((error) => {
      sessionPromise = null;
      throw error;
    });
    return sessionPromise;
  }
  async function request<T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
  ): Promise<T> {
    const token = await session();
    const operation = JSON.stringify([path, body]);
    const requestId =
      method === "POST"
        ? (pendingRequests.get(operation) ?? crypto.randomUUID())
        : undefined;
    if (requestId) pendingRequests.set(operation, requestId);
    savePendingRequests();
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(endpoint(path), {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(requestId ? { "x-request-id": requestId } : {}),
            ...(body !== undefined
              ? { "content-type": "application/json" }
              : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
        const result = await decode<T>(response);
        pendingRequests.delete(operation);
        savePendingRequests();
        return result;
      } catch (error) {
        const retryable =
          error instanceof TypeError ||
          (error instanceof Error &&
            ["TimeoutError", "AbortError"].includes(error.name)) ||
          (error instanceof FarmV2ApiError &&
            [502, 503, 504].includes(error.status));
        if (
          error instanceof FarmV2ApiError &&
          error.status < 500 &&
          ![401, 403].includes(error.status) &&
          error.code !== "MUTATION_IN_PROGRESS"
        ) {
          pendingRequests.delete(operation);
          savePendingRequests();
        }
        // At most one automatic retry, using the same operation/request ID.
        // Unconfirmed requests retain their ID for a subsequent explicit retry.
        if (!retryable || attempt >= 1) throw error;
      }
    }
  }

  return {
    getReauthenticationUrl: () => reauthenticateUrl,
    revokeSession: async () => {
      const token = await session();
      await decode(
        await fetch(endpoint("farm/v2/session"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ action: "revoke" }),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        }),
      );
      revoked = true;
      sessionPromise = null;
    },
    readState: () => request<FarmV2State>("farm/v2/state", "GET"),
    sow: (landId: number) =>
      request<FarmV2MutationResult>(`farm/v2/lands/${landId}/sow`, "POST"),
    harvest: (landId: number) =>
      request<FarmV2MutationResult>(`farm/v2/lands/${landId}/harvest`, "POST"),
    purchaseSeeds: (landId: number, packs: number) =>
      request<unknown>(`farm/v2/seeds/${landId}/purchase`, "POST", { packs }),
    exchangeCrops: (landId: number, cropQuantity: number) =>
      request<unknown>(`farm/v2/crops/${landId}/exchange`, "POST", {
        cropQuantity,
      }),
  };
}
