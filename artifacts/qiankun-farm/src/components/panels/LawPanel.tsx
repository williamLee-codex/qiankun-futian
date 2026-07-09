/**
 * LawPanel — 天道律法 Complete Scroll Dialog
 * 正確版本：依照《乾坤福田 V2》正式規格。
 */
export default function LawPanel() {
  return (
    <div className="panel-content">
      <h2 className="panel-title">📖 天道律法｜乾坤福田完整規則</h2>

      {/* ① 遊戲介紹 */}
      <div className="law-section">
        <h3 className="law-subtitle">① 遊戲介紹</h3>
        <ul className="law-list">
          <li>乾坤福田是「御策羅盤」宇宙觀中的核心農耕養成系統。</li>
          <li>玩家扮演仙道傳人，在靈氣充沛的乾坤空間中耕作六塊靈田。</li>
          <li>透過播種、收成、販售，積累金幣與水晶，進而解鎖更高階的土地與靈寵。</li>
          <li>目前為前端 MVP 版本；正式版將串接御策羅盤 Core API 實現真實資產同步。</li>
        </ul>
      </div>

      {/* ② 土地解鎖規則 */}
      <div className="law-section">
        <h3 className="law-subtitle">② 土地解鎖規則</h3>
        <ul className="law-list">
          <li>🟡 微芒凡土（第1塊）：初始解鎖，播種上限 20 顆。</li>
          <li>🔵 幽熒沃土（第2塊）：花費 88 金幣解鎖，播種上限 15 顆。</li>
          <li>🔴 朱砂烈土（第3塊）：花費 888 金幣解鎖，播種上限 10 顆。</li>
          <li>🟣 曜紫靈土（第4塊）：累積儲值達 100 水晶解鎖，播種上限 6 顆。</li>
          <li>🟢 翡翠聖土（第5塊）：累積儲值達 300 水晶解鎖，播種上限 4 顆。</li>
          <li>⚫ 黑金晶土（第6塊）：累積儲值達 600 水晶解鎖，播種上限 2 顆。</li>
          <li>土地一旦解鎖即永久保留，不受帳號狀態影響。</li>
        </ul>
      </div>

      {/* ③ 播種規則 */}
      <div className="law-section">
        <h3 className="law-subtitle">③ 播種規則</h3>
        <ul className="law-list">
          <li>每顆種子播種後成熟固定產出 1 件作物（1:1 固定比例）。</li>
          <li>不顯示預估產量、基礎產量或產量倍率。</li>
          <li>MVP 版成熟時間：10 秒（測試用）；正式版設定為長週期。</li>
          <li>種子從倉庫扣除，收成後作物回到倉庫。</li>
          <li>種子庫存不足時，無法播種；一鍵播種以現有庫存為上限。</li>
        </ul>
      </div>

      {/* ④ 收成規則 */}
      <div className="law-section">
        <h3 className="law-subtitle">④ 收成規則</h3>
        <ul className="law-list">
          <li>作物成熟後顯示「可收成」標記，需手動點擊收成（未解鎖農夫時）。</li>
          <li>每次收成：作物進入倉庫；同時獲得金幣獎勵（依收成數量計算）。</li>
          <li>作物可於市場出售，每件換取 8 金幣（MVP 測試值）。</li>
          <li>收成動畫：成熟作物飛向左上方「氣運倉庫」，視覺反饋收成成功。</li>
          <li>一鍵收成時，每塊田依序播放動畫，避免全部重疊。</li>
        </ul>
      </div>

      {/* ⑤ 一鍵功能 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑤ 一鍵功能</h3>
        <ul className="law-list">
          <li>【一鍵收成】：收成所有成熟土地。解鎖條件：解鎖第3塊土地（朱砂烈土，888 金幣）。</li>
          <li>【一鍵播種】：依土地順序播種，直到種子不足。解鎖條件：解鎖第4塊土地（曜紫靈土，100 水晶）。</li>
          <li>【一鍵收播】：先收成，再用現有種子播種。解鎖條件：解鎖第5塊土地（翡翠聖土，300 水晶）。</li>
          <li>【智慧收播】：先收成，再檢查種子是否足夠；不足時跳出確認視窗補足後播種。解鎖條件：解鎖第6塊土地（黑金晶土，600 水晶）。</li>
          <li>未解鎖的功能按鈕顯示 🔒，點擊後顯示解鎖提示。</li>
        </ul>
      </div>

      {/* ⑥ 靈獸守護 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑥ 靈獸守護</h3>
        <ul className="law-list">
          <li>正式靈獸共四隻，品級由低至高為凡品、靈品、仙品、神品。</li>
          <li>每位玩家一次只能出戰一隻靈獸，更換出戰靈獸需等待 8 小時冷卻。</li>
          <li>靈獸餵食後維持 12 小時飽腹狀態；飢餓時，每小時有機率偷吃第 2～5 塊田的成熟作物各 1 個，第 1 塊與第 6 塊田不受影響。</li>
          <li>靈獸主要負責：巡邏保護、觸發事件、探索尋寶與特殊加成。</li>
        </ul>
      </div>

      {/* ⑦ 農夫系統 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑦ 農夫系統</h3>
        <ul className="law-list">
          <li>累積儲值達 999 水晶後解鎖農夫。農夫為輔助系統，不強制接管。玩家可自行啟動或關閉。</li>
          <li>農夫啟動後，任一作物成熟時會自動收成，並在種子足夠時自動補種；若種子不足，土地保持空地，需玩家自行購買種子。</li>
          <li>農夫不會自動購買種子，也不會自動消耗金幣或水晶。</li>
        </ul>
      </div>

      {/* ⑧ 福田任務 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑧ 福田任務</h3>
        <ul className="law-list">
          <li>福田任務為乾坤福田內部每日小任務，獎勵僅限金幣，不提供水晶、功德、靈寵碎片或其他平台級獎勵。</li>
          <li>福田任務與御策羅盤主頁未來的「天機」系統彼此獨立，不可混用。</li>
        </ul>
      </div>

      {/* ⑨ 好友借運 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑨ 好友借運</h3>
        <ul className="law-list">
          <li>借運會從好友第 2～5 塊成熟田中隨機選取一塊，取得該田產量的 20%。</li>
          <li>好友可拜訪彼此福田，但第 1 塊新手田與第 6 塊水晶田不可借運，僅能借運第 2～5 塊。</li>
          <li>收益採無條件進位，至少取得 1 個；地主損失同等數量。</li>
          <li>每次拜訪單一好友只能借運一格，出手後會對該好友產生獨立 24 小時因果鎖印冷卻。</li>
          <li>每日中午 12:00 刷新個人每日借運總次數，預設每日 10 次；每次借運都會扣除當日次數。</li>
          <li>借運會套用靈寵效果（例如仙品靈獸「噬時諦聽」有機率額外觸發一次收益）。</li>
        </ul>
      </div>

      {/* ⑩ 一鍵採收 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑩ 一鍵採收</h3>
        <ul className="law-list">
          <li>一鍵採收可協助好友收取所有超時作物，訪客獲得 5%，其餘 95% 歸還好友倉庫。</li>
          <li>僅處理成熟超過 1 小時未收的作物，一次處理所有符合條件的超時作物。</li>
          <li>收益採無條件進位，至少取得 1 個。</li>
          <li>一鍵採收不是借運：不扣每日借運次數、不建立因果鎖印，也不受靈寵借運效果影響。</li>
          <li>若地主已啟動農夫，作物成熟瞬間會自動收成，不會進入超時狀態。</li>
        </ul>
      </div>

      {/* ⑪ 天氣系統 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑪ 天氣系統</h3>
        <ul className="law-list">
          <li>天氣類型：晴☀️ / 雨🌧️ / 雷⛈️ / 雪❄️，由系統每日隨機更新。</li>
          <li>晴天：正常生長速度，無額外加成。</li>
          <li>雨天：生長速度加快 20%，靈獸偷吃機率降低。</li>
          <li>雷天：生長速度降低 10%，有機率觸發雷擊自動收成。</li>
          <li>雪天：生長速度降低 30%，但收成作物品質提升（額外加成金幣）。</li>
        </ul>
      </div>

      {/* ⑫ 常見問題 FAQ */}
      <div className="law-section">
        <h3 className="law-subtitle">⑫ 常見問題 FAQ</h3>
        <ul className="law-list">
          <li>Q：種子不夠怎麼辦？ → 前往市場購買種子，或等收成後補充庫存。</li>
          <li>Q：土地如何解鎖？ → 第2、3塊花費金幣；第4～6塊需累積儲值水晶自動解鎖。</li>
          <li>Q：一鍵播種沒反應？ → 確認第4塊土地已解鎖，且倉庫有種子。</li>
          <li>Q：智慧收播和一鍵收播有何不同？ → 智慧收播會在種子不足時跳出補購確認，更智能。</li>
          <li>Q：累積儲值可以退款嗎？ → 不可退款、不可轉讓，請謹慎消費。</li>
          <li>Q：農夫解鎖後需要手動操作嗎？ → 不需要，開關由玩家自行決定，農夫不會強制接管。</li>
          <li>Q：借運後多久可以再借同一位好友？ → 需等待 24 小時因果鎖印冷卻結束。</li>
          <li>Q：資料會保存嗎？ → MVP 版資料保存於本機瀏覽器（localStorage）；正式版將串接御策羅盤雲端帳號。</li>
        </ul>
      </div>

      <p className="panel-note">⚠ 本版為前端 MVP 示範版，所有數據為示範用假資料。正式版將串接御策羅盤 Core API 同步真實資產與雲端帳號。</p>
    </div>
  );
}
