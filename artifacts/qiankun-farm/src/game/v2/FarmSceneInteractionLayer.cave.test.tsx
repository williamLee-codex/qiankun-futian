// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FarmSceneInteractionLayer } from "./FarmSceneInteractionLayer";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
for (const desktop of [true, false]) {
  it(`restores six cave controls and returns to the farm (${desktop ? "desktop" : "mobile"})`, () => {
    vi.stubGlobal("matchMedia", () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }));
    const onSection = vi.fn();
    render(<FarmSceneInteractionLayer plots={[]} state={{ pots: [], decor: [{ catalogId: "DF001", slot: 1 }], activeFormation: null }} ownerLabel="我的福田" busy={false} onSection={onSection} />);
    fireEvent.click(screen.getByRole("button", { name: "進入洞府" }));
    expect(screen.getByAltText(/洞府內景/)).toBeTruthy();
    const slots = screen.getAllByRole("button", { name: /洞府陳設位/ });
    expect(slots).toHaveLength(6);
    expect(slots[0].textContent).toContain("青石蒲團");
    fireEvent.click(slots[0]);
    expect(onSection).toHaveBeenCalledWith("洞府");
    fireEvent.click(screen.getByRole("button", { name: "返回農場" }));
    expect(screen.queryByAltText(/洞府內景/)).toBeNull();
    expect(screen.getByRole("button", { name: "進入洞府" })).toBeTruthy();
  });
}
it("keeps cave display read-only for visitors", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const onSection = vi.fn();
  render(<FarmSceneInteractionLayer plots={[]} state={{ pots: [], decor: [], activeFormation: null }} ownerLabel="好友" busy={false} readOnly onSection={onSection} />);
  fireEvent.click(screen.getByRole("button", { name: "進入洞府" }));
  for (const slot of screen.getAllByRole("button", { name: /洞府陳設位/ })) {
    expect((slot as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(slot);
  }
  expect(onSection).not.toHaveBeenCalled();
});
