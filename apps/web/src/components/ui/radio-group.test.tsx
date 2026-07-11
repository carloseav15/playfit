import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RadioGroup, RadioItem } from "./radio-group";

const options = [
  { value: "playing", label: "Playing" },
  { value: "hold", label: "On hold" },
  { value: "done", label: "Completed" },
];

function ControlledRadioGroup({ onValueChange }: { onValueChange?: (value: string) => void }) {
  const [value, setValue] = useState("playing");
  return (
    <RadioGroup
      aria-label="Status"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    >
      {options.map((opt) => (
        <RadioItem key={opt.value} value={opt.value} label={opt.label} />
      ))}
    </RadioGroup>
  );
}

describe("RadioGroup", () => {
  it("renders role=radiogroup with each item as role=radio", () => {
    render(<ControlledRadioGroup />);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("has exactly one item checked, matching the controlled value", () => {
    render(<ControlledRadioGroup />);
    const checked = screen
      .getAllByRole("radio")
      .filter((el) => el.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAccessibleName("Playing");
  });

  it("moves selection with ArrowDown and calls onValueChange", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ControlledRadioGroup onValueChange={onValueChange} />);

    await user.click(screen.getByRole("radio", { name: "Playing" }));
    // Radix only selects the newly-focused item while the arrow key is still held down
    // (it tracks this via a document-level keydown/keyup listener), so the key-up half
    // of the default `{ArrowDown}` shorthand fires too fast for that window in this
    // environment; hold the key explicitly instead.
    await user.keyboard("{ArrowDown>}{/ArrowDown}");

    expect(onValueChange).toHaveBeenCalledWith("hold");
    expect(screen.getByRole("radio", { name: "On hold" })).toHaveAttribute("aria-checked", "true");
  });

  it("selects an item on click", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ControlledRadioGroup onValueChange={onValueChange} />);

    await user.click(screen.getByRole("radio", { name: "Completed" }));

    expect(onValueChange).toHaveBeenCalledWith("done");
  });
});
