import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// The platform issues a short-lived launch token in the redirect URL.
// It is only a credential candidate: every Farm V2 request must be validated
// by the API server against the platform before any state is returned.
const params = new URLSearchParams(window.location.search);
const launchToken = params.get("launchToken")?.trim() ?? "";
const apiBaseUrl = import.meta.env.VITE_FARM_API_BASE_URL?.trim() ?? "";

// Remove the credential from the address bar and browser history immediately.
// Never persist it to localStorage or log it.
if (params.has("launchToken")) {
  params.delete("launchToken");
  const remaining = params.toString();
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + (remaining ? "?" + remaining : "") + window.location.hash,
  );
}

const root = createRoot(document.getElementById("root")!);
if (launchToken && apiBaseUrl) {
  root.render(<App farmV2Session={{ apiBaseUrl, launchToken }} />);
} else if (import.meta.env.DEV && !launchToken) {
  // Legacy demo is permitted only for local development, never production.
  root.render(<App />);
} else {
  root.render(
    <main role="alert">
      <h1>乾坤福田暫時無法啟動</h1>
      <p>缺少正式平台授權或農場 API 設定。請由御策羅盤重新進入。</p>
    </main>,
  );
}
