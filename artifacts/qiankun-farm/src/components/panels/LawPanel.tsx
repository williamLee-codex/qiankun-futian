/**
 * LawPanel — 天道律法 Complete Scroll Dialog
 * 14 sections covering all game rules and systems.
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

      {/* ② 福田玩法 */}
      <div className="law-section">
        <h3 className="law-subtitle">② 福田玩法</h3>
        <ul className="law-list">
          <li>基本循環：播種 → 等待成長 → 作物成熟 → 收成入庫 → 出售換金幣。</li>
          <li>點選土地可播種或手動收成；農夫解鎖後自動完成所有流程。</li>
          <li>【一鍵播種】：對所有空地同時播種至最大容量。</li>
          <li>【一鍵收成】：對所有成熟土地同時收成。</li>
          <li>【一鍵收播】：VIP 功能，先全部收成再立刻重新播種（需累積儲值 ≥ 600 水晶）。</li>
        </ul>
      </div>

      {/* ③ 土地介紹 */}
      <div className="law-section">
        <h3 className="law-subtitle">③ 土地介紹</h3>
        <ul className="law-list">
          <li>乾坤空間共有六塊靈田，由淺至深對應不同靈氣等級。</li>
          <li>前三塊為初始開放，後三塊需達到累積儲值門檻方可解鎖。</li>
          <li>每塊土地有固定播種上限，等級越高上限越低，但靈氣產出質量更佳。</li>
          <li>土地一旦解鎖即永久保留，不受帳號狀態影響。</li>
        </ul>
      </div>

      {/* ④ 六種土壤 */}
      <div className="law-section">
        <h3 className="law-subtitle">④ 六種土壤與解鎖條件</h3>
        <ul className="law-list">
          <li>🟡 微芒凡土：初始解鎖，播種上限 20 顆。</li>
          <li>🔵 幽熒沃土：初始解鎖，播種上限 15 顆。</li>
          <li>🔴 朱砂烈土：初始解鎖，播種上限 10 顆。</li>
          <li>🟣 曜紫靈土：累積儲值達 100 水晶解鎖，上限 8 顆。</li>
          <li>🟢 翡翠聖土：累積儲值達 300 水晶解鎖，上限 5 顆。</li>
          <li>⚫ 黑金晶土：累積儲值達 600 水晶解鎖，上限 2 顆。</li>
        </ul>
      </div>

      {/* ⑤ 六種種子 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑤ 六種種子</h3>
        <ul className="law-list">
          <li>每塊土地對應一種靈種，播種後每顆種子成熟產出 1 件作物（1:1 固定比例）。</li>
          <li>MVP 版成熟時間：10 秒（測試用）；正式版可設定 4 小時、8 小時等長週期。</li>
          <li>種子從倉庫扣除，收成後作物回到倉庫。</li>
          <li>種子庫存不足時，無法播種；一鍵播種以現有庫存為上限。</li>
        </ul>
      </div>

      {/* ⑥ 靈寵系統 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑥ 靈寵系統</h3>
        <ul className="law-list">
          <li>正式靈寵共四隻，品級由低到高：凡品、靈品、仙品、神品。</li>
          <li>一次只能出戰一隻靈寵；更換靈寵須等待 8 小時冷卻時間。</li>
          <li>餵食後維持 12 小時飽腹狀態；飢餓時每小時有機率偷吃成熟作物。</li>
          <li>偷吃範圍：第 2～5 塊成熟作物各 1 個；第 1 塊與第 6 塊不受偷吃影響。</li>
          <li>靈寵主要負責：巡邏保護、觸發事件、探索尋寶與特殊加成。</li>
        </ul>
      </div>

      {/* ⑦ 農夫系統 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑦ 農夫系統</h3>
        <ul className="law-list">
          <li>農夫解鎖條件：累積儲值達 999 水晶後系統自動贈送。</li>
          <li>農夫功能：自動播種、自動收成、自動出售、自動補種，24 小時不間斷運作。</li>
          <li>農夫與靈寵各司其職，互不取代：農夫管生產，靈寵管保護與特殊事件。</li>
          <li>農夫解鎖後仍可手動操作，農夫為輔助不強制接管。</li>
        </ul>
      </div>

      {/* ⑧ 天氣系統 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑧ 天氣系統</h3>
        <ul className="law-list">
          <li>天氣類型：晴☀️ / 雨🌧️ / 雷⛈️ / 雪❄️，由系統每日隨機更新。</li>
          <li>晴天：正常生長速度，無額外加成。</li>
          <li>雨天：生長速度加快 20%，靈寵偷吃機率降低。</li>
          <li>雷天：生長速度降低 10%，有機率觸發雷擊收成（自動收成部分成熟作物）。</li>
          <li>雪天：生長速度降低 30%，但收成作物品質提升（額外加成金幣）。</li>
          <li>正式版天氣資料將對接真實氣象 API 或御策羅盤世界事件系統。</li>
        </ul>
      </div>

      {/* ⑨ 解鎖規則 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑨ 解鎖規則</h3>
        <ul className="law-list">
          <li>累積儲值：綁定玩家在御策羅盤平台的真實消費紀錄（不可退款、不可轉讓）。</li>
          <li>100 水晶 → 解鎖 🟣 曜紫靈土 + 辟邪狻猊購買資格。</li>
          <li>300 水晶 → 解鎖 🟢 翡翠聖土。</li>
          <li>450 水晶 → 自動贈送 噬時諦聽（仙品靈寵）。</li>
          <li>600 水晶 → 解鎖 ⚫ 黑金晶土 + 【一鍵收播】VIP 功能。</li>
          <li>799 水晶 → 自動贈送 乾坤麒麟（神品靈寵）。</li>
          <li>999 水晶 → 自動贈送 農夫系統。</li>
        </ul>
      </div>

      {/* ⑩ 收成規則 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑩ 收成規則</h3>
        <ul className="law-list">
          <li>作物成熟後顯示「可收成」標記，需手動點擊收成（未解鎖農夫時）。</li>
          <li>每次收成：作物進入倉庫；同時獲得金幣獎勵（依收成數量計算）。</li>
          <li>作物可於市場出售，每件換取 8 金幣（MVP 測試值）。</li>
          <li>收成動畫：成熟作物飛向左上方「氣運倉庫」，視覺反饋收成成功。</li>
          <li>已成熟作物不會自動消失（農夫解鎖後除外）。</li>
        </ul>
      </div>

      {/* ⑪ 一鍵播種 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑪ 一鍵播種</h3>
        <ul className="law-list">
          <li>功能：對所有已解鎖的空置土地同時播種，播種量為各土地最大容量。</li>
          <li>若種子庫存不足，依序按土地順序播種至庫存耗盡為止。</li>
          <li>不可對已在生長中或已成熟的土地重複播種。</li>
          <li>無限制：任何玩家皆可使用，不需累積儲值。</li>
        </ul>
      </div>

      {/* ⑫ 一鍵收播 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑫ 一鍵收播</h3>
        <ul className="law-list">
          <li>功能：先執行「一鍵收成」（全部成熟作物），動畫完成後立即執行「一鍵播種」。</li>
          <li>解鎖條件：累積儲值 ≥ 600 水晶。</li>
          <li>未達門檻時按鈕顯示灰色鎖定，點擊顯示解鎖說明。</li>
          <li>解鎖後一鍵完成收成與重新播種，最大化農田利用效率。</li>
        </ul>
      </div>

      {/* ⑬ VIP功能 */}
      <div className="law-section">
        <h3 className="law-subtitle">⑬ VIP 功能總覽</h3>
        <ul className="law-list">
          <li>VIP 功能以「累積儲值」為核心解鎖機制，永久有效。</li>
          <li>600 水晶：【一鍵收播】— 省時高效農耕核心功能。</li>
          <li>450 水晶：噬時諦聽（仙品）— 加速生長 15%，自動保護成熟作物。</li>
          <li>799 水晶：乾坤麒麟（神品）— 所有土地生長加速 30%，VIP 最高階靈寵。</li>
          <li>999 水晶：農夫系統 — 全自動化農耕，無需任何手動操作。</li>
          <li>所有 VIP 功能與帳號永久綁定，不可轉讓或退款。</li>
        </ul>
      </div>

      {/* ⑭ FAQ */}
      <div className="law-section">
        <h3 className="law-subtitle">⑭ 常見問題 FAQ</h3>
        <ul className="law-list">
          <li>Q：種子不夠怎麼辦？ → 前往市場購買種子，或等收成後補充庫存。</li>
          <li>Q：土地鎖定如何解鎖？ → 透過累積在御策羅盤平台的消費記錄自動解鎖。</li>
          <li>Q：靈寵被偷吃了怎麼辦？ → 定期餵食靈寵可避免偷吃；雨天偷吃機率較低。</li>
          <li>Q：累積儲值可以退款嗎？ → 不可退款、不可轉讓，請謹慎消費。</li>
          <li>Q：農夫解鎖後需要手動操作嗎？ → 不需要，農夫全自動；玩家也可手動覆寫。</li>
          <li>Q：一鍵收播需要什麼條件？ → 累積儲值達 600 水晶後永久解鎖。</li>
          <li>Q：資料會保存嗎？ → MVP 版資料暫存於瀏覽器；正式版將串接御策羅盤雲端帳號系統。</li>
        </ul>
      </div>

      <p className="panel-note">⚠ 本版為前端 MVP 示範版，所有數據為示範用假資料。正式版將串接御策羅盤 Core API 同步真實資產與雲端帳號。</p>
    </div>
  );
}
