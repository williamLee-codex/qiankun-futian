import { useState } from 'react';
import { useGame } from '../../game/GameContext';

function fmtDuration(ms: number) {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} 小時 ${m} 分`;
  return `${m} 分鐘`;
}

export default function FriendsPanel() {
  const { state, dispatch } = useGame();
  const [name, setName] = useState('');
  const now = Date.now();

  const remainingToday = Math.max(0, state.dailyBorrowLimit - state.dailyBorrowCount);

  function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({ type: 'ADD_FRIEND', name: trimmed });
    setName('');
  }

  return (
    <div className="panel-content">
      <h2 className="panel-title">🤝 好友</h2>

      <div className="law-section">
        <h3 className="law-subtitle">今日借運狀態</h3>
        <p className="panel-note">
          今日已借運 {state.dailyBorrowCount} / {state.dailyBorrowLimit} 次，剩餘 {remainingToday} 次。每日中午 12:00 重置。
        </p>
        {state.farmerActive && (
          <p className="panel-note">你已啟動農夫：你的福田作物成熟瞬間即被收走，不會進入好友代收狀態。</p>
        )}
      </div>

      <div className="law-section">
        <h3 className="law-subtitle">新增好友</h3>
        <div className="friend-add-row">
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
      </div>

      <h3 className="law-subtitle" style={{ marginTop: '12px' }}>好友列表</h3>
      <div className="pets-list">
        {state.friends.length === 0 && (
          <p className="panel-note">尚無好友，新增一位開始互相借運吧！</p>
        )}
        {state.friends.map(friend => {
          const inCooldown = friend.cooldownUntil !== null && now < friend.cooldownUntil;
          const hasOverflow = friend.overflowReadyAt !== null && now >= friend.overflowReadyAt;
          const canBorrow = !inCooldown && hasOverflow && remainingToday > 0;
          return (
            <div key={friend.id} className="pet-card">
              <div className="pet-header">
                <span className="pet-name">{friend.name}</span>
                <span className="pet-grade" style={{ color: '#8fd694' }}>
                  可借運：第 {friend.overflowPlotIndex + 1} 塊
                </span>
              </div>
              <p className="pet-desc">
                {inCooldown
                  ? `因果鎖印冷卻中，剩 ${fmtDuration(friend.cooldownUntil! - now)}`
                  : hasOverflow
                    ? '福田有能量外溢，可一鍵結緣代收！'
                    : '目前無可代收作物，稍候再來拜訪。'}
              </p>
              <div className="pet-actions">
                <span className={`pet-status ${hasOverflow && !inCooldown ? 'pet-status--active' : ''}`}>
                  {inCooldown ? '冷卻中' : hasOverflow ? '可代收' : '拜訪'}
                </span>
                <button
                  className="pet-btn pet-btn--deploy pet-btn--disabled"
                  onClick={() => {
                    if (!hasOverflow) return alert(`${friend.name} 的福田目前沒有能量外溢可代收。`);
                    if (inCooldown) return alert(`對 ${friend.name} 借運後需等待冷卻，剩 ${fmtDuration(friend.cooldownUntil! - now)}。`);
                    if (remainingToday <= 0) return alert('今日借運次數已用盡，請明日中午 12:00 後再來。');
                  }}
                  style={{ display: canBorrow ? 'none' : undefined }}
                >
                  拜訪
                </button>
                {canBorrow && (
                  <button
                    className="pet-btn pet-btn--deploy"
                    onClick={() => dispatch({ type: 'VISIT_BORROW', friendId: friend.id })}
                  >
                    一鍵結緣代收
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="panel-note">
        借運規則：僅能借運第 2～5 塊田（第1塊新手田與第6塊水晶田不可借運）；每次拜訪單一好友只能借運一格；借運後該好友進入獨立 24 小時冷卻；訪客取得 10% 總產值，其餘 90% 回地主倉庫。
      </p>
    </div>
  );
}
