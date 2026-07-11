import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./dialog";

function renderHarness(open: boolean, onClose = vi.fn()) {
  return render(
    <div>
      <button type="button">Outside trigger</button>
      <Dialog open={open} onClose={onClose} title="Update pick" eyebrow="Picks">
        <button type="button">Inside content</button>
      </Dialog>
    </div>,
  );
}

describe("Dialog", () => {
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

  it("renders title/eyebrow and labels the dialog via aria-labelledby", () => {
    renderHarness(true);
    expect(screen.getByText("Picks")).toBeInTheDocument();
    const title = screen.getByRole("heading", { name: "Update pick" });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", title.id);
  });

  it("traps Tab focus within the dialog", async () => {
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

  it("calls onClose when clicking the overlay (outside the content)", async () => {
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
    // Dialog has no <Dialog.Trigger> in its tree (the flat `open`/`onClose` API keeps the
    // open-trigger outside Radix's control, per the migration's decision to avoid touching
    // the 5 production call sites) — Radix's modal Content only restores focus to a
    // registered Trigger by default, so this component tracks the previously-focused
    // element itself and restores it via `onCloseAutoFocus`, exactly like the pre-Radix
    // implementation did.
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Open dialog
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Update pick">
            <button type="button">Inside content</button>
          </Dialog>
        </div>
      );
    }

    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open dialog" });
    await user.click(trigger);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("focuses the target of a custom onOpenAutoFocus handler instead of Radix's default", async () => {
    function Harness() {
      const inputRef = { current: null as HTMLInputElement | null };
      return (
        <Dialog
          open
          onClose={vi.fn()}
          title="Search"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <input
            ref={(el) => {
              inputRef.current = el;
            }}
            placeholder="Search games"
          />
        </Dialog>
      );
    }

    render(<Harness />);

    expect(await screen.findByPlaceholderText("Search games")).toHaveFocus();
  });
});
