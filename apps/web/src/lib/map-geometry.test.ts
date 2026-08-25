import { describe, expect, it } from "vitest";
import { getQuadrantName } from "./map-geometry";

describe("getQuadrantName", () => {
  it("matches the four corner labels drawn on the affinity map", () => {
    expect(getQuadrantName(10, 10)).toBe("Complex & Systems");
    expect(getQuadrantName(-10, 10)).toBe("Chill & Open World");
    expect(getQuadrantName(-10, -10)).toBe("Cozy & Story-Rich");
    expect(getQuadrantName(10, -10)).toBe("Demanding & Linear");
  });

  it("treats the origin and axis lines as the positive-leaning quadrant", () => {
    expect(getQuadrantName(0, 0)).toBe("Complex & Systems");
    expect(getQuadrantName(0, -10)).toBe("Demanding & Linear");
    expect(getQuadrantName(-10, 0)).toBe("Chill & Open World");
  });
});
