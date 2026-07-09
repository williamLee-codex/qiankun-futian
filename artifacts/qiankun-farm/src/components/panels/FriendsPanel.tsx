import { useState } from 'react';
import { useGame } from '../../game/GameContext';
import { usePlatformFriends } from '../../platform/usePlatformFriends';

function fmtDuration(ms: number) {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} 小時 ${m} 分`;
  return `${m} 分鐘`;
}

/**
 * 好友頁（最小可行版本）。
 *
 * 好友身份資料一律讀取自平台 platformFriends（見 src/platform），
 * 乾坤福田不維護自己的獨立好友資料。
 * 拜訪詳細畫面／選田借運／一鍵結緣代收／靈寵影響，留待下一階段任務實作。
 */
export default function FriendsPanel() {
  const { state } = useGame();
  const { friends, addFriend } = usePlatformFriends();
  const [name, setName] = useState('');
  const now = Date.now();

  function handleAdd() {
    addFriend(name);
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
        {friends.length === 0 && (
          <p className="panel-note">尚無好友，新增一位好友開始互動吧！</p>
        )}
        {friends.map(friend => {
          const borrow = state.borrowState[friend.uid];
          const inCooldown = !!borrow?.cooldownUntil && now < borrow.cooldownUntil;
          const canVisit = friend.farmPublic && !inCooldown;
          return (
            <div key={friend.uid} className="pet-card">
              <div className="pet-header">
                <span className="pet-name">{friend.avatar} {friend.nickname}</span>
                <span className={`pet-status ${canVisit ? 'pet-status--active' : ''}`}>
                  {!friend.farmPublic ? '福田未公開' : inCooldown ? '冷卻中' : '可拜訪'}
                </span>
              </div>
              <p className="pet-desc">
                {!friend.farmPublic
                  ? '對方尚未公開福田，暫時無法拜訪。'
                  : inCooldown
                    ? `因果鎖印冷卻中，剩 ${fmtDuration(borrow!.cooldownUntil! - now)}`
                    : '目前可以前往拜訪。'}
              </p>
              <div className="pet-actions">
                <button
                  className={`pet-btn pet-btn--deploy${!canVisit ? ' pet-btn--disabled' : ''}`}
                  onClick={() => {
                    if (!canVisit) {
                      if (!friend.farmPublic) {
                        alert(`${friend.nickname} 尚未公開福田，暫時無法拜訪。`);
                      } else {
                        alert(`對 ${friend.nickname} 的因果鎖印尚未解除，剩 ${fmtDuration(borrow!.cooldownUntil! - now)}。`);
                      }
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
