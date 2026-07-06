import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { GameState, Plot } from './types';
import { initialState } from './initialState';

type Action =
  | { type: 'SELECT_PLOT'; id: number }
  | { type: 'SET_PLANT_QUANTITY'; qty: number }
  | { type: 'PLANT'; plotId: number; quantity: number }
  | { type: 'HARVEST'; plotId: number }
  | { type: 'CHECK_GROWTH' }
  | { type: 'TEST_DEPOSIT' }
  | { type: 'OPEN_PANEL'; panel: GameState['openPanel'] }
  | { type: 'CLOSE_PANEL' }
  | { type: 'ACQUIRE_PET'; petId: number }
  | { type: 'ACTIVATE_PET'; petId: number }
  | { type: 'FEED_PET'; petId: number }
  | { type: 'SELL_CROPS'; amount: number }
  | { type: 'COMPLETE_TASK'; taskId: string };

const GROW_TIME_MS = 10_000;
const HARVEST_COINS = 10;
const HARVEST_CROPS = 5;

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SELECT_PLOT': {
      return { ...state, selectedPlotId: action.id, plantQuantity: 1, openPanel: null };
    }
    case 'SET_PLANT_QUANTITY':
      return { ...state, plantQuantity: Math.max(1, Math.min(20, action.qty)) };
    case 'PLANT': {
      const plot = state.plots.find(p => p.id === action.plotId);
      if (!plot || !plot.unlocked || plot.state !== 'empty') return state;
      if (state.warehouseSeeds < action.quantity) return state;
      const newPlots = state.plots.map(p =>
        p.id === action.plotId
          ? { ...p, state: 'growing' as const, plantCount: action.quantity, growthEndTime: Date.now() + GROW_TIME_MS }
          : p
      );
      const tasks = state.tasks.map(t => t.id === 'plant' ? { ...t, done: true } : t);
      return {
        ...state,
        plots: newPlots,
        warehouseSeeds: state.warehouseSeeds - action.quantity,
        tasks,
      };
    }
    case 'HARVEST': {
      const plot = state.plots.find(p => p.id === action.plotId);
      if (!plot || plot.state !== 'ready') return state;
      const earnedCoins = plot.plantCount * HARVEST_COINS;
      const earnedCrops = plot.plantCount * HARVEST_CROPS;
      const newPlots = state.plots.map(p =>
        p.id === action.plotId
          ? { ...p, state: 'empty' as const, plantCount: 0, growthEndTime: null }
          : p
      );
      const tasks = state.tasks.map(t => t.id === 'harvest' ? { ...t, done: true } : t);
      return {
        ...state,
        plots: newPlots,
        coins: state.coins + earnedCoins,
        warehouseCrops: state.warehouseCrops + earnedCrops,
        tasks,
      };
    }
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
    case 'TEST_DEPOSIT': {
      const newDeposit = state.totalDeposit + 100;
      const newPlots = state.plots.map(p => {
        if (!p.unlocked && p.unlockCrystals !== null && newDeposit >= p.unlockCrystals) {
          return { ...p, unlocked: true };
        }
        return p;
      });
      const newPets = state.pets.map(pet => {
        if (!pet.owned && pet.acquireType === 'deposit' && newDeposit >= pet.acquireDepositRequired) {
          return { ...pet, owned: true };
        }
        return pet;
      });
      const farmerUnlocked = newDeposit >= 999;
      return { ...state, totalDeposit: newDeposit, plots: newPlots, pets: newPets, farmerUnlocked };
    }
    case 'OPEN_PANEL':
      return { ...state, openPanel: action.panel, selectedPlotId: null };
    case 'CLOSE_PANEL':
      return { ...state, openPanel: null };
    case 'ACQUIRE_PET': {
      const pet = state.pets.find(p => p.id === action.petId);
      if (!pet || pet.owned) return state;
      if (pet.acquireType === 'shop-coins') {
        if (state.coins < pet.acquireCost) return state;
        return {
          ...state,
          coins: state.coins - pet.acquireCost,
          pets: state.pets.map(p => p.id === action.petId ? { ...p, owned: true } : p),
        };
      }
      if (pet.acquireType === 'shop-crystals') {
        if (state.crystals < pet.acquireCost) return state;
        return {
          ...state,
          crystals: state.crystals - pet.acquireCost,
          pets: state.pets.map(p => p.id === action.petId ? { ...p, owned: true } : p),
        };
      }
      return state;
    }
    case 'ACTIVATE_PET': {
      const now = Date.now();
      const targetPet = state.pets.find(p => p.id === action.petId);
      if (!targetPet || !targetPet.owned) return state;
      const currentActive = state.pets.find(p => p.active);
      if (currentActive && currentActive.cooldownUntil && now < currentActive.cooldownUntil) return state;
      const newPets = state.pets.map(p => {
        if (p.active && p.id !== action.petId) {
          return { ...p, active: false, cooldownUntil: now + 8 * 60 * 60 * 1000 };
        }
        if (p.id === action.petId) return { ...p, active: true };
        return p;
      });
      return { ...state, pets: newPets };
    }
    case 'FEED_PET': {
      const now = Date.now();
      return {
        ...state,
        pets: state.pets.map(p =>
          p.id === action.petId
            ? { ...p, fed: true, fedUntil: now + 12 * 60 * 60 * 1000 }
            : p
        ),
      };
    }
    case 'SELL_CROPS': {
      if (state.warehouseCrops < action.amount) return state;
      return {
        ...state,
        warehouseCrops: state.warehouseCrops - action.amount,
        coins: state.coins + action.amount * 8,
      };
    }
    default:
      return state;
  }
}

interface Ctx {
  state: GameState;
  dispatch: React.Dispatch<Action>;
}

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
