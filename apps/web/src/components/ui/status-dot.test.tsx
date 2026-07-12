import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusDot } from "./status-dot";

describe("StatusDot", () => {
  it("exposes its label as an accessible status", () => {
    render(<StatusDot label="Sync complete" tone="positive" />);

    expect(screen.getByRole("status", { name: "Sync complete" })).toHaveClass("bg-positive");
  });
});
