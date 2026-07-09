export type PlotState = 'empty' | 'growing' | 'ready';

export type CropId = 'yaojin' | 'youying' | 'zhusha' | 'yaozi' | 'feicui' | 'heijin';

export interface CropInventory {
  yaojin: number;
  youying: number;
  zhusha: number;
  yaozi: number;
  feicui: number;
  heijin: number;
}

export const CROP_IDS: CropId[] = ['yaojin', 'youying', 'zhusha', 'yaozi', 'feicui', 'heijin'];

/** 作物出售規則：sellQty株 → sellCoins金幣 / sellCrystals水晶 */
export const CROP_DATA: Record<CropId, {
  name: string;
  emoji: string;
  sellQty: number;
  sellCoins: number;
  sellCrystals: number;
}> = {
  yaojin:  { name: '曜金粟', emoji: '🌾', sellQty: 20, sellCoins: 1,  sellCrystals: 0 },
  youying: { name: '月海曇', emoji: '🌙', sellQty: 15, sellCoins: 7,  sellCrystals: 0 },
  zhusha:  { name: '赤血參', emoji: '🌺', sellQty: 10, sellCoins: 9,  sellCrystals: 0 },
  yaozi:   { name: '天樞蔓', emoji: '🌿', sellQty: 6,  sellCoins: 12, sellCrystals: 0 },
  feicui:  { name: '太微蓮', emoji: '🪷', sellQty: 4,  sellCoins: 13, sellCrystals: 0 },
  heijin:  { name: '混沌晶華', emoji: '💎', sellQty: 1,  sellCoins: 0,  sellCrystals: 1 },
};

export const EMPTY_INVENTORY: CropInventory = {
  yaojin: 0, youying: 0, zhusha: 0, yaozi: 0, feicui: 0, heijin: 0,
};

/** 種子庫存（獨立於作物庫存，各作物分開計算） */
export type SeedInventory = CropInventory;

export const EMPTY_SEED_INVENTORY: SeedInventory = {
  yaojin: 0, youying: 0, zhusha: 0, yaozi: 0, feicui: 0, heijin: 0,
};

/** 種子購買單位：每按一次＋／－增減 1 個購買單位（unitQty顆 / unitCost 金幣或水晶） */
export interface SeedShopItem {
  name: string;
  unitQty: number;
  unitCost: number;
  currency: 'coins' | 'crystals';
}

export const SEED_SHOP_DATA: Record<CropId, SeedShopItem> = {
  yaojin:  { name: '曜金種子', unitQty: 20, unitCost: 1, currency: 'coins' },
  youying: { name: '幽熒種子', unitQty: 30, unitCost: 3, currency: 'coins' },
  zhusha:  { name: '朱砂種子', unitQty: 20, unitCost: 5, currency: 'coins' },
  yaozi:   { name: '曜紫種子', unitQty: 6,  unitCost: 3, currency: 'coins' },
  feicui:  { name: '翡翠種子', unitQty: 4,  unitCost: 4, currency: 'coins' },
  heijin:  { name: '混沌種子', unitQty: 2,  unitCost: 1, currency: 'crystals' },
};

/** 每次購買最多 10 個購買單位，禁止「最大／一鍵買滿」 */
export const SEED_MAX_UNITS = 10;

/** 大額購買二次確認門檻：花費超過目前持有資源的 30% */
export const SEED_BIG_SPEND_RATIO = 0.3;

export interface Plot {
  id: number;
  name: string;
  unlocked: boolean;
  /** 花費金幣直接解鎖（第2、3塊）*/
  unlockCoins: number | null;
  /** 累積儲值水晶解鎖（第4、5、6塊）*/
  unlockCrystals: number | null;
  state: PlotState;
  plantCount: number;
  growthEndTime: number | null;
  maxSeeds: number;

  /** 作物 ID，對應 CROP_DATA */
  cropId: CropId;
  cropName: string;
  seedName: string;
  cropEmoji: string;
  /** 每次固定收成株數（= maxSeeds） */
  harvestCount: number;
  /** 顯示用：種子購買說明 */
  seedBuyRate: string;
  /** 正式成熟時間（小時，顯示用）*/
  growthHours: number;
  /** true = 第6塊，出售給水晶而非金幣 */
  yieldCrystal: boolean;
  /** 成熟瞬間的時間戳（用於好友代收「超時1小時」判定）；非成熟或已被收成/農夫代管則為 null */
  readyAt: number | null;
  /** 可被好友借運（僅第2～5塊，第1、6塊固定 false）*/
  borrowable: boolean;
}

export interface Pet {
  id: number;
  name: string;
  grade: '凡品' | '靈品' | '仙品' | '神品';
  owned: boolean;
  active: boolean;
  fed: boolean;
  fedUntil: number | null;
  cooldownUntil: number | null;
  acquireType: 'shop-coins' | 'shop-crystals' | 'deposit';
  acquireCost: number;
  acquireDepositRequired: number;
  description: string;
}

/** 好友（模擬資料，僅前端展示與互動，不連接真實帳號/後端）*/
export interface Friend {
  id: number;
  name: string;
  /** 該好友的因果鎖印冷卻結束時間（借運後 24 小時內不可再借） */
  cooldownUntil: number | null;
  /** 對方福田目前是否有「能量外溢」可代收的作物；null = 無 */
  overflowReadyAt: number | null;
  /** 可代收格對應第幾塊田（1～4，代表第2～5塊）*/
  overflowPlotIndex: number;
}

export interface Task {
  id: string;
  name: string;
  done: boolean;
  claimed: boolean;
  reward: { coins: number; crystals: number };
}

export interface HarvestAnim {
  id: number;
  plotIndex: number;
  plantCount: number;
  delay: number;
}

export interface GameState {
  coins: number;
  crystals: number;
  totalDeposit: number;
  weather: string;
  plots: Plot[];
  selectedPlotId: number | null;
  plantQuantity: number;
  /** 各作物庫存（分作物儲存） */
  cropInventory: CropInventory;
  seedInventory: SeedInventory;
  pets: Pet[];
  tasks: Task[];
  openPanel: 'warehouse' | 'seeds' | 'pets' | 'farmer' | 'tasks' | 'market' | 'law' | 'warehouseBuilding' | 'shopBuilding' | 'friends' | null;
  farmerUnlocked: boolean;
  /** 農夫是否啟動（解鎖後預設不強制開啟，玩家自行切換）*/
  farmerActive: boolean;
  harvestAnimations: HarvestAnim[];
  friends: Friend[];
  /** 今日已使用借運次數 */
  dailyBorrowCount: number;
  /** 每日總借運次數上限（預設 10）*/
  dailyBorrowLimit: number;
  /** 下一次每日借運次數重置時間（每日中午 12:00）*/
  dailyBorrowResetAt: number;
}
