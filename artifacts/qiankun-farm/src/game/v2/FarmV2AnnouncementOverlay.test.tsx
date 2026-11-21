// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { FarmV2AnnouncementOverlay } from "./FarmV2AnnouncementOverlay";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const notice = {
  id: "notice-1", title: "福田公告", content: "公告內容 https://example.com/event。",
  category: "GENERAL", allowHideToday: true, allowDismissForever: true,
};
function mockFetch(authenticated: boolean, receipts = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/announcements/active")) {
      return { ok: true, json: async () => ({ authenticated, announcements: [notice], receipts }) };
    }
    if (url.includes("/api/announcements/receipts") && init?.method === "POST") {
      return { ok: true };
    }
    throw new Error("Unexpected request: " + url);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
it("does not show an authenticated farm announcement when platform auth is absent", async () => {
  const fetchMock = mockFetch(false);
  render(<FarmV2AnnouncementOverlay />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("displays a farm notice as an overlay and persists dismissal without navigation", async () => {
  const fetchMock = mockFetch(true, {
    "notice-1": { firstSeenAt: "2026-11-21T00:00:00Z", hideTodayUntil: null, dismissedPermanently: false },
  });
  render(<FarmV2AnnouncementOverlay />);
  expect(await screen.findByRole("dialog")).toBeTruthy();
  const link = screen.getByRole("link", { name: "https://example.com/event" });
  expect(link.getAttribute("href")).toBe("https://example.com/event");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  fireEvent.click(screen.getByLabelText("今日不再出現"));
  fireEvent.click(screen.getByRole("button", { name: "關閉" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(fetchMock).toHaveBeenCalledWith("/api/announcements/receipts", expect.objectContaining({
    method: "POST", body: JSON.stringify({ announcementId: "notice-1", action: "TODAY", target: "FARM_V2" }),
  }));
});
it("respects a permanent server dismissal after reload", async () => {
  mockFetch(true, {
    "notice-1": { firstSeenAt: "2026-11-21T00:00:00Z", hideTodayUntil: null, dismissedPermanently: true },
  });
  render(<FarmV2AnnouncementOverlay />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.queryByRole("dialog")).toBeNull();
});
