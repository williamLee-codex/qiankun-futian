import { useEffect, useState } from "react";
import { FARM_V2_LANDS } from "./canonicalLandData";
import { NEWBIE_WINDOW_MS } from "./timeRuntime";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function formatRemaining(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainderSeconds = seconds % 60;
  return `${days} 天 ${hours} 小時 ${minutes} 分 ${remainderSeconds} 秒`;
}

/**
 * Newbie 7-day x6 harvest boost. The window is anchored to the server's
 * firstFarmEnteredAt; the multiplier itself is applied by the harvest
 * settlement on the server, never here.
 */
export function FarmNewbieBoost({ firstFarmEnteredAt }: { firstFarmEnteredAt?: number | null }) {
  const active = typeof firstFarmEnteredAt === "number" && Number.isFinite(firstFarmEnteredAt) && firstFarmEnteredAt > 0;
  const endsAt = active ? firstFarmEnteredAt + NEWBIE_WINDOW_MS : null;
  const now = useNow(active);
  const remaining = endsAt ? endsAt - now : 0;
  const inWindow = endsAt !== null && remaining > 0;
  return (
    <section aria-label="新手七日六倍活動" style={{ display: "grid", gap: 10 }}>
      <img
        src={`${import.meta.env.BASE_URL ?? "/"}images/farm/newcomer-6x-panel.png`}
        alt="新手六倍活動正式公告橫幅"
        style={{ display: "block", width: "100%", height: "auto", borderRadius: 10 }}
      />
      {!active && <p role="status">尚未取得首次進入福田的有效時間，無法判定六倍活動資格或顯示倒數；請重新讀取農田資料。</p>}
      {active && (
        <>
          <p role="status" style={{ margin: 0, fontWeight: 700, color: inWindow ? "#ffd76a" : "#9fb2a6" }}>
            {inWindow ? `剩餘時間：${formatRemaining(remaining)}` : "活動已結束，收成回復為一般產量。"}
          </p>
          <p style={{ margin: 0, fontSize: 13 }}>
            活動期間：{new Date(firstFarmEnteredAt).toLocaleString("zh-TW")} 起 7 日。
            六倍加成適用於下列六塊靈田的收成產量（僅作物數量，不影響種子、兌換比例或合成）。
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            {FARM_V2_LANDS.map((land) => (
              <li key={land.id}>{land.landName}・{land.cropName}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
