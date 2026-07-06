import React, { createContext, useContext, useReducer } from 'react';
import type { GameState, Plot, HarvestAnim } from './types';
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
  | { type: 'SELL_CROPS'; amount: number }
  | { type: 'COMPLETE_TASK'; taskId: string }
  /**
   * 智慧一鍵收播：扣除金幣/水晶、補足種子後立即執行 PLANT_ALL 邏輯。
   * coinsUsed / crystalsUsed 已在 QuickActions 中計算，reducer 直接套用。
   */
  | { type: 'BUY_SEEDS_AND_PLANT_ALL'; coinsUsed: number; crystalsUsed: number; seedsBought: number };

const GROW_TIME_MS   = 10_000;
const HARVEST_COINS  = 10;   /* coins per seed planted */
const HARVEST_CROPS  = 1;    /* crops per seed planted (1:1) */
const ANIM_STAGGER   = 130;  /* ms between each harvest animation */

let _animCounter = 0;
function nextAnimId() { return ++_animCounter; }

function plotMaxQty(plot: Plot, seeds: number) {
  return Math.max(0, Math.min(seeds, plot.maxSeeds));
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {

    /* ── Selection ── */
    case 'SELECT_PLOT': {
      const plot = state.plots.find(p => p.id === action.id);
      const qty  = plot ? plotMaxQty(plot, state.warehouseSeeds) : 1;
      return { ...state, selectedPlotId: action.id, plantQuantity: Math.max(1, qty), openPanel: null };
    }
    case 'DESELECT_PLOT':
      return { ...state, selectedPlotId: null };

    /* ── Quantity ── */
    case 'SET_PLANT_QUANTITY': {
      const plot = state.selectedPlotId !== null
        ? state.plots.find(p => p.id === state.selectedPlotId)
        : null;
      const maxAllowed = plot ? plotMaxQty(plot, state.warehouseSeeds) : 20;
      return { ...state, plantQuantity: Math.max(1, Math.min(maxAllowed, action.qty)) };
    }

    /* ── Plant single ── */
    case 'PLANT': {
      const plot = state.plots.find(p => p.id === action.plotId);
      if (!plot || !plot.unlocked || plot.state !== 'empty') return state;
      const qty = Math.min(action.quantity, plot.maxSeeds, state.warehouseSeeds);
      if (qty <= 0) return state;
      const newPlots = state.plots.map(p =>
        p.id === action.plotId
          ? { ...p, state: 'growing' as const, plantCount: qty, growthEndTime: Date.now() + GROW_TIME_MS }
          : p
      );
      const tasks = state.tasks.map(t => t.id === 'plant' ? { ...t, done: true } : t);
      return { ...state, plots: newPlots, warehouseSeeds: state.warehouseSeeds - qty, tasks };
    }

    /* ── Plant ALL unlocked empty plots in order ── */
    case 'PLANT_ALL': {
      let seeds = state.warehouseSeeds;
      const now  = Date.now();
      const newPlots = state.plots.map(plot => {
        if (!plot.unlocked || plot.state !== 'empty' || seeds <= 0) return plot;
        const qty = Math.min(seeds, plot.maxSeeds);
        seeds -= qty;
        return { ...plot, state: 'growing' as const, plantCount: qty, growthEndTime: now + GROW_TIME_MS };
      });
      const tasks = state.tasks.map(t => t.id === 'plant' ? { ...t, done: true } : t);
      return { ...state, plots: newPlots, warehouseSeeds: seeds, tasks };
    }

    /* ── Harvest single (with animation) ── */
    case 'HARVEST': {
      const plotIndex = state.plots.findIndex(p => p.id === action.plotId);
      const plot = state.plots[plotIndex];
      if (!plot || plot.state !== 'ready') return state;
      const newPlots = state.plots.map(p =>
        p.id === action.plotId
          ? { ...p, state: 'empty' as const, plantCount: 0, growthEndTime: null }
          : p
      );
      const tasks = state.tasks.map(t => t.id === 'harvest' ? { ...t, done: true } : t);
      const anim: HarvestAnim = { id: nextAnimId(), plotIndex, plantCount: plot.plantCount, delay: 0 };
      return {
        ...state,
        plots: newPlots,
        coins: state.coins + plot.plantCount * HARVEST_COINS,
        warehouseCrops: state.warehouseCrops + plot.plantCount * HARVEST_CROPS,
        tasks,
        harvestAnimations: [...state.harvestAnimations, anim],
      };
    }

    /* ── Harvest ALL ready plots (with staggered animations) ── */
    case 'HARVEST_ALL': {
      let earnedCoins = 0;
      let earnedCrops = 0;
      const newAnims: HarvestAnim[] = [];
      let wave = 0;
      const newPlots = state.plots.map((plot, idx) => {
        if (plot.state !== 'ready') return plot;
        earnedCoins += plot.plantCount * HARVEST_COINS;
        earnedCrops += plot.plantCount * HARVEST_CROPS;
        newAnims.push({ id: nextAnimId(), plotIndex: idx, plantCount: plot.plantCount, delay: wave++ * ANIM_STAGGER });
        return { ...plot, state: 'empty' as const, plantCount: 0, growthEndTime: null };
      });
      if (!newAnims.length) return state;
      const tasks = state.tasks.map(t => t.id === 'harvest' ? { ...t, done: true } : t);
      return {
        ...state,
        plots: newPlots,
        coins: state.coins + earnedCoins,
        warehouseCrops: state.warehouseCrops + earnedCrops,
        tasks,
        harvestAnimations: [...state.harvestAnimations, ...newAnims],
      };
    }

    /* ── Clear finished animations ── */
    case 'CLEAR_HARVEST_ANIM':
      return {
        ...state,
        harvestAnimations: state.harvestAnimations.filter(a => !action.ids.includes(a.id)),
      };

    /* ── Growth tick ── */
    case 'CHECK_GROWTH': {
      const now = Date.now();
      let changed = false;
      const newPlots = state.plots.map(p => {
        if (p.state === 'growing' && p.growthEndTime && now >= p.growthEndTime) {
          changed = true;
          return { ...p, state: 'ready' as const };
        }
        return p;
      });
      return changed ? { ...state, plots: newPlots } : state;
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

    /* ── 智慧收播：購買種子後立即播種 ── */
    case 'BUY_SEEDS_AND_PLANT_ALL': {
      const afterCoins    = state.coins    - action.coinsUsed;
      const afterCrystals = state.crystals - action.crystalsUsed;
      if (afterCoins < 0 || afterCrystals < 0) return state; // guard
      const startSeeds = state.warehouseSeeds + action.seedsBought;
      let seeds = startSeeds;
      const now = Date.now();
      const newPlots = state.plots.map(plot => {
        if (!plot.unlocked || plot.state !== 'empty' || seeds <= 0) return plot;
        const qty = Math.min(seeds, plot.maxSeeds);
        seeds -= qty;
        return { ...plot, state: 'growing' as const, plantCount: qty, growthEndTime: now + GROW_TIME_MS };
      });
      const tasks = state.tasks.map(t => t.id === 'plant' ? { ...t, done: true } : t);
      return {
        ...state,
        coins:    afterCoins,
        crystals: afterCrystals,
        warehouseSeeds: seeds,
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

    /* ── Market ── */
    case 'SELL_CROPS':
      if (state.warehouseCrops < action.amount) return state;
      return { ...state, warehouseCrops: state.warehouseCrops - action.amount, coins: state.coins + action.amount * 8 };

    /* ── Tasks ── */
    case 'COMPLETE_TASK':
      return { ...state, tasks: state.tasks.map(t => t.id === action.taskId ? { ...t, done: true } : t) };

    default: return state;
  }
}

interface Ctx { state: GameState; dispatch: React.Dispatch<Action>; }
const GameContext = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <GameContext.Provider value={{ state, dispatch }}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
