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
export function FarmNewbieBoost({ firstFarmEnteredAt, onClose }: { firstFarmEnteredAt?: number | null; onClose?: () => void }) {
  const active = typeof firstFarmEnteredAt === "number" && Number.isFinite(firstFarmEnteredAt) && firstFarmEnteredAt > 0;
  const endsAt = active ? firstFarmEnteredAt + NEWBIE_WINDOW_MS : null;
  const now = useNow(active);
  const remaining = endsAt ? endsAt - now : 0;
  const futureStart = active && firstFarmEnteredAt > now;
  const inWindow = endsAt !== null && !futureStart && remaining > 0;
  return (
    <section aria-label="新手七日六倍活動" style={{ display: "grid", gap: 0 }}>
      <div style={{ position: "relative" }}>
      <img
        src={`${import.meta.env.BASE_URL ?? "/"}images/farm/newcomer-6x-panel.png`}
        alt="新手六倍活動正式公告橫幅"
        style={{ display: "block", width: "100%", maxHeight: "calc(100dvh - 32px)", objectFit: "contain", height: "auto", borderRadius: 10 }}
      />
      {onClose && <button type="button" aria-label="關閉新手六倍公告" onClick={onClose}
        style={{ position: "absolute", right: "1%", top: "1%", width: "8%", height: "12%", background: "transparent", border: 0, cursor: "pointer" }} />}
      <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "85%", width: "29%", height: "6%", display: "grid", placeItems: "center", color: "#fff1c2", fontSize: "clamp(9px, 2.1vw, 15px)", fontWeight: 700 }}>
        {!active || futureStart ? "資格待確認" : inWindow ? formatRemaining(remaining) : "活動已結束"}
      </span>
      </div>
      {!active && <p role="status">尚未取得首次進入福田的有效時間，無法判定六倍活動資格或顯示倒數；請重新讀取農田資料。</p>}

    </section>
  );
}
