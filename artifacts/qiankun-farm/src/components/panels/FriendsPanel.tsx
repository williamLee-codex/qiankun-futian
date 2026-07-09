import { useState } from 'react';
import { useGame } from '../../game/GameContext';
import { usePlatformFriends } from '../../platform/usePlatformFriends';

const OVERFLOW_MS = 60 * 60_000;

function fmtDuration(ms: number) {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} 小時 ${m} 分`;
  return `${m} 分鐘`;
}

/**
 * 好友頁（V1.1）。
 *
 * 好友身份資料一律讀取自平台 platformFriends（見 src/platform），
 * 乾坤福田不維護自己的獨立好友資料，只保留互動用的 borrowState。
 *
 * 借運：從對方第2～5塊成熟田中隨機選1塊，訪客取得該田產量20%（無條件進位，至少1個）；
 *       扣每日借運次數，建立24小時因果鎖印。
 * 一鍵採收：協助好友收取所有「成熟超時1小時未收」的作物，訪客取得總量5%（無條件進位，至少1個），
 *           其餘95%歸還好友倉庫；不是借運，不扣每日次數、不建立因果鎖印。
 */
export default function FriendsPanel() {
  const { state, dispatch } = useGame();
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
          const readyPlots = borrow?.plots ?? [];
          const hasBorrowable = readyPlots.some(p => p.readyAt !== null);
          const overtimePlots = readyPlots.filter(p => p.readyAt !== null && now - p.readyAt! >= OVERFLOW_MS);
          const canBorrow = friend.farmPublic && !inCooldown && hasBorrowable && state.dailyBorrowCount < state.dailyBorrowLimit;
          const canHarvestAll = friend.farmPublic && overtimePlots.length > 0;

          function handleBorrow() {
            if (!friend.farmPublic) {
              alert(`${friend.nickname} 尚未公開福田，暫時無法拜訪。`);
              return;
            }
            if (inCooldown) {
              alert(`對 ${friend.nickname} 的因果鎖印尚未解除，剩 ${fmtDuration(borrow!.cooldownUntil! - now)}。`);
              return;
            }
            if (state.dailyBorrowCount >= state.dailyBorrowLimit) {
              alert('今日借運次數已用完，請明日中午12:00後再來。');
              return;
            }
            if (!hasBorrowable) {
              alert(`${friend.nickname} 目前沒有成熟田可借運。`);
              return;
            }
            dispatch({ type: 'VISIT_BORROW', friendUid: friend.uid });
          }

          function handleHarvestAll() {
            if (!friend.farmPublic) {
              alert(`${friend.nickname} 尚未公開福田，暫時無法採收。`);
              return;
            }
            if (overtimePlots.length === 0) {
              alert(`${friend.nickname} 目前沒有超時1小時未收的作物。`);
              return;
            }
            dispatch({ type: 'HARVEST_ALL_FRIEND', friendUid: friend.uid });
          }

          return (
            <div key={friend.uid} className="pet-card">
              <div className="pet-header">
                <span className="pet-name">{friend.avatar} {friend.nickname}</span>
                <span className={`pet-status ${canBorrow || canHarvestAll ? 'pet-status--active' : ''}`}>
                  {!friend.farmPublic ? '福田未公開' : inCooldown ? '借運冷卻中' : '可互動'}
                </span>
              </div>
              <p className="pet-desc">
                {!friend.farmPublic
                  ? '對方尚未公開福田，暫時無法互動。'
                  : `借運：從第2～5塊成熟田中隨機選取一塊，取得該田產量的20%。${inCooldown ? `（因果鎖印剩 ${fmtDuration(borrow!.cooldownUntil! - now)}）` : ''}`}
              </p>
              {friend.farmPublic && (
                <p className="pet-desc">
                  一鍵採收可協助好友收取所有超時作物，訪客獲得5%，其餘95%歸還好友倉庫。
                  {overtimePlots.length > 0 ? `（目前有 ${overtimePlots.length} 塊超時田可採收）` : '（目前無超時作物）'}
                </p>
              )}
              <div className="pet-actions">
                <button
                  className={`pet-btn pet-btn--deploy${!canBorrow ? ' pet-btn--disabled' : ''}`}
                  onClick={handleBorrow}
                >
                  借運
                </button>
                <button
                  className={`pet-btn pet-btn--feed${!canHarvestAll ? ' pet-btn--disabled' : ''}`}
                  onClick={handleHarvestAll}
                >
                  一鍵採收
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
