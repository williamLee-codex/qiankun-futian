import { useCallback, useEffect, useRef, useState } from 'react';
import { createFarmV2Api, FarmV2ApiError } from './farmV2ApiClient';
import { mapServerLands, mapServerWarehouse } from './farmV2SceneAdapter';
import type { Plot, CropInventory } from '../types';

type Snapshot = {
  player: { warehouseState: { seeds: Record<string, number>; crops: Record<string, number> } };
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
  const [data, setData] = useState<SceneData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const mutationInFlight = useRef(false);
  const readSequence = useRef(0);
  const uncertainMutation = useRef<{ key: string; requestId: string } | null>(null);

  const refresh = useCallback(async () => {
    const sequence = ++readSequence.current;
    if (!launchToken) {
      setData(null);
      setError('FARM_V2_LAUNCH_TOKEN_REQUIRED');
      setLoading(false);
      return false;
    }
    setLoading(true);
    try {
      const snapshot = await createFarmV2Api({ baseUrl, launchToken }).readState() as unknown as Snapshot;
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
      setError(cause instanceof Error ? cause.message : 'FARM_V2_STATE_FAILED');
      return false;
    } finally {
      if (sequence === readSequence.current) setLoading(false);
    }
  }, [baseUrl, launchToken]);

  useEffect(() => {
    void refresh();
    return () => { readSequence.current += 1; };
  }, [refresh]);

  const mutate = useCallback(async (
    operation: 'sow' | 'harvest' | 'purchaseSeeds' | 'exchangeCrops',
    landId: number,
    quantity?: number,
  ) => {
    if (!launchToken || mutationInFlight.current) return false;
    if (!Number.isInteger(landId) || landId < 1 || landId > 6) return false;
    const key = `${operation}:${landId}:${quantity ?? ''}`;
    // An ambiguous network failure must not be retried with a fresh ID.
    if (uncertainMutation.current && uncertainMutation.current.key !== key) {
      setError('FARM_V2_PREVIOUS_MUTATION_UNCONFIRMED');
      return false;
    }
    const requestId = uncertainMutation.current?.requestId ?? crypto.randomUUID();
    uncertainMutation.current = { key, requestId };
    mutationInFlight.current = true;
    setBusy(true);
    try {
      const api = createFarmV2Api({ baseUrl, launchToken });
      if (operation === 'sow') await api.sow(landId, requestId);
      else if (operation === 'harvest') await api.harvest(landId, requestId);
      else {
        if (!Number.isSafeInteger(quantity) || (quantity ?? 0) <= 0) throw new Error('INVALID_QUANTITY');
        if (operation === 'purchaseSeeds') await api.purchaseSeeds(landId, quantity!, requestId);
        else await api.exchangeCrops(landId, quantity!, requestId);
      }
      // A successful mutation response confirms the operation; a failed state
      // refresh must not cause the completed operation to be submitted again.
      uncertainMutation.current = null;
      return await refresh();
    } catch (cause) {
      // Explicit HTTP rejection is definitive; transport failure is ambiguous.
      // Preserve the ID only for ambiguous failures, never for a new action.
      if (cause instanceof FarmV2ApiError) uncertainMutation.current = null;
      // A failed mutation must not leave the previously loaded state looking current.
      setData(null);
      setError(cause instanceof Error ? cause.message : 'FARM_V2_MUTATION_FAILED');
      return false;
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }, [baseUrl, launchToken, refresh]);

  return { data, error, loading, busy, refresh, mutate };
}
