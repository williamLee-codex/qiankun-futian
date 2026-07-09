/**
 * PetOverlay — 主畫面靈獸出戰顯示
 *
 * 顯示規則：
 *   • 僅在有靈獸 active 時顯示；重新整理後仍會保留（狀態來自 GameContext + localStorage）。
 *   • 定位於畫面右上安全區（避開 HUD 0~7%、左右建築 7~43%、狀態列 36~41%、農田 43%+）。
 *   • 純展示 + idle 呼吸動畫，不攔截點擊（pointer-events: none），不影響任何按鈕/農田互動。
 */
import { useGame } from '../game/GameContext';

const PET_EMOJI: Record<string, string> = {
  '尋星犬': '🐕',
  '辟邪狻猊': '🦁',
  '噬時諦聽': '🐉',
  '乾坤麒麟': '🦄',
};

export default function PetOverlay() {
  const { state } = useGame();
  const activePet = state.pets.find(p => p.active);

  if (!activePet) return null;

  return (
    <div className="pet-overlay" aria-hidden="true">
      <div className="pet-overlay-icon">{PET_EMOJI[activePet.name] ?? '🐾'}</div>
      <div className="pet-overlay-name">{activePet.name}</div>
    </div>
  );
}
