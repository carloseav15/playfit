import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stack } from "./stack";

describe("Stack", () => {
  it("maps every alignment option to a static Tailwind class", () => {
    const alignments = {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      stretch: "items-stretch",
      baseline: "items-baseline",
    } as const;

    for (const [align, expectedClass] of Object.entries(alignments)) {
      const { unmount, container } = render(<Stack align={align as keyof typeof alignments} />);
      expect(container.firstChild).toHaveClass(expectedClass);
      unmount();
    }
  });

  it("maps every justification option to a static Tailwind class", () => {
    const justifications = {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
      between: "justify-between",
      around: "justify-around",
      evenly: "justify-evenly",
    } as const;

    for (const [justify, expectedClass] of Object.entries(justifications)) {
      const { unmount, container } = render(
        <Stack justify={justify as keyof typeof justifications} />,
      );
      expect(container.firstChild).toHaveClass(expectedClass);
      unmount();
    }
  });
});
