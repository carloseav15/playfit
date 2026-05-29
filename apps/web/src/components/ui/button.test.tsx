import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders a shadcn-style button primitive", () => {
    render(<Button>Open Playfit</Button>);
    expect(screen.getByRole("button", { name: "Open Playfit" })).toBeInTheDocument();
  });
});
