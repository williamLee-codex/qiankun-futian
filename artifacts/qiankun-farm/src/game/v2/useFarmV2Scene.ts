import type { FarmSeedRecovery } from "./farmV2ApiClient";
import type { WorkshopCommand, WorkshopWarehouse } from "./workshopRuntime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFarmV2Api } from "./farmV2ApiClient";
import { resolveFarmV2MutationSnapshot } from "./farmV2MutationSnapshot";
import { mapServerLands, mapServerWarehouse } from "./farmV2SceneAdapter";
import type { Plot, CropInventory } from "../types";

type Snapshot = {
  features?: { localCoins?: boolean };
  player: {
    missionState?: import("./missionRuntime").MissionState;
    petState?: {
      owned: string[];
      activePetId: string | null;
      activeUntil: number | null;
    };
    farmerState?: import("./farmerRuntime").FarmerState;
    chaosSeedState?: import("./chaosSeedRuntime").ChaosSeedState | null;
    warehouseState: {
      seeds: Record<string, number>;
      crops: Record<string, number>;
    };
  };
  lands: Parameters<typeof mapServerLands>[0];
};

type SceneData = {
  localCoins?: boolean;
  warehouse: WorkshopWarehouse;
  missions?: import("./missionRuntime").MissionState;
  pets?: {
    owned: string[];
    activePetId: string | null;
    activeUntil: number | null;
  };
  farmer?: import("./farmerRuntime").FarmerState;
  chaos?: import("./chaosSeedRuntime").ChaosSeedState | null;
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
  const [pendingWorkshop, setPendingWorkshop] = useState<WorkshopCommand[]>([]);
  const [pendingFriends, setPendingFriends] = useState<
    { targetId: string; kind: "BORROW" | "ASSIST"; landId: number }[]
  >([]);
  const mutationInFlight = useRef(false);
  const readSequence = useRef(0);

  const refresh = useCallback(
    async (mutationResult?: unknown) => {
      const sequence = ++readSequence.current;
      if (!launchToken) {
        setData(null);
        setError("FARM_V2_LAUNCH_TOKEN_REQUIRED");
        setLoading(false);
        return false;
      }
      setLoading(true);
      try {
        const snapshot = await resolveFarmV2MutationSnapshot<Snapshot>(
          mutationResult,
          () => api!.readState(),
        );
        const nextData = {
          warehouse: snapshot.player.warehouseState as WorkshopWarehouse,
          localCoins: snapshot.features?.localCoins,
          missions: snapshot.player.missionState,
          pets: snapshot.player.petState,
          farmer: snapshot.player.farmerState,
          chaos: snapshot.player.chaosSeedState,
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
        setPendingWorkshop(api?.pendingWorkshop() ?? []);
        setReauthenticateUrl(api?.getReauthenticationUrl() ?? null);
        setError(
          cause instanceof Error ? cause.message : "FARM_V2_STATE_FAILED",
        );
        return false;
      } finally {
        if (sequence === readSequence.current) {
          setPendingWorkshop(api?.pendingWorkshop() ?? []);
          setPendingFriends(api?.pendingFriends() ?? []);
          setLoading(false);
        }
      }
    },
    [api, launchToken],
  );

  useEffect(() => {
    void refresh();
    return () => {
      readSequence.current += 1;
    };
  }, [refresh]);

  const mutate = useCallback(
    async (
      operation:
        | "sow"
        | "harvest"
        | "purchaseSeeds"
        | "exchangeCrops"
        | "claimChaos"
        | "configureFarmer"
        | "unlockCoinLand",
      landId: number,
      quantity?: number,
    ) => {
      if (!launchToken || mutationInFlight.current) return false;
      if (!Number.isInteger(landId) || landId < 1 || landId > 6) return false;
      mutationInFlight.current = true;
      setBusy(true);
      try {
        if (!api) throw new Error("FARM_V2_LAUNCH_TOKEN_REQUIRED");
        let result: unknown;
        if (operation === "unlockCoinLand")
          result = await api.unlockCoinLand(landId);
        else if (operation === "claimChaos") await api.claimChaosSeeds();
        else if (operation === "configureFarmer")
          await api.configureFarmer(landId, quantity === 1);
        else if (operation === "sow") result = await api.sow(landId);
        else if (operation === "harvest") result = await api.harvest(landId);
        else {
          if (!Number.isSafeInteger(quantity) || (quantity ?? 0) <= 0)
            throw new Error("INVALID_QUANTITY");
          if (operation === "purchaseSeeds")
            result = await api.purchaseSeeds(landId, quantity!);
          else result = await api.exchangeCrops(landId, quantity!);
        }
        // Use the server's post-commit state; older responses require a read.
        return await refresh(result);
      } catch (cause) {
        // Mutation failures do not invalidate the last confirmed farm snapshot.
        // In particular, insufficient local coins or a pending idempotent request
        // must not replace the whole farm with a fatal loading screen.
        // Only an explicitly invalid session requires reauthentication.
        const code = cause instanceof Error ? cause.message : "";
        const sessionInvalid = code === "FARM_SESSION_NOT_ACTIVE" ||
          code === "FARM_V2_LAUNCH_TOKEN_REQUIRED" ||
          code === "AUTH_REQUIRED";
        if (sessionInvalid) setData(null);
        setReauthenticateUrl(sessionInvalid ? api?.getReauthenticationUrl() ?? null : null);
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

  const workshop = useCallback(
    async (command: WorkshopCommand) => {
      if (!api || mutationInFlight.current) return false;
      mutationInFlight.current = true;
      setBusy(true);
      try {
        await api.workshop(command);
        setPendingWorkshop(api.pendingWorkshop());
        return await refresh();
      } catch (cause) {
        setPendingWorkshop(api.pendingWorkshop());
        setError(cause instanceof Error ? cause.message : "WORKSHOP_FAILED");
        return false;
      } finally {
        mutationInFlight.current = false;
        setBusy(false);
      }
    },
    [api, refresh],
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
  const friendAction = useCallback(
    async (targetId: string, kind: "BORROW" | "ASSIST", landId: number) => {
      if (!api || mutationInFlight.current) return false;
      mutationInFlight.current = true;
      setBusy(true);
      try {
        const result = await api.friendAction(targetId, kind, landId);
        await refresh();
        return result.successful;
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "FRIEND_ACTION_FAILED",
        );
        return false;
      } finally {
        setPendingFriends(api.pendingFriends());
        mutationInFlight.current = false;
        setBusy(false);
      }
    },
    [api, refresh],
  );
  const readWallet = useCallback(() => {
    if (!api) throw new Error("AUTH_REQUIRED");
    return api.readWallet();
  }, [api]);
  return {
    readWallet,
    readSeedRecoveries: () => {if(!api) throw new Error("AUTH_REQUIRED"); return api.readSeedRecoveries();},
    resumeSeedPurchase: async (original:FarmSeedRecovery) => {
      if(!api || mutationInFlight.current) return false;
      mutationInFlight.current=true;setBusy(true);
      try { const result=await api.resumeSeedPurchase(original);return await refresh(result); }
      catch(cause) {setError(cause instanceof Error?cause.message:"FARM_SEED_RECOVERY_FAILED");return false;}
      finally {mutationInFlight.current=false;setBusy(false);}
    },
    pendingTransfers: () => api?.pendingTransfers() ?? [],
    transferCoins: async (direction: "in" | "out", amount: number) => {
      if (!api) throw new Error("AUTH_REQUIRED");
      if (mutationInFlight.current) throw new Error("FARM_OPERATION_BUSY");
      mutationInFlight.current = true;
      setBusy(true);
      try {
        return await api.transferCoins(direction, amount);
      } finally {
        mutationInFlight.current = false;
        setBusy(false);
      }
    },
    friendAction,
    pendingFriends,
    readFriends: () => {
      if (!api) throw new Error("AUTH_REQUIRED");
      return api.readFriends();
    },
    visitCave: (id: string) => {
      if (!api) throw new Error("AUTH_REQUIRED");
      return api.visitCave(id);
    },
    workshop,
    pendingWorkshop,
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
