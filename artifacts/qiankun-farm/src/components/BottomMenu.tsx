/**
 * BottomMenu Component — Game Scene Layer 6
 *
 * Transparent interactive overlay on the 7 nav icons
 * drawn at the bottom of the background image.
 * The image provides all visual design; React provides all interactivity.
 */
import { useGame } from '../game/GameContext';
import type { GameState } from '../game/types';

const MENU_ITEMS: { label: string; panel: GameState['openPanel'] }[] = [
  { label: '福田首頁', panel: null },
  { label: '倉庫',    panel: 'warehouse' },
  { label: '種子',    panel: 'seeds' },
  { label: '靈寵',    panel: 'pets' },
  { label: '農夫',    panel: 'farmer' },
  { label: '任務',    panel: 'tasks' },
  { label: '市場',    panel: 'market' },
];

export default function BottomMenu() {
  const { state, dispatch } = useGame();

  return (
    <nav className="nav-overlay" onClick={e => e.stopPropagation()}>
      {MENU_ITEMS.map(item => (
        <button
          key={item.label}
          className={`nav-zone${state.openPanel === item.panel && item.panel !== null ? ' nav-zone--active' : ''}`}
          aria-label={item.label}
          onClick={() => {
            if (item.panel === null) {
              dispatch({ type: 'CLOSE_PANEL' });
              dispatch({ type: 'DESELECT_PLOT' });
            } else {
              dispatch({ type: 'OPEN_PANEL', panel: item.panel });
            }
          }}
        />
      ))}
    </nav>
  );
}
