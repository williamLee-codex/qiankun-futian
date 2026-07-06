import { useGame } from '../../game/GameContext';

export default function FarmerPanel() {
  const { state } = useGame();
  return (
    <div className="panel-content">
      <h2 className="panel-title">👨‍🌾 農夫系統</h2>
      {!state.farmerUnlocked ? (
        <div className="farmer-locked">
          <div className="farmer-lock-icon">🔒</div>
          <p className="farmer-lock-title">農夫尚未解鎖</p>
          <p className="farmer-lock-desc">累積儲值達 999 水晶即可解鎖農夫。</p>
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
          <p className="farmer-active-title">農夫已上崗！</p>
          <div className="farmer-abilities">
            <div className="farmer-ability">
              <span className="ability-icon">🌱</span>
              <div>
                <div className="ability-name">自動播種</div>
                <div className="ability-desc">種子庫存充足時，農夫自動為空田播種。</div>
              </div>
            </div>
            <div className="farmer-ability">
              <span className="ability-icon">🌾</span>
              <div>
                <div className="ability-name">自動收成</div>
                <div className="ability-desc">作物成熟後農夫立即採收，不會錯過。</div>
              </div>
            </div>
            <div className="farmer-ability">
              <span className="ability-icon">💰</span>
              <div>
                <div className="ability-name">自動出售</div>
                <div className="ability-desc">倉庫作物達上限時，自動以市價出售。</div>
              </div>
            </div>
            <div className="farmer-ability">
              <span className="ability-icon">🔄</span>
              <div>
                <div className="ability-name">自動補種</div>
                <div className="ability-desc">種子庫存不足時，自動至市場補購。</div>
              </div>
            </div>
          </div>
          <p className="farmer-note">注意：靈寵仍負責巡邏、防護、事件、尋寶與特殊加成，農夫與靈寵各司其職。</p>
        </div>
      )}
    </div>
  );
}
