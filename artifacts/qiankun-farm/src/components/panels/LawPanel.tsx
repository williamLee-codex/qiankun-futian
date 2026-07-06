export default function LawPanel() {
  return (
    <div className="panel-content">
      <h2 className="panel-title">⚖️ 天道律法｜乾坤福田完整規則</h2>

      <div className="law-section">
        <h3 className="law-subtitle">🌐 一、遊戲定位</h3>
        <ul className="law-list">
          <li>乾坤福田是「御策羅盤」中央養成系統的核心玩法。</li>
          <li>目前為前端 MVP 示範版，資料為前端假資料；未來將串接御策羅盤 Core API，實現真實數據同步。</li>
        </ul>
      </div>

      <div className="law-section">
        <h3 className="law-subtitle">🔄 二、基本循環</h3>
        <ul className="law-list">
          <li>播種 → 等待成長 → 作物成熟 → 收成入庫 → 出售換金幣 或 再投資播種</li>
          <li>收成後作物加入倉庫，可於市場出售兌換金幣。</li>
        </ul>
      </div>

      <div className="law-section">
        <h3 className="law-subtitle">💰 三、貨幣說明</h3>
        <ul className="law-list">
          <li>金幣：透過收成、出售作物取得，用於購買凡品靈寵、種子。</li>
          <li>水晶：稀有貨幣，用於購買靈品靈寵及特定道具。</li>
          <li>累積儲值：綁定真實消費紀錄，解鎖高階土地與稀有靈寵。不可轉讓、不可退款。</li>
        </ul>
      </div>

      <div className="law-section">
        <h3 className="law-subtitle">🌱 四、六塊土地與解鎖條件</h3>
        <ul className="law-list">
          <li>微芒凡土 🟡：初始解鎖，無需儲值。</li>
          <li>幽熒沃土 🔵：初始解鎖，無需儲值。</li>
          <li>朱砂烈土 🔴：初始解鎖，無需儲值。</li>
          <li>曜紫靈土 🟣：累積儲值達 100 水晶後自動解鎖。</li>
          <li>翡翠聖土 🟢：累積儲值達 300 水晶後自動解鎖。</li>
          <li>黑金晶土 ⚫：累積儲值達 600 水晶後自動解鎖。</li>
        </ul>
      </div>

      <div className="law-section">
        <h3 className="law-subtitle">🌾 五、播種與收成規則</h3>
        <ul className="law-list">
          <li>MVP 測試版成熟時間：10 秒（方便測試）。</li>
          <li>正式設定可擴充為 4 小時、8 小時等長週期。</li>
          <li>成熟後，點擊該土地可手動收成；農夫解鎖後可自動收成。</li>
          <li>每次收成增加金幣，作物加入倉庫庫存。</li>
          <li>倉庫作物可在市場出售，每件作物換取 8 金幣。</li>
        </ul>
      </div>

      <div className="law-section">
        <h3 className="law-subtitle">🐾 六、靈寵規則</h3>
        <ul className="law-list">
          <li>正式靈寵共四隻：尋星犬、辟邪狻猊、噬時諦聽、乾坤麒麟。</li>
          <li>一次只能出戰一隻靈寵；更換靈寵須等待 8 小時冷卻。</li>
          <li>餵食後維持 12 小時飽腹；飢餓狀態下每小時可能偷吃成熟作物。</li>
          <li>偷吃範圍：第 2～5 塊成熟作物各 1 個；第 1 塊與第 6 塊永遠不會被偷吃。</li>
        </ul>
      </div>

      <div className="law-section">
        <h3 className="law-subtitle">🎁 七、靈寵取得方式</h3>
        <ul className="law-list">
          <li>尋星犬（凡品）：天道商店，300 金幣購得。</li>
          <li>辟邪狻猊（靈品）：天道商店，100 水晶購得。</li>
          <li>噬時諦聽（仙品）：累積儲值達 450 水晶，系統自動贈送。</li>
          <li>乾坤麒麟（神品）：累積儲值達 799 水晶，系統自動贈送。</li>
          <li>所有靈寵永久綁定帳號，不可交易或轉讓。</li>
        </ul>
      </div>

      <div className="law-section">
        <h3 className="law-subtitle">👨‍🌾 八、農夫規則</h3>
        <ul className="law-list">
          <li>解鎖條件：累積儲值達 999 水晶。</li>
          <li>農夫負責：自動播種、自動收成、自動出售、自動補種。</li>
          <li>靈寵仍獨立負責：巡邏防護、事件觸發、尋寶、特殊加成。</li>
          <li>農夫與靈寵分工合作，互不取代。</li>
        </ul>
      </div>

      <div className="law-section">
        <h3 className="law-subtitle">📦 九、系統功能說明</h3>
        <ul className="law-list">
          <li>倉庫：儲存種子與收成作物，查看目前庫存。</li>
          <li>種子：管理種子庫存，未來可購買多種特殊種子。</li>
          <li>任務：每日任務與成就系統，完成可獲得額外獎勵。</li>
          <li>市場：出售倉庫中的作物換取金幣，未來開放玩家交易。</li>
        </ul>
      </div>

      <p className="panel-note">⚠ 本版為前端 MVP，所有數據為示範用假資料。正式版將串接御策羅盤 Core API 同步真實資產。</p>
    </div>
  );
}
