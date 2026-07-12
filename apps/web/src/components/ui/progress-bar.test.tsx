import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./progress-bar";

describe("ProgressBar", () => {
  it("exposes its value and bounds to assistive technology", () => {
    render(<ProgressBar label="Profile setup" max={5} min={1} value={3} />);

    const progressbar = screen.getByRole("progressbar", { name: "Profile setup" });
    expect(progressbar).toHaveAttribute("aria-valuenow", "3");
    expect(progressbar).toHaveAttribute("aria-valuemin", "1");
    expect(progressbar).toHaveAttribute("aria-valuemax", "5");
  });

  it("passes custom classes to the visual progress bar", () => {
    const { container } = render(<ProgressBar barClassName="bg-positive" value={150} />);

    expect(container.querySelector(".bg-positive")).toBeInTheDocument();
  });
});
