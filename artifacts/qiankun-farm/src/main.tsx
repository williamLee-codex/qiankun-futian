import { createRoot } from "react-dom/client";
import { FarmV2AuthenticatedView } from "./game/v2/FarmV2AuthenticatedView";
import "./index.css";

// The platform issues a short-lived launch token in the redirect URL.
// It is only a credential candidate: every Farm V2 request must be validated
// by the API server against the platform before any state is returned.
const params = new URLSearchParams(window.location.search);
const launchToken = params.get("launchToken")?.trim() ?? "";
const configuredApiBase = import.meta.env.VITE_FARM_API_BASE_URL?.trim() ?? "";
// A trusted build-time relative path supports the main site's same-origin proxy.
const apiBaseUrl = configuredApiBase
  ? new URL(configuredApiBase, window.location.origin).toString()
  : "";

// Remove the credential from the address bar and browser history immediately.
// Never persist it to localStorage or log it.
if (params.has("launchToken")) {
  params.delete("launchToken");
  const remaining = params.toString();
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname +
      (remaining ? "?" + remaining : "") +
      window.location.hash,
  );
}

const root = createRoot(document.getElementById("root")!);
if (launchToken && apiBaseUrl) {
  root.render(
    <FarmV2AuthenticatedView
      apiBaseUrl={apiBaseUrl}
      launchToken={launchToken}
    />,
  );
} else if (import.meta.env.DEV && !launchToken) {
  // Legacy demo is permitted only for local development, never production.
  void import("./App").then(({ default: App }) => root.render(<App />));
} else {
  root.render(
    <main
      role="alert"
      style={{
        minHeight: "100dvh", boxSizing: "border-box", padding: 24,
        display: "grid", placeItems: "center", background: "#0b1020",
        color: "#f8fafc", fontFamily: "system-ui, sans-serif",
        fontSize: 20, lineHeight: 1.6,
      }}
    >
      <section style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 28, marginBottom: 16 }}>
          {!launchToken ? "請重新進入乾坤福田" : "農田連線設定未完成"}
        </h1>
        <p>
          {!launchToken
            ? "目前頁面缺少平台啟動授權。直接開啟或重新整理農田網址後，請從平台入口重新進入。"
            : "目前缺少農場 API 連線設定，暫時無法載入農田。"}
        </p>
        <a
          href="/api/apps/qiankun-futian/launch?farmV2=1"
          style={{
            display: "inline-block", marginTop: 24, padding: "12px 20px",
            color: "#fff", background: "#244a3b", border: "1px solid #cfb36b",
            borderRadius: 8, textDecoration: "underline", fontWeight: 600,
          }}
        >
          重新進入農田
        </a>
      </section>
    </main>,
  );
}
