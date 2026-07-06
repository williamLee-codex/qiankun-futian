import { useGame } from '../game/GameContext';
import type { GameState } from '../game/types';

const MENU_ITEMS: { label: string; emoji: string; panel: GameState['openPanel'] }[] = [
  { label: '福田首頁', emoji: '🏠', panel: null },
  { label: '倉庫',    emoji: '📦', panel: 'warehouse' },
  { label: '種子',    emoji: '🌱', panel: 'seeds' },
  { label: '靈寵',    emoji: '🐾', panel: 'pets' },
  { label: '農夫',    emoji: '👨‍🌾', panel: 'farmer' },
  { label: '任務',    emoji: '📜', panel: 'tasks' },
  { label: '市場',    emoji: '🏪', panel: 'market' },
];

export default function BottomMenu() {
  const { state, dispatch } = useGame();

  return (
    <nav className="bottom-menu" onClick={e => e.stopPropagation()}>
      {MENU_ITEMS.map(item => (
        <button
          key={item.label}
          className={`bottom-menu-item${state.openPanel === item.panel && item.panel !== null ? ' bottom-menu-item--active' : ''}`}
          onClick={() => {
            if (item.panel === null) {
              dispatch({ type: 'CLOSE_PANEL' });
              dispatch({ type: 'DESELECT_PLOT' });
            } else {
              dispatch({ type: 'OPEN_PANEL', panel: item.panel });
            }
          }}
        >
          <span className="menu-emoji">{item.emoji}</span>
          <span className="menu-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
