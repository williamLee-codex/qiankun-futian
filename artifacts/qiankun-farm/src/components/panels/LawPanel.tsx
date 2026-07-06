import { useGame } from '../../game/GameContext';

export default function LawPanel() {
  const { dispatch } = useGame();
  return (
    <div className="panel-content">
      <h2 className="panel-title">⚖️ 天道律法</h2>
      <div className="law-section">
        <h3 className="law-subtitle">乾坤福田基本律法</h3>
        <ul className="law-list">
          <li>每位修士永久擁有曾取得之靈寵，不得交易或轉讓。</li>
          <li>一次只可出戰一隻靈寵，更換靈寵須等待八小時冷卻期。</li>
          <li>餵食靈寵後維持十二小時飽腹，飢餓時戰鬥力下降。</li>
          <li>農夫僅負責耕種事務，靈寵另行負責巡邏防護與尋寶。</li>
          <li>農夫解鎖門檻：累積儲值達九百九十九水晶。</li>
        </ul>
      </div>
      <div className="law-section">
        <h3 className="law-subtitle">土地開墾律法</h3>
        <ul className="law-list">
          <li>微芒凡土、幽熒沃土、朱砂烈土：初始解鎖，無需儲值。</li>
          <li>曜紫靈土：累積儲值一百水晶方可開墾。</li>
          <li>翡翠聖土：累積儲值三百水晶方可開墾。</li>
          <li>黑金晶土：累積儲值六百水晶方可開墾。</li>
        </ul>
      </div>
      <div className="law-section">
        <h3 className="law-subtitle">靈寵取得律法</h3>
        <ul className="law-list">
          <li>尋星犬（凡品）：天道商店，三百金幣購得。</li>
          <li>辟邪狻猊（靈品）：天道商店，一百水晶購得。</li>
          <li>噬時諦聽（仙品）：累積儲值四百五十水晶，天道贈送。</li>
          <li>乾坤麒麟（神品）：累積儲值七百九十九水晶，天道贈送。</li>
        </ul>
      </div>
      <button className="action-btn" style={{ marginTop: 12 }} onClick={() => dispatch({ type: 'CLOSE_PANEL' })}>
        知悉，關閉
      </button>
    </div>
  );
}
