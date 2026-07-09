import type { GameState } from './types';
import { EMPTY_INVENTORY } from './types';

export const initialState: GameState = {
  coins: 100,
  crystals: 10,
  totalDeposit: 0,
  weather: '晴',
  selectedPlotId: null,
  plantQuantity: 20,
  cropInventory: { ...EMPTY_INVENTORY },
  warehouseSeeds: 50,
  farmerUnlocked: false,
  openPanel: null,
  harvestAnimations: [],

  plots: [
    /* ── 第1塊：微芒凡土（初始解鎖）── */
    {
      id: 0, name: '微芒凡土', maxSeeds: 20,
      unlocked: true, unlockCoins: null, unlockCrystals: null,
      state: 'empty', plantCount: 0, growthEndTime: null,
      cropId: 'yaojin',
      cropName: '曜金粟', seedName: '曜金種子', cropEmoji: '🌾',
      harvestCount: 20,
      seedBuyRate: '1金幣=20顆', growthHours: 4, yieldCrystal: false,
    },
    /* ── 第2塊：幽熒沃土（88金幣解鎖）── */
    {
      id: 1, name: '幽熒沃土', maxSeeds: 15,
      unlocked: false, unlockCoins: 88, unlockCrystals: null,
      state: 'empty', plantCount: 0, growthEndTime: null,
      cropId: 'youying',
      cropName: '月海曇', seedName: '幽熒種子', cropEmoji: '🌙',
      harvestCount: 15,
      seedBuyRate: '1金幣=10顆', growthHours: 6, yieldCrystal: false,
    },
    /* ── 第3塊：朱砂烈土（888金幣解鎖）── */
    {
      id: 2, name: '朱砂烈土', maxSeeds: 10,
      unlocked: false, unlockCoins: 888, unlockCrystals: null,
      state: 'empty', plantCount: 0, growthEndTime: null,
      cropId: 'zhusha',
      cropName: '赤血參', seedName: '朱砂種子', cropEmoji: '🌺',
      harvestCount: 10,
      seedBuyRate: '1金幣=4顆', growthHours: 8, yieldCrystal: false,
    },
    /* ── 第4塊：曜紫靈土（累積儲值100水晶解鎖）── */
    {
      id: 3, name: '曜紫靈土', maxSeeds: 6,
      unlocked: false, unlockCoins: null, unlockCrystals: 100,
      state: 'empty', plantCount: 0, growthEndTime: null,
      cropId: 'yaozi',
      cropName: '天樞蔓', seedName: '曜紫種子', cropEmoji: '🌿',
      harvestCount: 6,
      seedBuyRate: '2金幣=3顆', growthHours: 10, yieldCrystal: false,
    },
    /* ── 第5塊：翡翠聖土（累積儲值300水晶解鎖）── */
    {
      id: 4, name: '翡翠聖土', maxSeeds: 4,
      unlocked: false, unlockCoins: null, unlockCrystals: 300,
      state: 'empty', plantCount: 0, growthEndTime: null,
      cropId: 'feicui',
      cropName: '太微蓮', seedName: '翡翠種子', cropEmoji: '🪷',
      harvestCount: 4,
      seedBuyRate: '1金幣=1顆', growthHours: 12, yieldCrystal: false,
    },
    /* ── 第6塊：黑金晶土（累積儲值600水晶解鎖）── */
    {
      id: 5, name: '黑金晶土', maxSeeds: 2,
      unlocked: false, unlockCoins: null, unlockCrystals: 600,
      state: 'empty', plantCount: 0, growthEndTime: null,
      cropId: 'heijin',
      cropName: '混沌晶華', seedName: '混沌種子', cropEmoji: '💎',
      harvestCount: 2,
      seedBuyRate: '每日免費補給1顆', growthHours: 24, yieldCrystal: true,
    },
  ],

  pets: [
    {
      id: 0, name: '尋星犬', grade: '凡品',
      owned: false, active: false, fed: false, fedUntil: null, cooldownUntil: null,
      acquireType: 'shop-coins', acquireCost: 300, acquireDepositRequired: 0,
      description: '凡品靈犬，忠誠守護田地。飢餓時可能偷食第2～5塊田成熟作物，第1與第6塊不受影響。',
    },
    {
      id: 1, name: '辟邪狻猊', grade: '靈品',
      owned: false, active: false, fed: false, fedUntil: null, cooldownUntil: null,
      acquireType: 'shop-crystals', acquireCost: 100, acquireDepositRequired: 0,
      description: '靈品神獸，威猛驅邪。飢餓時可能偷食第2～5塊田成熟作物，第1與第6塊不受影響。',
    },
    {
      id: 2, name: '噬時諦聽', grade: '仙品',
      owned: false, active: false, fed: false, fedUntil: null, cooldownUntil: null,
      acquireType: 'deposit', acquireCost: 0, acquireDepositRequired: 450,
      description: '仙品靈獸，能壓縮時間流速，大幅縮短作物成熟時間。累積儲值450水晶自動贈送。',
    },
    {
      id: 3, name: '乾坤麒麟', grade: '神品',
      owned: false, active: false, fed: false, fedUntil: null, cooldownUntil: null,
      acquireType: 'deposit', acquireCost: 0, acquireDepositRequired: 799,
      description: '神品聖獸，乾坤之力加持，令所有作物產量倍增。累積儲值799水晶自動贈送。',
    },
  ],

  tasks: [
    { id: 'login',   name: '每日登入',    done: true,  claimed: false, reward: { coins: 5, crystals: 0 } },
    { id: 'plant',   name: '完成一次播種', done: false, claimed: false, reward: { coins: 5, crystals: 0 } },
    { id: 'harvest', name: '完成一次收成', done: false, claimed: false, reward: { coins: 5, crystals: 0 } },
  ],
};
