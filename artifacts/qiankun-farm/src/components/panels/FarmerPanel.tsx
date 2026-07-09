import { useGame } from '../../game/GameContext';

export default function FarmerPanel() {
  const { state, dispatch } = useGame();

  return (
    <div className="panel-content">
      <h2 className="panel-title">👨‍🌾 專屬農夫</h2>

      {!state.farmerUnlocked ? (
        <div className="farmer-locked">
          <div className="farmer-lock-icon">🔒</div>
          <p className="farmer-lock-title">農夫尚未解鎖</p>
          <p className="farmer-lock-desc">
            累積儲值達 <strong>999 水晶</strong> 即可解鎖專屬農夫。
          </p>
          <div className="farmer-progress-bar">
            <div
              className="farmer-progress-fill"
              style={{ width: `${Math.min(100, (state.totalDeposit / 999) * 100)}%` }}
            />
          </div>
          <p className="farmer-progress-text">{state.totalDeposit} / 999 水晶</p>
        </div>
      ) : (
        <div className="farmer-unlocked">
          <div className="farmer-active-icon">👨‍🌾</div>

          <div className="farmer-status-row">
            <span className="farmer-status-badge farmer-status-badge--unlocked">已解鎖</span>
            <span className={`farmer-status-badge ${state.farmerActive ? 'farmer-status-badge--on' : 'farmer-status-badge--off'}`}>
              {state.farmerActive ? '啟動中' : '已關閉'}
            </span>
          </div>

          <p className="farmer-active-title">
            {state.farmerActive ? '專屬農夫已上崗！' : '專屬農夫待命中'}
          </p>

          <div className="farmer-toggle-row">
            <button
              className={`farmer-btn farmer-btn--on ${state.farmerActive ? 'farmer-btn--current' : ''}`}
              onClick={() => { if (!state.farmerActive) dispatch({ type: 'TOGGLE_FARMER' }); }}
              disabled={state.farmerActive}
            >
              啟動農夫
            </button>
            <button
              className={`farmer-btn farmer-btn--off ${!state.farmerActive ? 'farmer-btn--current' : ''}`}
              onClick={() => { if (state.farmerActive) dispatch({ type: 'TOGGLE_FARMER' }); }}
              disabled={!state.farmerActive}
            >
              關閉農夫
            </button>
          </div>

          <div className="farmer-abilities">
            <div className="farmer-ability">
              <span className="ability-icon">🌾</span>
              <div>
                <div className="ability-name">自動收成</div>
                <div className="ability-desc">任一農田作物成熟瞬間，農夫立即自動收成，作物只進倉庫，不增加金幣。</div>
              </div>
            </div>
            <div className="farmer-ability">
              <span className="ability-icon">🌱</span>
              <div>
                <div className="ability-name">自動補種</div>
                <div className="ability-desc">收成完成後，若該土地對應種子足夠，立即自動播種同一作物；種子不足則保持空地。</div>
              </div>
            </div>
            <div className="farmer-ability">
              <span className="ability-icon">🚫</span>
              <div>
                <div className="ability-name">不自動購買</div>
                <div className="ability-desc">農夫不會自動購買種子，也不會自動消耗金幣或水晶。</div>
              </div>
            </div>
          </div>

          <p className="farmer-note">
            農夫啟動後，任一作物成熟時會自動收成，並在種子足夠時自動補種。若種子不足，該土地會保持空地，需由玩家自行購買種子。農夫不會自動購買種子，也不會自動消耗金幣或水晶購買物品。
          </p>
          <p className="farmer-note">
            預設解鎖後可自行啟動，不強制接管；玩家可隨時在此頁面切換農夫開關。
          </p>
        </div>
      )}
    </div>
  );
}
