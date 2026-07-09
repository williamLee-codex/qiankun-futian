import { useState } from 'react';
import { useGame } from '../../game/GameContext';

function fmtDuration(ms: number) {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} 小時 ${m} 分`;
  return `${m} 分鐘`;
}

/** 好友頁（最小可行版本）：僅作為入口，顯示好友列表與拜訪按鈕。
 *  拜訪詳細畫面／選田借運／一鍵結緣代收／靈寵影響，留待下一階段任務實作。 */
export default function FriendsPanel() {
  const { state, dispatch } = useGame();
  const [name, setName] = useState('');
  const now = Date.now();

  function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({ type: 'ADD_FRIEND', name: trimmed });
    setName('');
  }

  return (
    <div className="panel-content">
      <h2 className="panel-title">🤝 好友</h2>

      <div className="friend-add-row" style={{ marginBottom: '16px' }}>
        <input
          className="friend-add-input"
          type="text"
          placeholder="輸入好友道號"
          value={name}
          maxLength={12}
          onChange={e => setName(e.target.value)}
        />
        <button className="pet-btn pet-btn--buy" onClick={handleAdd}>新增</button>
      </div>

      <div className="pets-list">
        {state.friends.length === 0 && (
          <p className="panel-note">尚無好友，新增一位好友開始互動吧！</p>
        )}
        {state.friends.map(friend => {
          const inCooldown = friend.cooldownUntil !== null && now < friend.cooldownUntil;
          const canVisit = !inCooldown;
          return (
            <div key={friend.id} className="pet-card">
              <div className="pet-header">
                <span className="pet-name">{friend.name}</span>
                <span className={`pet-status ${canVisit ? 'pet-status--active' : ''}`}>
                  {inCooldown ? '冷卻中' : '可拜訪'}
                </span>
              </div>
              <p className="pet-desc">
                {inCooldown
                  ? `因果鎖印冷卻中，剩 ${fmtDuration(friend.cooldownUntil! - now)}`
                  : '目前可以前往拜訪。'}
              </p>
              <div className="pet-actions">
                <button
                  className={`pet-btn pet-btn--deploy${!canVisit ? ' pet-btn--disabled' : ''}`}
                  onClick={() => {
                    if (!canVisit) {
                      alert(`對 ${friend.name} 的因果鎖印尚未解除，剩 ${fmtDuration(friend.cooldownUntil! - now)}。`);
                      return;
                    }
                    alert(`好友福田拜訪功能即將推出，敬請期待！`);
                  }}
                >
                  拜訪
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
