import { createRoot } from "react-dom/client";
import App from "./App";
import { dailyActivityBridge } from "./dailyActivityBridge";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App dailyActivityBridge={dailyActivityBridge} />);
