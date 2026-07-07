export type PlotState = 'empty' | 'growing' | 'ready';

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

  /* ── 作物 / 種子 正式規則 ── */
  cropName: string;       // 作物名稱，e.g. 曜金粟
  seedName: string;       // 種子名稱，e.g. 曜金種子
  cropEmoji: string;      // 顯示 emoji
  harvestCount: number;   // 每次固定收成株數
  exchangeRate: number;   // 兌換比：N 株 = 1 金幣（or 1 水晶）
  seedBuyRate: string;    // 種子購買說明，e.g. "1金幣=20顆"
  growthHours: number;    // 正式成熟時間（小時，顯示用）
  yieldCrystal: boolean;  // true = 第6塊，收成給水晶而非金幣
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

export interface Task {
  id: string;
  name: string;
  done: boolean;
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
  warehouseCrops: number;
  warehouseSeeds: number;
  pets: Pet[];
  tasks: Task[];
  openPanel: 'warehouse' | 'seeds' | 'pets' | 'farmer' | 'tasks' | 'market' | 'law' | 'warehouseBuilding' | 'shopBuilding' | null;
  farmerUnlocked: boolean;
  harvestAnimations: HarvestAnim[];
}
