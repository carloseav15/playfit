import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Container } from "./container";

describe("Container", () => {
  it("renders the requested element with its size and custom classes", () => {
    const { container } = render(
      <Container as="main" className="page-content" data-testid="content" size="sm" />,
    );

    const element = container.querySelector("main");
    expect(element).toHaveAttribute("data-testid", "content");
    expect(element).toHaveClass("mx-auto", "w-full", "px-4", "max-w-3xl", "page-content");
  });

  it("uses the large size by default", () => {
    const { container } = render(<Container />);

    expect(container.firstChild).toHaveClass("max-w-[80rem]");
  });
});
