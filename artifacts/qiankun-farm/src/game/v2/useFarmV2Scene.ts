import { useCallback, useEffect, useRef, useState } from "react";
import {
  createFarmV2Api,
  FarmV2ApiError,
  type FarmV2Operation,
} from "./farmV2ApiClient";
import { mapServerLands, mapServerWarehouse } from "./farmV2SceneAdapter";
import type { Plot, CropInventory } from "../types";

type Snapshot = {
  serverTime: number;
  pendingMutation?: {
    requestId: string;
    operation: "purchaseSeeds" | "exchangeCrops";
    landId: number;
    quantity: number;
  } | null;
  player: {
    chaosSeedState?: { pending: number } | null;
    warehouseState: {
      seeds: Record<string, number>;
      crops: Record<string, number>;
    };
  };
  lands: Parameters<typeof mapServerLands>[0];
};

type SceneData = {
  sessionEpoch: number;
  serverTime: number;
  receivedAt: number;
  chaosPending: number;
  plots: Plot[];
  seedInventory: CropInventory;
  cropInventory: CropInventory;
};

/**
 * Authenticated server-driven farm state.
 * This hook never reads prototype saves and never invents a successful mutation.
 */
export function useFarmV2Scene(baseUrl: string, launchToken: string | null) {
  const [data, setData] = useState<SceneData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<{
    operation: FarmV2Operation;
    landId: number;
    quantity?: number;
  } | null>(null);
  const mutationInFlight = useRef(false);
  const readSequence = useRef(0);
  const uncertainMutation = useRef<{ key: string; requestId: string } | null>(
    null,
  );
  const session = useRef({ baseUrl, launchToken, epoch: 0 });
  if (
    session.current.baseUrl !== baseUrl ||
    session.current.launchToken !== launchToken
  ) {
    session.current = {
      baseUrl,
      launchToken,
      epoch: session.current.epoch + 1,
    };
    readSequence.current += 1;
    uncertainMutation.current = null;
    mutationInFlight.current = false;
  }
  const retryEpoch = useRef(session.current.epoch);

  const refresh = useCallback(async () => {
    const epoch = session.current.epoch;
    const sequence = ++readSequence.current;
    if (!launchToken) {
      setData(null);
      setError("FARM_V2_LAUNCH_TOKEN_REQUIRED");
      setLoading(false);
      return false;
    }
    setLoading(true);
    try {
      const snapshot = (await createFarmV2Api({
        baseUrl,
        launchToken,
      }).readState()) as unknown as Snapshot;
      if (!Number.isFinite(snapshot.serverTime))
        throw new Error("INVALID_FARM_SERVER_TIME");
      const chaosPending = snapshot.player.chaosSeedState?.pending ?? 0;
      if (
        !Number.isInteger(chaosPending) ||
        chaosPending < 0 ||
        chaosPending > 3
      )
        throw new Error("INVALID_CHAOS_PENDING");
      const nextData = {
        chaosPending,
        sessionEpoch: epoch,
        serverTime: snapshot.serverTime,
        receivedAt: Date.now(),
        plots: mapServerLands(snapshot.lands, snapshot.serverTime),
        ...mapServerWarehouse(snapshot.player.warehouseState),
      };
      if (sequence !== readSequence.current || epoch !== session.current.epoch)
        return false;
      if (snapshot.pendingMutation) {
        const pending = snapshot.pendingMutation;
        if (
          !pending.requestId ||
          !["purchaseSeeds", "exchangeCrops"].includes(pending.operation) ||
          !Number.isInteger(pending.landId) ||
          pending.landId < 1 ||
          pending.landId > 6 ||
          !Number.isSafeInteger(pending.quantity) ||
          pending.quantity <= 0
        )
          throw new Error("INVALID_PENDING_MUTATION");
        uncertainMutation.current = {
          key: `${pending.operation}:${pending.landId}:${pending.quantity}`,
          requestId: pending.requestId,
        };
        setPendingRetry({
          operation: pending.operation,
          landId: pending.landId,
          quantity: pending.quantity,
        });
        retryEpoch.current = epoch;
      }
      setData(nextData);
      setError(null);
      return true;
    } catch (cause) {
      if (sequence !== readSequence.current) return false;
      setData(null);
      setError(cause instanceof Error ? cause.message : "FARM_V2_STATE_FAILED");
      return false;
    } finally {
      if (sequence === readSequence.current) setLoading(false);
    }
  }, [baseUrl, launchToken]);

  useEffect(() => {
    setData(null);
    setPendingRetry(null);
    setBusy(false);
    void refresh();
    return () => {
      readSequence.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (!data || busy || loading || pendingRetry) return;
    const maturity = Math.min(
      ...data.plots
        .filter(
          (plot) => plot.state === "growing" && plot.growthEndTime !== null,
        )
        .map((plot) => plot.growthEndTime!),
    );
    if (!Number.isFinite(maturity)) return;
    const delay = Math.max(
      250,
      maturity - data.serverTime - (Date.now() - data.receivedAt) + 100,
    );
    const timer = setTimeout(
      () => {
        void refresh();
      },
      Math.min(delay, 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [data, busy, loading, pendingRetry, refresh]);

  const mutate = useCallback(
    async (operation: FarmV2Operation, landId: number, quantity?: number) => {
      const epoch = session.current.epoch;
      if (!launchToken || mutationInFlight.current) return false;
      if (operation === "claimChaosSeeds" && landId !== 6) return false;
      if (!Number.isInteger(landId) || landId < 1 || landId > 6) return false;
      if (
        (operation === "purchaseSeeds" || operation === "exchangeCrops") &&
        (!Number.isSafeInteger(quantity) || (quantity ?? 0) <= 0)
      ) {
        setError("INVALID_QUANTITY");
        return false;
      }
      const key = `${operation}:${landId}:${quantity ?? ""}`;
      // An ambiguous network failure must not be retried with a fresh ID.
      if (uncertainMutation.current && uncertainMutation.current.key !== key) {
        setError("FARM_V2_PREVIOUS_MUTATION_UNCONFIRMED");
        return false;
      }
      const requestId =
        uncertainMutation.current?.requestId ?? crypto.randomUUID();
      uncertainMutation.current = { key, requestId };
      mutationInFlight.current = true;
      setBusy(true);
      try {
        const api = createFarmV2Api({ baseUrl, launchToken });
        if (operation === "sow") await api.sow(landId, requestId);
        else if (operation === "harvest") await api.harvest(landId, requestId);
        else if (operation === "claimChaosSeeds")
          await api.claimChaosSeeds(requestId);
        else {
          if (operation === "purchaseSeeds")
            await api.purchaseSeeds(landId, quantity!, requestId);
          else await api.exchangeCrops(landId, quantity!, requestId);
        }
        // The POST is confirmed. A subsequent GET failure must never cause a
        // replay of the already committed mutation.
        if (epoch !== session.current.epoch) return false;
        uncertainMutation.current = null;
        setPendingRetry(null);
        const stateLoaded = await refresh();
        if (epoch !== session.current.epoch) return false;
        if (!stateLoaded)
          setError("FARM_V2_MUTATION_CONFIRMED_STATE_REFRESH_FAILED");
        return stateLoaded;
      } catch (cause) {
        if (epoch !== session.current.epoch) return false;
        // Timeout (408), conflict (409), rate limit (429), and 5xx responses
        // do not prove that the transaction was rolled back. Keep the same ID.
        const definitiveRejection =
          cause instanceof FarmV2ApiError && cause.definitive;
        if (definitiveRejection) {
          uncertainMutation.current = null;
          setPendingRetry(null);
        } else {
          setPendingRetry({ operation, landId, quantity });
          retryEpoch.current = epoch;
        }
        // A failed mutation must not leave the previously loaded state looking current.
        setData(null);
        setError(
          cause instanceof Error ? cause.message : "FARM_V2_MUTATION_FAILED",
        );
        return false;
      } finally {
        if (epoch === session.current.epoch) {
          mutationInFlight.current = false;
          setBusy(false);
        }
      }
    },
    [baseUrl, launchToken, refresh],
  );

  return {
    data: data?.sessionEpoch === session.current.epoch ? data : null,
    error,
    loading,
    busy,
    refresh,
    mutate,
    pendingRetry:
      retryEpoch.current === session.current.epoch ? pendingRetry : null,
  };
}
