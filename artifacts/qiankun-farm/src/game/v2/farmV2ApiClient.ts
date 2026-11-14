export type FarmSeedRecovery = {requestId:string;landId:number;packs:number};
export type FarmCoinBalances = {
  coins: number;
  centralCoins: number;
  localCoinsEnabled: boolean;
};
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
  features?: { localCoins?: boolean };
  player: {
    userId?: string;
    warehouseState: FarmV2Warehouse;
    firstFarmEnteredAt: string | null;
    farmerState?: import("./farmerRuntime").FarmerState;
    chaosSeedState?: import("./chaosSeedRuntime").ChaosSeedState | null;
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

  const browserOrigin = (globalThis as { location?: { origin?: string } })
    .location?.origin;
  const browserResume = launchToken === "browser-session";
  if (
    browserResume &&
    (!browserOrigin || normalizedApiBase.origin !== browserOrigin)
  )
    throw new Error("FARM_V2_SAME_ORIGIN_SESSION_REQUIRED");
  const authHeader = (token: string): Record<string, string> =>
    token === "cookie-session" ? {} : { Authorization: `Bearer ${token}` };
  let revoked = false;
  let sessionPromise: Promise<string> | null = null;
  let reauthenticateUrl: string | null = null;
  const pendingRequests = new Map<string, string>();
  let journalKey: string | null = null;
  let transferInFlight = false;
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
  function restorePendingRequests(userId: string) {
    journalKey = `farm-v2:pending:${normalizedApiBase.toString()}:${userId}`;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(journalKey) ?? "{}",
      ) as Record<string, unknown>;
      for (const [operation, id] of Object.entries(saved)) {
        // An invalid legacy/browser-storage record must not prevent recovery
        // of other valid requests, especially an unconfirmed transfer.
        try {
          const key: unknown = JSON.parse(operation);
          if (!Array.isArray(key) || key.length !== 2 || typeof key[0] !== "string" || !key[0].startsWith("farm/v2/")) continue;
          if (typeof id === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(id)) pendingRequests.set(operation, id);
        } catch { /* Skip only this malformed record; preserve valid keys. */ }
      }
    } catch {
      /* No credential is read from browser storage. */
    }
  }
  async function decode<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        status?: string;
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
        payload?.error ??
          (response.url.includes("/farm/v2/signin") ? payload?.status : undefined) ??
          "FARM_V2_REQUEST_FAILED",
      );
    }
    return response.json() as Promise<T>;
  }
  async function timedFetch(
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const started = performance.now();
    let status = 0;
    try {
      const response = await fetch(endpoint(path), init);
      status = response.status;
      return response;
    } finally {
      console.info(
        "FARM_REQUEST_TIMING",
        JSON.stringify({
          path: path.split("?")[0],
          method: init.method ?? "GET",
          status,
          durationMs: Math.round(performance.now() - started),
        }),
      );
    }
  }
  async function session(): Promise<string> {
    if (revoked) throw new FarmV2ApiError(401, "FARM_SESSION_NOT_ACTIVE");
    sessionPromise ??= (async () => {
      const response = await timedFetch("farm/v2/session", {
        method: browserResume ? "GET" : "POST",
        headers: browserResume
          ? {}
          : { Authorization: `Bearer ${launchToken}` },
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
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
        !(
          result.sessionToken.startsWith("fvs1.") ||
          (normalizedApiBase.origin === browserOrigin &&
            result.sessionToken === "cookie-session")
        ) ||
        typeof result.reauthenticateUrl !== "string"
      )
        throw new Error("INVALID_FARM_SESSION_RESPONSE");
      restorePendingRequests(result.userId);
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
    resumeFromState = false,
    originalRequestId?: string,
  ): Promise<T> {
    const token = resumeFromState ? "cookie-session" : await session();
    // Response negotiation must not change durable operation identity: a
    // pending purchase from the older client must keep its original key.
    const operation = JSON.stringify([path.replace(/\?snapshot=1$/, ""), body]);
    if (originalRequestId && (!/^[A-Za-z0-9._:-]{1,120}$/.test(originalRequestId) || (pendingRequests.has(operation) && pendingRequests.get(operation) !== originalRequestId))) throw new Error("FARM_SEED_RECOVERY_CONFLICT");
    const requestId =
      method === "POST"
        ? (originalRequestId ?? pendingRequests.get(operation) ?? crypto.randomUUID())
        : undefined;
    if (requestId) pendingRequests.set(operation, requestId);
    savePendingRequests();
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await timedFetch(path, {
          method,
          headers: {
            ...authHeader(token),
            ...(requestId ? { "x-request-id": requestId } : {}),
            ...(body !== undefined
              ? { "content-type": "application/json" }
              : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          cache: "no-store",
          redirect: "error",
          // Backend acknowledgement 50s < host proxy 55s < browser 60s.
          signal: AbortSignal.timeout(60_000),
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
          // A 409 may describe an unresolved primary or compensation, rather
          // than a rejected operation. Preserve its identity until confirmed.
          (error.status !== 409 ||
            error.code === "FARM_MUTATION_COMPENSATED" ||
            error.code === "MISSION_NOT_COMPLETE" ||
            error.code === "FARM_COIN_INSUFFICIENT" ||
            (path === "farm/v2/wallet/transfer" &&
              error.code === "INSUFFICIENT_FUNDS") ||
            error.code === "FARM_COIN_BALANCE_LIMIT" ||
            error.code === "MISSION_ALREADY_CLAIMED" ||
            error.code.startsWith("CORE_COIN_LAND_"))
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

  const pendingTransfers = () =>
    [...pendingRequests.keys()].flatMap((key) => {
      const [path, body] = JSON.parse(key) as [
        string,
        { direction?: unknown; amount?: unknown } | null,
      ];
      return path === "farm/v2/wallet/transfer" &&
        body &&
        (body.direction === "in" || body.direction === "out") &&
        typeof body.amount === "number"
        ? [{ direction: body.direction as "in" | "out", amount: body.amount }]
        : [];
    });
  return {
    getReauthenticationUrl: () => reauthenticateUrl,
    revokeSession: async () => {
      const token = await session();
      await decode(
        await timedFetch("farm/v2/session", {
          method: "POST",
          headers: {
            ...authHeader(token),
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
    readDailyActivity: () => request<import("./FarmDailyActivityPanel").DailyActivitySnapshot>("farm/v2/activity", "GET"),
    claimDailyActivity: (milestone: number) => request<import("./FarmDailyActivityPanel").DailyActivitySnapshot>("farm/v2/activity/claim", "POST", {milestone}),
    inspectDailyActivity: (kind: "warehouse" | "pet") => request<import("./FarmDailyActivityPanel").DailyActivitySnapshot>("farm/v2/activity/inspect", "POST", {kind}),
    readSignIn: () => request<import("../../signInBridge").SignInSnapshot>("farm/v2/signin", "GET"),
    claimSignInToday: () => request<{status:string}>("farm/v2/signin/claim", "POST", {}),
    claimSignInMakeup: (cycleDay: number) =>
      request<{status:string}>("farm/v2/signin/makeup", "POST", {cycleDay}),
    claimSignInPerfect: () => request<{status:string}>("farm/v2/signin/perfect", "POST", {}),
    claimChaosSeeds: () => request<unknown>("farm/v2/chaos/claim", "POST"),
    configureFarmer: (landId: number, enabled: boolean) =>
      request<unknown>(`farm/v2/farmer/${landId}`, "POST", { enabled }),
    workshop: (command: import("./workshopRuntime").WorkshopCommand) =>
      request<unknown>("farm/v2/workshop", "POST", command),
    pendingWorkshop: () =>
      [...pendingRequests.keys()].flatMap((key) => {
        const [path, command] = JSON.parse(key);
        return path === "farm/v2/workshop"
          ? [command as import("./workshopRuntime").WorkshopCommand]
          : [];
      }),
    pendingFriends: () =>
      [...pendingRequests.keys()].flatMap((key) => {
        const [path, body] = JSON.parse(key);
        const match = /^farm\/v2\/friends\/([^/]+)\/actions$/.exec(path);
        return match
          ? [
              {
                targetId: decodeURIComponent(match[1]),
                kind: body.kind as "BORROW" | "ASSIST",
                landId: body.landId as number,
              },
            ]
          : [];
      }),
    readFriends: () =>
      request<{ friends: { id: string }[] }>("farm/v2/friends", "GET"),
    visitCave: (id: string) =>
      request<import("./publicCave").FarmV2PublicCave>(
        `farm/v2/friends/${encodeURIComponent(id)}/cave`,
        "GET",
      ),
    friendAction: (
      targetId: string,
      kind: "BORROW" | "ASSIST",
      landId: number,
    ) =>
      request<{ successful: boolean }>(
        `farm/v2/friends/${encodeURIComponent(targetId)}/actions`,
        "POST",
        { kind, landId },
      ),
    readSeedRecoveries: () => request<{purchases:FarmSeedRecovery[]}>("farm/v2/recovery/seeds","GET"),
    resumeSeedPurchase: (original:FarmSeedRecovery) => {
      if (!Number.isInteger(original.landId) || original.landId < 1 || original.landId > 5 || !Number.isSafeInteger(original.packs) || original.packs <= 0 || original.packs > 2147483647 || !/^[A-Za-z0-9._:-]{1,120}$/.test(original.requestId)) throw new Error("INVALID_FARM_SEED_RECOVERY");
      return request<unknown>(`farm/v2/seeds/${original.landId}/purchase?snapshot=1`,"POST",{packs:original.packs},false,original.requestId);
    },
    readWallet: () => request<FarmCoinBalances>("farm/v2/wallet", "GET"),
    pendingTransfers,
    transferCoins: async (direction: "in" | "out", amount: number) => {
      // Acquire before the first await: parallel callers must not both pass
      // the pending-journal check before request() records their commands.
      if (transferInFlight) throw new Error("FARM_TRANSFER_PENDING");
      transferInFlight = true;
      try {
        // Restore the per-user journal before deciding whether a NEW transfer is allowed.
        await session();
        const pending = pendingTransfers();
        if (pending.some((p) => p.direction !== direction || p.amount !== amount)) throw new Error("FARM_TRANSFER_PENDING");
        return await request<FarmCoinBalances>("farm/v2/wallet/transfer", "POST", { direction, amount });
      } finally { transferInFlight = false; }
    },
    readState: async () => {
      if (!browserResume || sessionPromise)
        return request<FarmV2State>("farm/v2/state", "GET");
      if (revoked) throw new FarmV2ApiError(401, "FARM_SESSION_NOT_ACTIVE");
      // This same-origin request already carries the HttpOnly cookie and the
      // server validates it before returning state. A session preflight would
      // repeat that verification and add a sequential network round trip.
      reauthenticateUrl = new URL(
        "/api/apps/qiankun-futian/launch?farmV2=1",
        normalizedApiBase.origin,
      ).toString();
      const state = await request<FarmV2State>(
        "farm/v2/state",
        "GET",
        undefined,
        true,
      );
      if (
        typeof state?.player?.userId !== "string" ||
        !state.player.userId.trim()
      )
        throw new Error("INVALID_FARM_STATE_RESPONSE");
      restorePendingRequests(state.player.userId);
      sessionPromise = Promise.resolve("cookie-session");
      return state;
    },
    unlockCoinLand: (landId: number) =>
      request<unknown>(`farm/v2/lands/${landId}/unlock?snapshot=1`, "POST"),
    sow: (landId: number) =>
      request<FarmV2MutationResult>(
        `farm/v2/lands/${landId}/sow?snapshot=1`,
        "POST",
      ),
    harvest: (landId: number) =>
      request<FarmV2MutationResult>(
        `farm/v2/lands/${landId}/harvest?snapshot=1`,
        "POST",
      ),
    purchaseSeeds: (landId: number, packs: number) =>
      request<unknown>(`farm/v2/seeds/${landId}/purchase?snapshot=1`, "POST", {
        packs,
      }),
    exchangeCrops: (landId: number, cropQuantity: number) =>
      request<unknown>(`farm/v2/crops/${landId}/exchange?snapshot=1`, "POST", {
        cropQuantity,
      }),
  };
}

