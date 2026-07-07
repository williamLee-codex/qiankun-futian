/**
 * StatusBar — 資訊欄容器（乾坤福田牌匾下方）
 * 目前狀態：顯示深色半透明底 + 金色邊框容器，不顯示任何文字或 icon。
 *
 * 互動邏輯已保留（import / hook），後續恢復顯示只需取消註解。
 */
export default function StatusBar() {
  return (
    <div className="sb-overlay" onClick={e => e.stopPropagation()} />
  );
}
