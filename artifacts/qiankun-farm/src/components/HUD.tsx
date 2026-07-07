/**
 * ResourceHUD — 頂部資源欄容器（z-index: 30）
 * 目前狀態：顯示黑色底 + 金色外框容器，不顯示任何內容。
 */
export default function GameHeader() {
  return (
    <div className="resource-hud" onClick={e => e.stopPropagation()} />
  );
}
