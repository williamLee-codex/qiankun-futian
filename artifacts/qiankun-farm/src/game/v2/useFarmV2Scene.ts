import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFarmV2Api } from "./farmV2ApiClient";
import { mapServerLands, mapServerWarehouse } from "./farmV2SceneAdapter";
import type { Plot, CropInventory } from "../types";

type Snapshot = {
  player: {
    warehouseState: {
      seeds: Record<string, number>;
      crops: Record<string, number>;
    };
  };
  lands: Parameters<typeof mapServerLands>[0];
};

type SceneData = {
  plots: Plot[];
  seedInventory: CropInventory;
  cropInventory: CropInventory;
};

/**
 * Authenticated server-driven farm state.
 * This hook never reads prototype saves and never invents a successful mutation.
 */
export function useFarmV2Scene(baseUrl: string, launchToken: string | null) {
  const api = useMemo(
    () => (launchToken ? createFarmV2Api({ baseUrl, launchToken }) : null),
    [baseUrl, launchToken],
  );
  const [reauthenticateUrl, setReauthenticateUrl] = useState<string | null>(
    null,
  );
  const [data, setData] = useState<SceneData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const mutationInFlight = useRef(false);
  const readSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++readSequence.current;
    if (!launchToken) {
      setData(null);
      setError("FARM_V2_LAUNCH_TOKEN_REQUIRED");
      setLoading(false);
      return false;
    }
    setLoading(true);
    try {
      const snapshot = (await api!.readState()) as unknown as Snapshot;
      const nextData = {
        plots: mapServerLands(snapshot.lands),
        ...mapServerWarehouse(snapshot.player.warehouseState),
      };
      if (sequence !== readSequence.current) return false;
      setData(nextData);
      setError(null);
      return true;
    } catch (cause) {
      if (sequence !== readSequence.current) return false;
      setData(null);
      setReauthenticateUrl(api?.getReauthenticationUrl() ?? null);
      setError(cause instanceof Error ? cause.message : "FARM_V2_STATE_FAILED");
      return false;
    } finally {
      if (sequence === readSequence.current) setLoading(false);
    }
  }, [api, launchToken]);

  useEffect(() => {
    void refresh();
    return () => {
      readSequence.current += 1;
    };
  }, [refresh]);

  const mutate = useCallback(
    async (
      operation: "sow" | "harvest" | "purchaseSeeds" | "exchangeCrops",
      landId: number,
      quantity?: number,
    ) => {
      if (!launchToken || mutationInFlight.current) return false;
      if (!Number.isInteger(landId) || landId < 1 || landId > 6) return false;
      mutationInFlight.current = true;
      setBusy(true);
      try {
        if (!api) throw new Error("FARM_V2_LAUNCH_TOKEN_REQUIRED");
        if (operation === "sow") await api.sow(landId);
        else if (operation === "harvest") await api.harvest(landId);
        else {
          if (!Number.isSafeInteger(quantity) || (quantity ?? 0) <= 0)
            throw new Error("INVALID_QUANTITY");
          if (operation === "purchaseSeeds")
            await api.purchaseSeeds(landId, quantity!);
          else await api.exchangeCrops(landId, quantity!);
        }
        // Always re-read committed server state, including inventory and access.
        return await refresh();
      } catch (cause) {
        // A failed mutation must not leave the previously loaded state looking current.
        setData(null);
        setReauthenticateUrl(api?.getReauthenticationUrl() ?? null);
        setError(
          cause instanceof Error ? cause.message : "FARM_V2_MUTATION_FAILED",
        );
        return false;
      } finally {
        mutationInFlight.current = false;
        setBusy(false);
      }
    },
    [api, launchToken, refresh],
  );

  const endSession = useCallback(async () => {
    if (!api) return;
    mutationInFlight.current = true;
    setBusy(true);
    try {
      await api.revokeSession();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "FARM_SESSION_REVOKE_FAILED",
      );
      return;
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
    readSequence.current += 1;
    setLoading(false);
    setData(null);
    setReauthenticateUrl(api.getReauthenticationUrl());
    setError("FARM_SESSION_NOT_ACTIVE");
  }, [api]);
  return {
    endSession,
    data,
    error,
    loading,
    busy,
    refresh,
    mutate,
    reauthenticateUrl,
  };
}
