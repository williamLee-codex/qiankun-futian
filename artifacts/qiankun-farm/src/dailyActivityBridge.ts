import type { DailyActivityBridge, DailyActivitySnapshot } from "./components/DailyActivityDialog";

const BASE = "/api/farm-backend/farm/v2/daily-activity";

/**
 * Browser calls only the same-origin Farm proxy. The platform validates the
 * HttpOnly Farm session cookie and resolves the user on the server.
 * No shared secret, launch token, user ID or award quantity in browser code.
 */
async function requestDailyActivity(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(BASE + path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) throw new Error("DAILY_ACTIVITY_REQUEST_FAILED");
  return response.json();
}

function isSnapshot(value: unknown): value is DailyActivitySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  return typeof s.initialized === "boolean" &&
    typeof s.activityDay === "string" &&
    Array.isArray(s.assignedTaskIds) && s.assignedTaskIds.every(v => typeof v === "string") &&
    Array.isArray(s.completedTaskIds) && s.completedTaskIds.every(v => typeof v === "string") &&
    typeof s.points === "number" && Number.isInteger(s.points) && s.points >= 0 && s.points <= 120 &&
    Array.isArray(s.claimedMilestones) && s.claimedMilestones.every(v => typeof v === "number") &&
    Array.isArray(s.claimableMilestones) && s.claimableMilestones.every(v => typeof v === "number");
}

export const dailyActivityBridge: DailyActivityBridge = {
  async load() {
    const data = await requestDailyActivity("");
    if (!isSnapshot(data)) throw new Error("INVALID_DAILY_ACTIVITY_RESPONSE");
    return data;
  },
  async claim(milestone) {
    if (milestone !== 30 && milestone !== 60 && milestone !== 100) throw new Error("DAILY_REWARD_NOT_AVAILABLE");
    const data = await requestDailyActivity(milestone === 30 ? "/claim" : "/item-claim", {
      method: "POST",
      body: JSON.stringify({ milestone }),
    });
    if (!data || typeof data !== "object" || Array.isArray(data) ||
        typeof (data as { status?: unknown }).status !== "string")
      throw new Error("INVALID_DAILY_CLAIM_RESPONSE");
    return data as { status: string };
  },
};
