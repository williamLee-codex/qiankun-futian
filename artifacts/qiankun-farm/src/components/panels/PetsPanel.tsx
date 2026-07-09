import { useGame } from '../../game/GameContext';
import type { Pet } from '../../game/types';

const gradeColor: Record<Pet['grade'], string> = {
  '凡品': '#a0a0a0',
  '靈品': '#4fc3f7',
  '仙品': '#ce93d8',
  '神品': '#ffd700',
};

function fmtDuration(ms: number) {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} 小時 ${m} 分`;
  return `${m} 分鐘`;
}

export default function PetsPanel() {
  const { state, dispatch } = useGame();
  const now = Date.now();
  const activePet = state.pets.find(p => p.active);

  return (
    <div className="panel-content">
      <h2 className="panel-title">🐾 靈獸</h2>

      {/* A. 靈獸共通規則 */}
      <div className="law-section">
        <h3 className="law-subtitle">🅰 靈獸共通規則</h3>
        <ul className="law-list">
          <li>正式靈獸共四隻，品級由低到高：凡品、靈品、仙品、神品。</li>
          <li>一次只能出戰一隻靈獸。</li>
          <li>更換出戰靈獸需等待 8 小時冷卻。</li>
          <li>餵食後維持 12 小時飽腹狀態。</li>
          <li>飢餓後，每小時有機率偷吃第 2～5 塊田的成熟作物各 1 個。</li>
          <li>第 1 塊與第 6 塊田不受飢餓偷吃影響。</li>
          <li>靈獸主要負責巡邏、保護、觸發事件、探索尋寶與特殊加成。</li>
        </ul>
      </div>

      {/* B. 單隻靈獸技能 */}
      <h3 className="law-subtitle" style={{ marginTop: '12px' }}>🅱 單隻靈獸技能</h3>
      <div className="pets-list">
        {state.pets.map(pet => {
          const inCooldown = pet.cooldownUntil && now < pet.cooldownUntil;
          const isFed = pet.fedUntil && now < pet.fedUntil;
          return (
            <div key={pet.id} className={`pet-card ${pet.active ? 'pet-card--active' : ''}`}>
              <div className="pet-header">
                <span className="pet-name">{pet.name}</span>
                <span className="pet-grade" style={{ color: gradeColor[pet.grade] }}>{pet.grade}</span>
              </div>
              <p className="pet-desc">{pet.description}</p>
              {!pet.owned && (
                <div className="pet-acquire">
                  {pet.acquireType === 'shop-coins' && (
                    <span className="pet-cost">商店購買：{pet.acquireCost} 金幣</span>
                  )}
                  {pet.acquireType === 'shop-crystals' && (
                    <span className="pet-cost">商店購買：{pet.acquireCost} 水晶</span>
                  )}
                  {pet.acquireType === 'deposit' && (
                    <span className="pet-cost">累積儲值 {pet.acquireDepositRequired} 水晶贈送</span>
                  )}
                  {(pet.acquireType === 'shop-coins' || pet.acquireType === 'shop-crystals') && (
                    <button
                      className="pet-btn pet-btn--buy"
                      onClick={() => dispatch({ type: 'ACQUIRE_PET', petId: pet.id })}
                    >
                      購買
                    </button>
                  )}
                  {pet.acquireType === 'deposit' && (
                    <span className="pet-locked">
                      目前儲值：{state.totalDeposit} / {pet.acquireDepositRequired}
                    </span>
                  )}
                </div>
              )}
              {pet.owned && (
                <div className="pet-actions">
                  <span className={`pet-status ${pet.active ? 'pet-status--active' : ''}`}>
                    {pet.active ? '出戰中' : '待命'}
                  </span>
                  {isFed && <span className="pet-fed">飽腹中</span>}
                  {inCooldown && (
                    <span className="pet-cooldown">
                      冷卻中（剩 {fmtDuration(pet.cooldownUntil! - now)}）
                    </span>
                  )}
                  {!pet.active && !inCooldown && (
                    <button className="pet-btn pet-btn--deploy" onClick={() => dispatch({ type: 'ACTIVATE_PET', petId: pet.id })}>
                      出戰
                    </button>
                  )}
                  {!pet.active && inCooldown && (
                    <button
                      className="pet-btn pet-btn--deploy pet-btn--disabled"
                      onClick={() => alert(`更換出戰靈獸冷卻中，尚需等待 ${fmtDuration(pet.cooldownUntil! - now)}。`)}
                    >
                      冷卻中
                    </button>
                  )}
                  {pet.owned && !isFed && (
                    <button className="pet-btn pet-btn--feed" onClick={() => dispatch({ type: 'FEED_PET', petId: pet.id })}>
                      餵食
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="panel-note">
        {activePet
          ? `目前出戰：${activePet.name}（主畫面可見，重新整理後仍會顯示）。`
          : '目前無靈獸出戰，主畫面不會顯示靈獸。'}
      </p>
    </div>
  );
}
