import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip, TooltipProvider } from "./tooltip";

function renderTooltip() {
  return render(
    <TooltipProvider delayDuration={0}>
      <Tooltip content="Save this game">
        <button type="button">Save</button>
      </Tooltip>
    </TooltipProvider>,
  );
}

describe("Tooltip", () => {
  it("is not in the accessibility tree before the trigger is focused", () => {
    renderTooltip();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows content with role=tooltip when the trigger receives keyboard focus", async () => {
    const user = userEvent.setup();
    renderTooltip();

    await user.tab();

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Save this game");
  });

  it("renders the trigger as the only focusable element (no wrapping interactive span)", () => {
    const { container } = renderTooltip();

    const focusable = container.querySelectorAll(
      'button, [role="button"], [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(1);
    expect(focusable[0]?.tagName).toBe("BUTTON");
  });

  it("dismisses on Escape", async () => {
    const user = userEvent.setup();
    renderTooltip();

    await user.tab();
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
