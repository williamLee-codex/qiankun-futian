import type { FarmAccessState } from './accessRuntime';
import { unlockCoinLand } from './accessRuntime';
import type { FarmWarehouse, Wallet } from './warehouseRuntime';

export function unlockCoinLandTransaction(input: {
  access: FarmAccessState;
  wallet: Wallet;
  warehouse: FarmWarehouse;
  landId: 2 | 3;
  now: number;
}): {
  access: FarmAccessState;
  wallet: Wallet;
  warehouse: FarmWarehouse;
  coinsSpent: number;
} {
  const result = unlockCoinLand({
    access: input.access,
    landId: input.landId,
    coinBalance: input.wallet.coins,
    now: input.now,
  });

  return {
    access: result.access,
    wallet: { ...input.wallet, coins: input.wallet.coins - result.coinsSpent },
    warehouse: input.warehouse,
    coinsSpent: result.coinsSpent,
  };
}
