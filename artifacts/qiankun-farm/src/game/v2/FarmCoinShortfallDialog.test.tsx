// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FarmCoinShortfallDialog } from "./FarmCoinShortfallDialog";

const pending = { itemId: "seed:1", quantity: 3, label: "種子" };

describe("FarmCoinShortfallDialog", () => {
  it("offers a conversion for the exact shortfall and keeps the pending operation", () => {
    const onConvert = vi.fn();
    render(
      <FarmCoinShortfallDialog
        paying="central"
        required={300}
        payingBalance={100}
        otherBalance={900}
        pending={pending}
        onConvert={onConvert}
        onCancel={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog").dataset.pendingQuantity).toBe("3");
    screen.getByRole("button", { name: "轉換金幣" }).click();
    expect(onConvert).toHaveBeenCalledWith("farm", "central", 200);
  });

  it("offers only the way back when both wallets are short", () => {
    render(
      <FarmCoinShortfallDialog
        paying="farm"
        required={50}
        payingBalance={10}
        otherBalance={10}
        pending={pending}
        onConvert={vi.fn()}
        onCancel={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "轉換金幣" })).toBeNull();
    expect(screen.getByRole("button", { name: "返回" })).toBeTruthy();
  });

  it("renders nothing when the wallet can already pay", () => {
    const { container } = render(
      <FarmCoinShortfallDialog
        paying="farm"
        required={5}
        payingBalance={5}
        otherBalance={0}
        pending={pending}
        onConvert={vi.fn()}
        onCancel={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
