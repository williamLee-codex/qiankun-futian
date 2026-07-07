import { useGame } from '../../game/GameContext';

export default function FarmerPanel() {
  const { state } = useGame();
  return (
    <div className="panel-content">
      <h2 className="panel-title">👨‍🌾 專屬農夫</h2>

      {!state.farmerUnlocked ? (
        <div className="farmer-locked">
          <div className="farmer-lock-icon">🔒</div>
          <p className="farmer-lock-title">農夫尚未解鎖</p>
          <p className="farmer-lock-desc">
            累積儲值達 <strong>999 水晶</strong> 即可解鎖專屬農夫。<br />
            農夫永久守護農田，防借運、防代收，全自動運作。
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
          <p className="farmer-active-title">專屬農夫已上崗！</p>

          <div className="farmer-abilities">
            <div className="farmer-ability">
              <span className="ability-icon">🌱</span>
              <div>
                <div className="ability-name">永久自動播種</div>
                <div className="ability-desc">種子充足時，農夫自動為所有空田播種，無需手動操作。</div>
              </div>
            </div>
            <div className="farmer-ability">
              <span className="ability-icon">🌾</span>
              <div>
                <div className="ability-name">永久自動收成</div>
                <div className="ability-desc">作物成熟後農夫立即採收，一株不漏。</div>
              </div>
            </div>
            <div className="farmer-ability">
              <span className="ability-icon">🔄</span>
              <div>
                <div className="ability-name">自動補種</div>
                <div className="ability-desc">種子庫存不足時，農夫自動至市場補購，確保連續耕作。</div>
              </div>
            </div>
            <div className="farmer-ability">
              <span className="ability-icon">🛡</span>
              <div>
                <div className="ability-name">防借運 · 防代收</div>
                <div className="ability-desc">農夫在場時，任何借運或代收請求均被攔截，收益全歸本主。</div>
              </div>
            </div>
          </div>

          <p className="farmer-note">
            靈寵與農夫各司其職：靈寵負責巡邏、護衛、事件與特殊加成；農夫專責播種收割與田地防護。
          </p>
        </div>
      )}
    </div>
  );
}
