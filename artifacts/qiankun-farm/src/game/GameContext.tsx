import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { GameState, Plot, HarvestAnim, CropId, CropInventory, SeedInventory } from './types';
import { CROP_DATA, EMPTY_INVENTORY } from './types';
import { initialState } from './initialState';

type Action =
  | { type: 'SELECT_PLOT'; id: number }
  | { type: 'DESELECT_PLOT' }
  | { type: 'SET_PLANT_QUANTITY'; qty: number }
  | { type: 'PLANT'; plotId: number; quantity: number }
  | { type: 'PLANT_ALL' }
  | { type: 'HARVEST'; plotId: number }
  | { type: 'HARVEST_ALL' }
  | { type: 'CLEAR_HARVEST_ANIM'; ids: number[] }
  | { type: 'CHECK_GROWTH' }
  | { type: 'TEST_DEPOSIT' }
  | { type: 'OPEN_PANEL'; panel: GameState['openPanel'] }
  | { type: 'CLOSE_PANEL' }
  | { type: 'ACQUIRE_PET'; petId: number }
  | { type: 'ACTIVATE_PET'; petId: number }
  | { type: 'FEED_PET'; petId: number }
  | { type: 'SELL_CROPS'; cropId: CropId; amount: number }
  | { type: 'COMPLETE_TASK'; taskId: string }
  /** 種子商店：直接購買種子（不播種），扣款＋加庫存 */
  | { type: 'BUY_SEEDS'; cropId: CropId; seeds: number; coinsUsed: number; crystalsUsed: number }
  /** 智慧收播：自動補足各田缺少的種子後播種 */
  | { type: 'BUY_SEEDS_AND_PLANT_ALL'; purchases: { cropId: CropId; seeds: number }[]; coinsUsed: number; crystalsUsed: number }
  | { type: 'UNLOCK_PLOT'; plotId: number }
  | { type: 'CLAIM_TASK_REWARD'; taskId: string }
  /** 農夫開關（僅解鎖後可切換，不強制接管） */
  | { type: 'TOGGLE_FARMER' }
  /** 借運：拜訪好友（平台 uid），從第2～5塊隨機借運一塊成熟田（僅限第2～5塊）*/
  | { type: 'VISIT_BORROW'; friendUid: string }
  /** 一鍵採收：協助好友收取其福田所有「超時1小時未收」的作物，不是借運 */
  | { type: 'HARVEST_ALL_FRIEND'; friendUid: string };

const LOCAL_STORAGE_KEY = 'qiankun-farm-save-v1';

function loadPersisted(): GameState | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as Partial<GameState>;
    /** 淺合併，確保新增欄位（新版本升級後）有預設值，不影響已存資料的核心欄位 */
    return { ...initialState, ...saved };
  } catch {
    return undefined;
  }
}

function savePersisted(state: GameState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 儲存失敗（如無痕模式）不影響遊戲運作 */
  }
}

/** 每日借運次數重置：中午 12:00 */
function nextNoon(from: number): number {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** 借運/代收超時門檻：成熟超過 1 小時未收，進入能量外溢 */
const OVERFLOW_MS = 60 * 60_000;
/** 好友借運後的因果鎖印冷卻 */
const FRIEND_COOLDOWN_MS = 24 * 3600_000;

/* ── 測試用成長時間（正式版由 growthHours 顯示）── */
const GROW_TIME_MS = 10_000;

/* ── 收成動畫間距 ── */
const ANIM_STAGGER = 130;

let _animCounter = 0;
function nextAnimId() { return ++_animCounter; }

function plotMaxQty(plot: Plot, seedInv: SeedInventory) {
  return Math.max(0, Math.min(seedInv[plot.cropId], plot.maxSeeds));
}

/** 收成：作物進倉庫，不給金幣/水晶 */
function addHarvestToInventory(inv: CropInventory, plot: Plot): CropInventory {
  return { ...inv, [plot.cropId]: inv[plot.cropId] + plot.harvestCount };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {

    /* ── Selection ── */
    case 'SELECT_PLOT': {
      const plot = state.plots.find(p => p.id === action.id);
      const qty  = plot ? plotMaxQty(plot, state.seedInventory) : 1;
      return { ...state, selectedPlotId: action.id, plantQuantity: Math.max(1, qty), openPanel: null };
    }
    case 'DESELECT_PLOT':
      return { ...state, selectedPlotId: null };

    /* ── Quantity ── */
    case 'SET_PLANT_QUANTITY': {
      const plot = state.selectedPlotId !== null
        ? state.plots.find(p => p.id === state.selectedPlotId)
        : null;
      const maxAllowed = plot ? plotMaxQty(plot, state.seedInventory) : 20;
      return { ...state, plantQuantity: Math.max(1, Math.min(maxAllowed, action.qty)) };
    }

    /* ── Plant single ── */
    case 'PLANT': {
      const plot = state.plots.find(p => p.id === action.plotId);
      if (!plot || !plot.unlocked || plot.state !== 'empty') return state;
      const seedStock = state.seedInventory[plot.cropId];
      const qty = Math.min(action.quantity, plot.maxSeeds, seedStock);
      if (qty <= 0) return state;
      const newPlots = state.plots.map(p =>
        p.id === action.plotId
          ? { ...p, state: 'growing' as const, plantCount: qty, growthEndTime: Date.now() + GROW_TIME_MS }
          : p
      );
      const tasks = state.tasks.map(t => t.id === 'plant' ? { ...t, done: true } : t);
      return {
        ...state,
        plots: newPlots,
        seedInventory: { ...state.seedInventory, [plot.cropId]: seedStock - qty },
        tasks,
        selectedPlotId: null,
      };
    }

    /* ── Plant ALL unlocked empty plots（各田各自消耗對應作物種子）── */
    case 'PLANT_ALL': {
      const seedInv = { ...state.seedInventory };
      const now = Date.now();
      const newPlots = state.plots.map(plot => {
        if (!plot.unlocked || plot.state !== 'empty') return plot;
        const avail = seedInv[plot.cropId];
        if (avail <= 0) return plot;
        const qty = Math.min(avail, plot.maxSeeds);
        seedInv[plot.cropId] = avail - qty;
        return { ...plot, state: 'growing' as const, plantCount: qty, growthEndTime: now + GROW_TIME_MS };
      });
      const tasks = state.tasks.map(t => t.id === 'plant' ? { ...t, done: true } : t);
      return { ...state, plots: newPlots, seedInventory: seedInv, tasks };
    }

    /* ── Harvest single ──────────────────────────────────────────
       收成時：只增加 cropInventory，絕對不增加金幣或水晶
       混沌晶華（heijin）也先進倉庫，出售時才換水晶
    ────────────────────────────────────────────────────────────── */
    case 'HARVEST': {
      const plotIndex = state.plots.findIndex(p => p.id === action.plotId);
      const plot = state.plots[plotIndex];
      if (!plot || plot.state !== 'ready') return state;

      const newPlots = state.plots.map(p =>
        p.id === action.plotId
          ? { ...p, state: 'empty' as const, plantCount: 0, growthEndTime: null, readyAt: null }
          : p
      );
      const tasks = state.tasks.map(t => t.id === 'harvest' ? { ...t, done: true } : t);
      const anim: HarvestAnim = { id: nextAnimId(), plotIndex, plantCount: plot.harvestCount, delay: 0 };
      return {
        ...state,
        plots: newPlots,
        cropInventory: addHarvestToInventory(state.cropInventory, plot),
        tasks,
        harvestAnimations: [...state.harvestAnimations, anim],
        selectedPlotId: state.selectedPlotId === action.plotId ? null : state.selectedPlotId,
      };
    }

    /* ── Harvest ALL ready plots ── */
    case 'HARVEST_ALL': {
      const newAnims: HarvestAnim[] = [];
      let newInventory = { ...state.cropInventory };
      let wave = 0;
      const newPlots = state.plots.map((plot, idx) => {
        if (plot.state !== 'ready') return plot;
        newInventory = addHarvestToInventory(newInventory, plot);
        newAnims.push({ id: nextAnimId(), plotIndex: idx, plantCount: plot.harvestCount, delay: wave++ * ANIM_STAGGER });
        return { ...plot, state: 'empty' as const, plantCount: 0, growthEndTime: null, readyAt: null };
      });
      if (!newAnims.length) return state;
      const tasks = state.tasks.map(t => t.id === 'harvest' ? { ...t, done: true } : t);
      return {
        ...state,
        plots: newPlots,
        cropInventory: newInventory,
        tasks,
        harvestAnimations: [...state.harvestAnimations, ...newAnims],
      };
    }

    /* ── Clear animations ── */
    case 'CLEAR_HARVEST_ANIM':
      return {
        ...state,
        harvestAnimations: state.harvestAnimations.filter(a => !action.ids.includes(a.id)),
      };

    /* ── Growth tick ──────────────────────────────────────────────
       農夫啟動時：作物一成熟即自動收成（只進倉庫，不加金幣），
       接著若該作物種子足夠則立即自動補種同一作物；
       種子不足則保持空地（不自動購買、不自動花費）。
       農夫未啟動：維持原本「成熟→ready，等待玩家手動收成」邏輯，
       並記錄 readyAt 供好友「能量外溢代收」判斷使用。
    ────────────────────────────────────────────────────────────── */
    case 'CHECK_GROWTH': {
      const now = Date.now();
      let changed = false;
      const seedInv = { ...state.seedInventory };
      const newAnims: HarvestAnim[] = [];
      let newInventory = state.cropInventory;
      let wave = 0;

      const newPlots = state.plots.map((p, idx) => {
        if (p.state === 'growing' && p.growthEndTime && now >= p.growthEndTime) {
          changed = true;

          if (state.farmerActive) {
            /* 農夫自動收成：只進倉庫，不給金幣/水晶 */
            newInventory = addHarvestToInventory(newInventory, p);
            newAnims.push({ id: nextAnimId(), plotIndex: idx, plantCount: p.harvestCount, delay: wave++ * ANIM_STAGGER });

            /* 農夫自動補種：種子足夠才播種同一作物，否則保持空地 */
            const seedStock = seedInv[p.cropId];
            if (seedStock > 0) {
              const qty = Math.min(seedStock, p.maxSeeds);
              seedInv[p.cropId] = seedStock - qty;
              return { ...p, state: 'growing' as const, plantCount: qty, growthEndTime: now + GROW_TIME_MS, readyAt: null };
            }
            return { ...p, state: 'empty' as const, plantCount: 0, growthEndTime: null, readyAt: null };
          }

          /* 未啟動農夫：正常進入「成熟待收」狀態，記錄成熟時間供好友外溢判斷 */
          return { ...p, state: 'ready' as const, readyAt: now };
        }
        return p;
      });

      /* 每日借運次數重置（中午 12:00）*/
      let dailyBorrowCount = state.dailyBorrowCount;
      let dailyBorrowResetAt = state.dailyBorrowResetAt;
      if (now >= dailyBorrowResetAt) {
        dailyBorrowCount = 0;
        dailyBorrowResetAt = nextNoon(now);
        changed = true;
      }

      if (!changed) return state;
      return {
        ...state,
        plots: newPlots,
        cropInventory: newInventory,
        seedInventory: seedInv,
        harvestAnimations: newAnims.length ? [...state.harvestAnimations, ...newAnims] : state.harvestAnimations,
        dailyBorrowCount,
        dailyBorrowResetAt,
      };
    }

    /* ── 農夫開關：僅解鎖後可切換，不強制接管 ── */
    case 'TOGGLE_FARMER': {
      if (!state.farmerUnlocked) return state;
      return { ...state, farmerActive: !state.farmerActive };
    }

    /* ── 借運：拜訪好友，隨機借運第2～5塊中一塊成熟田（每好友獨立24H冷卻，每日總次數限制）──
       好友身份資料一律來自平台 platformFriends，這裡只用 uid 索引福田專屬的借運狀態。
       規則：系統從第2～5塊「合法成熟田」中隨機選1塊，訪客取得該田可借運作物數量的20%（無條件進位，至少1個），
       地主損失同等數量；借運會扣每日次數、建立24H因果鎖印、套用靈寵效果。*/
    case 'VISIT_BORROW': {
      const now = Date.now();
      const borrow = state.borrowState[action.friendUid];
      if (!borrow) return state;
      if (borrow.cooldownUntil && now < borrow.cooldownUntil) return state;
      if (state.dailyBorrowCount >= state.dailyBorrowLimit) return state;

      /* 第2～5塊中，目前已成熟（readyAt 非 null）的合法借運田 */
      const eligible = borrow.plots
        .map((p, i) => ({ ...p, i }))
        .filter(p => p.readyAt !== null);
      if (eligible.length === 0) return state;

      const picked = eligible[Math.floor(Math.random() * eligible.length)];
      const realPlot = state.plots[picked.i + 1]; // borrow.plots[0..3] 對應福田第2～5塊 = state.plots[1..4]
      const cropQty = realPlot.harvestCount; // 該田可借運作物數量（模擬對象，非本地玩家資產）
      let visitorReward = Math.max(1, Math.ceil(cropQty * 0.2));

      /* 靈寵效果：噬時諦聽（仙品，出戰中）有機率額外觸發一次收益 */
      const chishi = state.pets.find(p => p.name === '噬時諦聽');
      if (chishi?.owned && chishi.active && Math.random() < 0.3) {
        visitorReward += Math.max(1, Math.ceil(cropQty * 0.2));
      }

      const newPlots = borrow.plots.map((p, i) => (i === picked.i ? { readyAt: null } : p)) as typeof borrow.plots;

      return {
        ...state,
        coins: state.coins + visitorReward,
        borrowState: {
          ...state.borrowState,
          [action.friendUid]: {
            cooldownUntil: now + FRIEND_COOLDOWN_MS,
            plots: newPlots,
          },
        },
        dailyBorrowCount: state.dailyBorrowCount + 1,
      };
    }

    /* ── 一鍵採收：協助好友收取所有「成熟超時1小時未收」的作物，不是借運 ──
       規則：一次處理所有符合條件的超時作物；訪客取得總量5%（無條件進位，至少1個），
       地主取得剩餘95%回到地主倉庫；不扣每日借運次數、不建立因果鎖印、不受靈寵借運效果影響。*/
    case 'HARVEST_ALL_FRIEND': {
      const now = Date.now();
      const borrow = state.borrowState[action.friendUid];
      if (!borrow) return state;

      const overtime = borrow.plots
        .map((p, i) => ({ ...p, i }))
        .filter(p => p.readyAt !== null && now - p.readyAt! >= OVERFLOW_MS);
      if (overtime.length === 0) return state;

      const totalYield = overtime.reduce((sum, p) => {
        const realPlot = state.plots[p.i + 1];
        return sum + realPlot.harvestCount;
      }, 0);
      const visitorReward = Math.max(1, Math.ceil(totalYield * 0.05));
      /* 剩餘 95% 回到地主（好友）倉庫，屬於模擬對象，非本地玩家資產，此處不需寫入本地狀態 */

      const overtimeIdx = new Set(overtime.map(p => p.i));
      const newPlots = borrow.plots.map((p, i) => (overtimeIdx.has(i) ? { readyAt: null } : p)) as typeof borrow.plots;

      return {
        ...state,
        coins: state.coins + visitorReward,
        borrowState: {
          ...state.borrowState,
          [action.friendUid]: {
            ...borrow,
            plots: newPlots,
          },
        },
      };
    }

    /* ── Test deposit ── */
    case 'TEST_DEPOSIT': {
      const dep = state.totalDeposit + 100;
      const newPlots = state.plots.map(p => {
        if (!p.unlocked && p.unlockCrystals !== null && dep >= p.unlockCrystals)
          return { ...p, unlocked: true };
        return p;
      });
      const newPets = state.pets.map(pet => {
        if (!pet.owned && pet.acquireType === 'deposit' && dep >= pet.acquireDepositRequired)
          return { ...pet, owned: true };
        return pet;
      });
      return { ...state, totalDeposit: dep, plots: newPlots, pets: newPets, farmerUnlocked: dep >= 999 };
    }

    /* ── 金幣解鎖土地（第2、3塊）── */
    case 'UNLOCK_PLOT': {
      const plot = state.plots.find(p => p.id === action.plotId);
      if (!plot || plot.unlocked || plot.unlockCoins === null) return state;
      if (state.coins < plot.unlockCoins) return state;
      return {
        ...state,
        coins: state.coins - plot.unlockCoins,
        plots: state.plots.map(p =>
          p.id === action.plotId ? { ...p, unlocked: true } : p
        ),
      };
    }

    /* ── 種子商店：直接購買（不播種）── */
    case 'BUY_SEEDS': {
      if (state.coins < action.coinsUsed || state.crystals < action.crystalsUsed) return state;
      return {
        ...state,
        coins:    state.coins    - action.coinsUsed,
        crystals: state.crystals - action.crystalsUsed,
        seedInventory: {
          ...state.seedInventory,
          [action.cropId]: state.seedInventory[action.cropId] + action.seeds,
        },
      };
    }

    /* ── 智慧收播：依各田缺少的種子分別補足後播種 ── */
    case 'BUY_SEEDS_AND_PLANT_ALL': {
      const afterCoins    = state.coins    - action.coinsUsed;
      const afterCrystals = state.crystals - action.crystalsUsed;
      if (afterCoins < 0 || afterCrystals < 0) return state;
      const seedInv = { ...state.seedInventory };
      for (const p of action.purchases) seedInv[p.cropId] += p.seeds;
      const now = Date.now();
      const newPlots = state.plots.map(plot => {
        if (!plot.unlocked || plot.state !== 'empty') return plot;
        const avail = seedInv[plot.cropId];
        if (avail <= 0) return plot;
        const qty = Math.min(avail, plot.maxSeeds);
        seedInv[plot.cropId] = avail - qty;
        return { ...plot, state: 'growing' as const, plantCount: qty, growthEndTime: now + GROW_TIME_MS };
      });
      const tasks = state.tasks.map(t => t.id === 'plant' ? { ...t, done: true } : t);
      return {
        ...state,
        coins:    afterCoins,
        crystals: afterCrystals,
        seedInventory: seedInv,
        plots: newPlots,
        tasks,
      };
    }

    /* ── Panels ── */
    case 'OPEN_PANEL':
      return { ...state, openPanel: action.panel, selectedPlotId: null };
    case 'CLOSE_PANEL':
      return { ...state, openPanel: null };

    /* ── Pets ── */
    case 'ACQUIRE_PET': {
      const pet = state.pets.find(p => p.id === action.petId);
      if (!pet || pet.owned) return state;
      if (pet.acquireType === 'shop-coins') {
        if (state.coins < pet.acquireCost) return state;
        return { ...state, coins: state.coins - pet.acquireCost, pets: state.pets.map(p => p.id === action.petId ? { ...p, owned: true } : p) };
      }
      if (pet.acquireType === 'shop-crystals') {
        if (state.crystals < pet.acquireCost) return state;
        return { ...state, crystals: state.crystals - pet.acquireCost, pets: state.pets.map(p => p.id === action.petId ? { ...p, owned: true } : p) };
      }
      return state;
    }
    case 'ACTIVATE_PET': {
      const now = Date.now();
      const target = state.pets.find(p => p.id === action.petId);
      if (!target || !target.owned) return state;
      const cur = state.pets.find(p => p.active);
      if (cur && cur.cooldownUntil && now < cur.cooldownUntil) return state;
      const newPets = state.pets.map(p => {
        if (p.active && p.id !== action.petId) return { ...p, active: false, cooldownUntil: now + 8 * 3600_000 };
        if (p.id === action.petId) return { ...p, active: true };
        return p;
      });
      return { ...state, pets: newPets };
    }
    case 'FEED_PET': {
      const now = Date.now();
      return { ...state, pets: state.pets.map(p => p.id === action.petId ? { ...p, fed: true, fedUntil: now + 12 * 3600_000 } : p) };
    }

    /* ── 出售作物 ────────────────────────────────────────────────
       依 cropId 查 CROP_DATA 計算售價
       amount = 株數（向下取整至 sellQty 的倍數）
       金幣作物 → 增加 coins；heijin → 增加 crystals
    ────────────────────────────────────────────────────────────── */
    case 'SELL_CROPS': {
      const { cropId, amount } = action;
      const data = CROP_DATA[cropId];
      const inv  = state.cropInventory[cropId];
      if (inv <= 0 || amount <= 0) return state;
      const sellable = Math.min(amount, inv);
      const batches  = Math.floor(sellable / data.sellQty);
      if (batches <= 0) return state;
      const actualAmount = batches * data.sellQty;
      return {
        ...state,
        cropInventory: { ...state.cropInventory, [cropId]: inv - actualAmount },
        coins:    state.coins    + batches * data.sellCoins,
        crystals: state.crystals + batches * data.sellCrystals,
      };
    }

    /* ── Tasks ── */
    case 'COMPLETE_TASK':
      return { ...state, tasks: state.tasks.map(t => t.id === action.taskId ? { ...t, done: true } : t) };

    case 'CLAIM_TASK_REWARD': {
      const task = state.tasks.find(t => t.id === action.taskId);
      if (!task || !task.done || task.claimed) return state;
      return {
        ...state,
        coins:    state.coins    + task.reward.coins,
        crystals: state.crystals + task.reward.crystals,
        tasks: state.tasks.map(t =>
          t.id === action.taskId ? { ...t, claimed: true } : t
        ),
      };
    }

    default: return state;
  }
}

interface Ctx { state: GameState; dispatch: React.Dispatch<Action>; }
const GameContext = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadPersisted() ?? initialState);

  /* 僅本機端持久化（localStorage），不涉及資料庫／Supabase：
     用於保存靈獸出戰、農夫開關、好友借運等狀態，重新整理後仍維持。 */
  useEffect(() => {
    savePersisted(state);
  }, [state]);

  return <GameContext.Provider value={{ state, dispatch }}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

export type { CropInventory };
export { EMPTY_INVENTORY };
