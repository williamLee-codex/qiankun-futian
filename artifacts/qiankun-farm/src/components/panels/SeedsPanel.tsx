import { useGame } from '../../game/GameContext';

export default function SeedsPanel() {
  const { state } = useGame();
  return (
    <div className="panel-content">
      <h2 className="panel-title">🌱 種子背包</h2>
      <div className="panel-row">
        <div className="seed-icon">🌟</div>
        <div className="seed-info">
          <div className="panel-item-name">曜金種子</div>
          <div className="seed-desc">成熟時間：10秒（測試）｜產量：×5</div>
        </div>
        <span className="panel-item-qty">{state.warehouseSeeds} 顆</span>
      </div>
      {state.warehouseSeeds === 0 && (
        <p className="panel-empty">種子已用完，請前往市場補充。</p>
      )}
    </div>
  );
}
