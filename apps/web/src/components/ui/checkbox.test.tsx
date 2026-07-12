import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("associates its label with the checkbox input", () => {
    render(<Checkbox id="notifications" label="Email notifications" />);

    expect(screen.getByRole("checkbox", { name: "Email notifications" })).not.toBeChecked();
  });

  it("changes its checked state when clicked", async () => {
    const user = userEvent.setup();
    render(<Checkbox id="updates" label="Product updates" />);

    const checkbox = screen.getByRole("checkbox", { name: "Product updates" });
    await user.click(checkbox);

    expect(checkbox).toBeChecked();
  });

  it("does not change state when disabled", async () => {
    const user = userEvent.setup();
    render(<Checkbox disabled id="disabled" label="Disabled setting" />);

    const checkbox = screen.getByRole("checkbox", { name: "Disabled setting" });
    await user.click(checkbox);

    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
  });
});
