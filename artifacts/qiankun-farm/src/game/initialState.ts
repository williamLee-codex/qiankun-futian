import type { GameState } from './types';
import { EMPTY_INVENTORY } from './types';

/** 下一次每日中午 12:00（若已過今日中午則為明日中午）*/
function nextNoon(from: number): number {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export const initialState: GameState = {
  coins: 20,
  crystals: 0,
  totalDeposit: 999,
  weather: '晴',
  selectedPlotId: null,
  plantQuantity: 20,
  cropInventory: { ...EMPTY_INVENTORY },
  seedInventory: { yaojin: 50, youying: 0, zhusha: 0, yaozi: 0, feicui: 0, heijin: 0 },
  farmerUnlocked: true,
  farmerActive: false,
  openPanel: null,
  harvestAnimations: [],
  dailyBorrowCount: 0,
  dailyBorrowLimit: 5,
  dailyBorrowResetAt: nextNoon(Date.now()),
  /**
   * 好友借運狀態，以平台 platformFriends 的 uid 為索引鍵（見 src/platform）。
   * 好友身份資料（暱稱等）不存在這裡，一律由平台 platformFriends 提供。
   * plots[0～3] 對應對方福田第2～5塊，模擬資料。
   */
  borrowState: {
    'friend-001': {
      cooldownUntil: null,
      plots: [
        { readyAt: Date.now() },              // 第2塊：剛成熟，可借運，尚未超時
        { readyAt: null },                     // 第3塊：未成熟
        { readyAt: Date.now() - 2 * 60 * 60 * 1000 }, // 第4塊：已超時2小時，可借運也可一鍵採收
        { readyAt: null },                     // 第5塊：未成熟
      ],
    },
    'friend-002': {
      cooldownUntil: null,
      plots: [
        { readyAt: null },
        { readyAt: Date.now() - 90 * 60 * 1000 }, // 第3塊：已超時90分鐘
        { readyAt: null },
        { readyAt: Date.now() },                   // 第5塊：剛成熟，尚未超時
      ],
    },
    'friend-003': {
      cooldownUntil: null,
      plots: [
        { readyAt: null },
        { readyAt: null },
        { readyAt: null },
        { readyAt: null },
      ],
    },
  },

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
      readyAt: null, borrowable: false,
    },
    /* ── 第2塊：幽熒沃土（88金幣解鎖）── */
    {
      id: 1, name: '幽熒沃土', maxSeeds: 10,
      unlocked: false, unlockCoins: 88, unlockCrystals: null,
      state: 'empty', plantCount: 0, growthEndTime: null,
      cropId: 'youying',
      cropName: '月海曇', seedName: '幽熒種子', cropEmoji: '🌙',
      harvestCount: 10,
      seedBuyRate: '1金幣=10顆', growthHours: 6, yieldCrystal: false,
      readyAt: null, borrowable: true,
    },
    /* ── 第3塊：朱砂烈土（888金幣解鎖）── */
    {
      id: 2, name: '朱砂烈土', maxSeeds: 6,
      unlocked: false, unlockCoins: 888, unlockCrystals: null,
      state: 'empty', plantCount: 0, growthEndTime: null,
      cropId: 'zhusha',
      cropName: '赤血參', seedName: '朱砂種子', cropEmoji: '🌺',
      harvestCount: 6,
      seedBuyRate: '1金幣=6顆', growthHours: 8, yieldCrystal: false,
      readyAt: null, borrowable: true,
    },
    /* ── 第4塊：曜紫靈土（累積儲值100水晶解鎖）── */
    {
      id: 3, name: '曜紫靈土', maxSeeds: 4,
      unlocked: true, unlockCoins: null, unlockCrystals: 100,
      state: 'empty', plantCount: 0, growthEndTime: null,
      cropId: 'yaozi',
      cropName: '天樞蔓', seedName: '曜紫種子', cropEmoji: '🌿',
      harvestCount: 4,
      seedBuyRate: '1金幣=4顆', growthHours: 10, yieldCrystal: false,
      readyAt: null, borrowable: true,
    },
    /* ── 第5塊：翡翠聖土（累積儲值300水晶解鎖）── */
    {
      id: 4, name: '翡翠聖土', maxSeeds: 3,
      unlocked: true, unlockCoins: null, unlockCrystals: 300,
      state: 'empty', plantCount: 0, growthEndTime: null,
      cropId: 'feicui',
      cropName: '太微蓮', seedName: '翡翠種子', cropEmoji: '🪷',
      harvestCount: 3,
      seedBuyRate: '1金幣=3顆', growthHours: 12, yieldCrystal: false,
      readyAt: null, borrowable: true,
    },
    /* ── 第6塊：黑金晶土（累積儲值600水晶解鎖）── */
    {
      id: 5, name: '黑金晶土', maxSeeds: 1,
      unlocked: true, unlockCoins: null, unlockCrystals: 600,
      state: 'empty', plantCount: 0, growthEndTime: null,
      cropId: 'heijin',
      cropName: '混沌晶華', seedName: '混沌種子', cropEmoji: '💎',
      harvestCount: 1,
      seedBuyRate: '每72小時可領1顆（不可購買）', growthHours: 60, yieldCrystal: true,
      readyAt: null, borrowable: false,
    },
  ],

  pets: [
    {
      id: 0, name: '尋星犬', grade: '凡品',
      owned: false, active: false, fed: false, fedUntil: null, cooldownUntil: null,
      acquireType: 'shop-coins', acquireCost: 300, acquireDepositRequired: 0,
      description: '凡品靈獸。基礎巡邏型靈獸，可出戰守護福田。',
    },
    {
      id: 1, name: '辟邪狻猊', grade: '靈品',
      owned: false, active: false, fed: false, fedUntil: null, cooldownUntil: null,
      acquireType: 'shop-crystals', acquireCost: 100, acquireDepositRequired: 0,
      description: '靈品神獸。被借運時，可降低部分損失。',
    },
    {
      id: 2, name: '噬時諦聽', grade: '仙品',
      owned: true, active: false, fed: false, fedUntil: null, cooldownUntil: null,
      acquireType: 'deposit', acquireCost: 0, acquireDepositRequired: 450,
      description: '仙品靈獸。借運時有機率額外觸發一次收益。',
    },
    {
      id: 3, name: '乾坤麒麟', grade: '神品',
      owned: true, active: false, fed: false, fedUntil: null, cooldownUntil: null,
      acquireType: 'deposit', acquireCost: 0, acquireDepositRequired: 799,
      description: '神品聖獸。被借運時，有機率反制對方，使對方直接進入冷卻。',
    },
  ],

  tasks: [
    { id: 'login',   name: '每日登入',    done: true,  claimed: false, reward: { coins: 5, crystals: 0 } },
    { id: 'plant',   name: '完成一次播種', done: false, claimed: false, reward: { coins: 5, crystals: 0 } },
    { id: 'harvest', name: '完成一次收成', done: false, claimed: false, reward: { coins: 5, crystals: 0 } },
  ],
};
