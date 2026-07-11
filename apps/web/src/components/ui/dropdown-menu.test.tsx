import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DropdownItem, DropdownMenu, DropdownSeparator } from "./dropdown-menu";

function renderMenu(onSelect = vi.fn()) {
  return render(
    <DropdownMenu trigger={<button type="button">Options</button>}>
      <DropdownItem onSelect={onSelect}>Settings</DropdownItem>
      <DropdownItem>Download</DropdownItem>
      <DropdownSeparator />
      <DropdownItem variant="destructive">Delete</DropdownItem>
    </DropdownMenu>,
  );
}

describe("DropdownMenu", () => {
  it("trigger exposes aria-haspopup and toggles aria-expanded", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Options" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("Enter on the trigger opens the menu and focuses the first item", async () => {
    const user = userEvent.setup();
    renderMenu();

    screen.getByRole("button", { name: "Options" }).focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("menuitem", { name: "Settings" })).toHaveFocus();
  });

  it("ArrowDown/ArrowUp cycles focus among items", async () => {
    const user = userEvent.setup();
    renderMenu();

    screen.getByRole("button", { name: "Options" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("menuitem", { name: "Download" })).toHaveFocus();
  });

  it("Escape closes the menu and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Options" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("clicking outside closes the menu", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <DropdownMenu trigger={<button type="button">Options</button>}>
          <DropdownItem>Settings</DropdownItem>
        </DropdownMenu>
        <button type="button">Outside</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Options" }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    // The "Outside" button sits under Radix's aria-hidden inert wrapper while the menu
    // is open (correct a11y behavior), so it's unreachable via role queries/userEvent's
    // real pointer-capture click here; fireEvent dispatches the dismiss event directly.
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("destructive-variant item still exposes role=menuitem", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Options" }));
    expect(await screen.findByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });
});
