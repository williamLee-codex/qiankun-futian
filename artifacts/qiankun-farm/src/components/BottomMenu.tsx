/**
 * BottomMenu Component — Game Scene Layer 6
 *
 * Renders a fully-opaque nav bar that completely covers the
 * background image's static nav art, giving us control over
 * which items appear and their order.
 *
 * Official menu (per V2 spec):
 *   福田首頁 | 好友 | 靈寵 | 農夫 | 任務 | 市場 | 天道律法
 *
 * 倉庫 is removed from nav — access via clicking 氣運倉庫 building.
 * 種子 is removed from nav — 種子庫存已整合進氣運倉庫，購買種子請至市場。
 */
import { useGame } from '../game/GameContext';
import type { GameState } from '../game/types';

const MENU_ITEMS: { label: string; icon: string; panel: GameState['openPanel'] }[] = [
  { label: '福田首頁', icon: '🏠', panel: null },
  { label: '好友',    icon: '🤝', panel: 'friends' },
  { label: '靈寵',    icon: '🐾', panel: 'pets' },
  { label: '農夫',    icon: '👨‍🌾', panel: 'farmer' },
  { label: '任務',    icon: '📜', panel: 'tasks' },
  { label: '市場',    icon: '🏪', panel: 'market' },
  { label: '天道律法', icon: '📖', panel: 'law' },
];

export default function BottomMenu() {
  const { state, dispatch } = useGame();

  return (
    <nav className="nav-overlay" onClick={e => e.stopPropagation()}>
      {MENU_ITEMS.map(item => {
        const isActive = state.openPanel === item.panel && item.panel !== null;
        return (
          <button
            key={item.label}
            className={`nav-btn${isActive ? ' nav-btn--active' : ''}`}
            aria-label={item.label}
            onClick={() => {
              if (item.panel === null) {
                dispatch({ type: 'CLOSE_PANEL' });
                dispatch({ type: 'DESELECT_PLOT' });
              } else {
                dispatch({ type: 'OPEN_PANEL', panel: item.panel });
              }
            }}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
