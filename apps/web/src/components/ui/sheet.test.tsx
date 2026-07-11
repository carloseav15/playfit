import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./sheet";

function renderHarness(open: boolean, onClose = vi.fn()) {
  return render(
    <div>
      <button type="button">Outside trigger</button>
      <Sheet open={open} onClose={onClose} title="Filters">
        <button type="button">Inside content</button>
      </Sheet>
    </div>,
  );
}

describe("Sheet", () => {
  it("renders nothing when closed", () => {
    renderHarness(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders role=dialog with aria-modal=true when open", () => {
    renderHarness(true);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("traps Tab focus within the sheet", async () => {
    const user = userEvent.setup();
    renderHarness(true);

    // Radix auto-focuses the first focusable element in the content on open.
    expect(await screen.findByRole("button", { name: "Close" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Inside content" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("calls onClose on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderHarness(true, onClose);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when clicking the overlay (outside the panel)", async () => {
    const onClose = vi.fn();
    renderHarness(true, onClose);
    await screen.findByRole("dialog");

    // Radix sets `pointer-events: none` on <body> while a modal is open, which blocks
    // userEvent's real pointer-capture click; fireEvent dispatches the event directly.
    // Dialog.Content also defers the outside-pointerdown dismiss until a following click
    // (to avoid closing on drag-to-select), so both events are needed here.
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("restores focus to the previously focused element on close", async () => {
    // Sheet has no <Dialog.Trigger> in its tree (same flat `open`/`onClose` API as
    // Dialog) — Radix's modal Content only restores focus to a registered Trigger by
    // default, so this component tracks the previously-focused element itself and
    // restores it via `onCloseAutoFocus`, exactly like the pre-Radix implementation did.
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Open sheet
          </button>
          <Sheet open={open} onClose={() => setOpen(false)} title="Filters">
            <button type="button">Inside content</button>
          </Sheet>
        </div>
      );
    }

    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open sheet" });
    await user.click(trigger);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
