// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { afterEach } from "vitest";

afterEach(cleanup);
import { cleanup, render, screen } from "@testing-library/react";
import { FarmResourceShortfallDialog } from "./FarmResourceShortfallDialog";

describe("FarmResourceShortfallDialog", () => {
  it("states the exact shortfall and offers both ways out", () => {
    render(
      <FarmResourceShortfallDialog kind="material" required={9} available={4} onShop={vi.fn()} onBack={vi.fn()} />,
    );
    expect(screen.getByRole("dialog", { name: "合成材料不足" })).toBeTruthy();
    expect(screen.getByText(/還缺 5/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "前往購買合成材料" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "返回" })).toBeTruthy();
  });

  it("offers only the way back when the resource cannot be bought", () => {
    render(<FarmResourceShortfallDialog kind="seed" required={9} available={4} onBack={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /前往購買/ })).toBeNull();
    expect(screen.getByRole("button", { name: "返回" })).toBeTruthy();
  });

  it("renders nothing when the player can pay", () => {
    const { container } = render(
      <FarmResourceShortfallDialog kind="crystal" required={3} available={3} onBack={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
