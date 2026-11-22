import { useEffect, useRef, useState } from "react";

type Notice = {
  id: string;
  title: string;
  content: string;
  category: string;
  imageUrl?: string | null;
  actionUrl?: string | null;
  allowHideToday: boolean;
  allowDismissForever: boolean;
};
type Receipt = {
  firstSeenAt: string;
  hideTodayUntil: string | null;
  dismissedPermanently: boolean;
};
type ResponseData = {
  announcements: Notice[];
  receipts: Record<string, Receipt>;
  authenticated: boolean;
};
const TARGET = "FARM_V2";

function linkedContent(content: string) {
  return content.split(/(https:\/\/[^\s<>，。！？、；：]+)/g).map((part, index) => {
    if (!/^https:\/\//i.test(part)) return part;
    const match = part.match(/^(.*?)([.,!?，。！？、；;：:]*)$/);
    const href = match?.[1] ?? part;
    const trailing = match?.[2] ?? "";
    try {
      const url = new URL(href);
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return part;
      return <span key={index}><a href={url.href} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere", textDecoration: "underline" }}>{href}</a>{trailing}</span>;
    } catch { return part; }
  });
}



/** Only mounted by the authenticated Farm V2 entry. No navigation or scene mutations. */
export function FarmV2AnnouncementOverlay() {
  const [items, setItems] = useState<Notice[]>([]);
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  const [authenticated, setAuthenticated] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hideToday, setHideToday] = useState(false);
  const [hideForever, setHideForever] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const firstSeenAttempted = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/announcements/active?target=" + TARGET, {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("ANNOUNCEMENTS_UNAVAILABLE");
      return response.json() as Promise<ResponseData>;
    }).then((data) => {
      if (controller.signal.aborted) return;
      // Authenticated Farm V2 must never downgrade to anonymous receipts.
      // If platform cookies are unavailable, keep the farm playable and show no notices.
      if (!data.authenticated) return;
      setAuthenticated(true);
      setReceipts(data.receipts ?? {});
      setItems(data.announcements);
    }).catch(() => {
      // The farm must remain usable if the announcement service is unavailable.
    });
    return () => controller.abort();
  }, []);

  const now = Date.now();
  const current = items.find((item) => {
    if (hidden.includes(item.id)) return false;
    const receipt = receipts[item.id];
    if (!receipt) return true;
    if (receipt.dismissedPermanently) return false;
    if (receipt.hideTodayUntil && Date.parse(receipt.hideTodayUntil) > now) return false;
    return true;
  });

  // Start the first-view clock when shown, not when closed.
  const currentId = current?.id;
  useEffect(() => {
    if (!currentId || receipts[currentId]?.firstSeenAt ||
        firstSeenAttempted.current.has(currentId)) return;
    firstSeenAttempted.current.add(currentId);
    if (authenticated) {
      void fetch("/api/announcements/receipts", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ announcementId: currentId, action: "SEEN", target: TARGET }),
      }).then((response) => {
        if (!response.ok) firstSeenAttempted.current.delete(currentId);
      }).catch(() => firstSeenAttempted.current.delete(currentId));
    }
  }, [currentId, authenticated, receipts]);

  if (!current) return null;

  async function close() {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    const action = hideForever && current.allowDismissForever ? "FOREVER" :
      hideToday && current.allowHideToday ? "TODAY" : "SEEN";
    try {
      if (authenticated) {
        const response = await fetch("/api/announcements/receipts", {
          method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ announcementId: current.id, action, target: TARGET }),
        });
        if (!response.ok) throw new Error("RECEIPT_FAILED");
      }
      setHidden((previous) => [...previous, current.id]);
      setHideToday(false);
      setHideForever(false);
    } catch {
      setError("公告閱讀紀錄儲存失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="presentation" style={{
      position: "fixed", inset: 0, zIndex: 2147483000,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, background: "rgba(0,0,0,.72)",
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="farm-announcement-title" style={{
        boxSizing: "border-box", width: "100%", maxWidth: 560, maxHeight: "90vh",
        overflowY: "auto", padding: 24, borderRadius: 16, background: "#fff", color: "#172033",
      }}>
        <p>{current.category}</p>
        {current.imageUrl ? <img src={current.imageUrl} alt="" style={{ width: "100%", maxHeight: 280, objectFit: "contain" }} /> : null}
        <h2 id="farm-announcement-title">{current.title}</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{linkedContent(current.content)}</p>
        {current.actionUrl && (/^\/(?!\/)/.test(current.actionUrl) || /^https:\/\//i.test(current.actionUrl)) ?
          <a href={current.actionUrl} target="_blank" rel="noopener noreferrer">查看詳情</a> : null}
        {current.allowHideToday ? <label style={{ display: "block" }}>
          <input type="checkbox" checked={hideToday} onChange={(event) => {
            setHideToday(event.target.checked); if (event.target.checked) setHideForever(false);
          }} /> 今日不再出現
        </label> : null}
        {current.allowDismissForever ? <label style={{ display: "block" }}>
          <input type="checkbox" checked={hideForever} onChange={(event) => {
            setHideForever(event.target.checked); if (event.target.checked) setHideToday(false);
          }} /> 不再出現此公告
        </label> : null}
        {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
        <button type="button" disabled={busy} onClick={() => void close()} style={{
          marginTop: 16, padding: "8px 20px", borderRadius: 8, background: "#172033", color: "#fff",
        }}>{busy ? "儲存中…" : "關閉"}</button>
      </section>
    </div>
  );
}
