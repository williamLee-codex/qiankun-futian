import type { GameState } from './types';

export const initialState: GameState = {
  coins: 100,
  crystals: 10,
  totalDeposit: 0,
  weather: '晴',
  selectedPlotId: null,
  plantQuantity: 20,
  warehouseCrops: 0,
  warehouseSeeds: 50,
  farmerUnlocked: false,
  openPanel: null,
  harvestAnimations: [],
  plots: [
    { id: 0, name: '微芒凡土', maxSeeds: 20, unlocked: true,  unlockCrystals: null, state: 'empty', plantCount: 0, growthEndTime: null },
    { id: 1, name: '幽熒沃土', maxSeeds: 15, unlocked: true,  unlockCrystals: null, state: 'empty', plantCount: 0, growthEndTime: null },
    { id: 2, name: '朱砂烈土', maxSeeds: 10, unlocked: true,  unlockCrystals: null, state: 'empty', plantCount: 0, growthEndTime: null },
    { id: 3, name: '曜紫靈土', maxSeeds:  6, unlocked: false, unlockCrystals: 100,  state: 'empty', plantCount: 0, growthEndTime: null },
    { id: 4, name: '翡翠聖土', maxSeeds:  4, unlocked: false, unlockCrystals: 300,  state: 'empty', plantCount: 0, growthEndTime: null },
    { id: 5, name: '黑金晶土', maxSeeds:  2, unlocked: false, unlockCrystals: 600,  state: 'empty', plantCount: 0, growthEndTime: null },
  ],
  pets: [
    {
      id: 0, name: '尋星犬', grade: '凡品', owned: false, active: false, fed: false, fedUntil: null, cooldownUntil: null,
      acquireType: 'shop-coins', acquireCost: 300, acquireDepositRequired: 0,
      description: '忠誠的凡品靈犬，善於追蹤星光寶物，提升普通田地產量。',
    },
    {
      id: 1, name: '辟邪狻猊', grade: '靈品', owned: false, active: false, fed: false, fedUntil: null, cooldownUntil: null,
      acquireType: 'shop-crystals', acquireCost: 100, acquireDepositRequired: 0,
      description: '威武的靈品神獸，能驅散邪氣，守護田地免遭侵擾。',
    },
    {
      id: 2, name: '噬時諦聽', grade: '仙品', owned: false, active: false, fed: false, fedUntil: null, cooldownUntil: null,
      acquireType: 'deposit', acquireCost: 0, acquireDepositRequired: 450,
      description: '神秘的仙品靈獸，能壓縮時間流速，大幅縮短作物成熟時間。',
    },
    {
      id: 3, name: '乾坤麒麟', grade: '神品', owned: false, active: false, fed: false, fedUntil: null, cooldownUntil: null,
      acquireType: 'deposit', acquireCost: 0, acquireDepositRequired: 799,
      description: '傳說中的神品聖獸，乾坤之力加持，令所有作物產量翻倍。',
    },
  ],
  tasks: [
    { id: 'login',   name: '每日登入',   done: true  },
    { id: 'plant',   name: '完成一次播種', done: false },
    { id: 'harvest', name: '完成一次收成', done: false },
  ],
};
