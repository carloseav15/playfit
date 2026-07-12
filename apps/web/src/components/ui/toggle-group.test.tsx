import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToggleButton, ToggleGroup } from "./toggle-group";

describe("ToggleGroup", () => {
  it("renders its buttons with pressed state and visual variants", () => {
    render(
      <ToggleGroup className="settings-controls">
        <ToggleButton active>Enabled</ToggleButton>
        <ToggleButton size="default">Disabled</ToggleButton>
      </ToggleGroup>,
    );

    expect(screen.getByRole("button", { name: "Enabled" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Enabled" })).toHaveClass("bg-accent", "h-9");
    expect(screen.getByRole("button", { name: "Disabled" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Disabled" })).toHaveClass("bg-secondary", "h-11");
    expect(screen.getByRole("button", { name: "Enabled" }).parentElement).toHaveClass(
      "settings-controls",
    );
  });

  it("forwards button interactions", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ToggleButton onClick={onClick}>Toggle setting</ToggleButton>);

    await user.click(screen.getByRole("button", { name: "Toggle setting" }));

    expect(onClick).toHaveBeenCalledOnce();
  });
});
