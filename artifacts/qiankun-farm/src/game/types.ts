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
