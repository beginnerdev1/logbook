import { describe, expect, it } from "vitest";
import { compareDateOnly, formatDateOnly, todayDateOnly } from "../dateOnly.js";

describe("todayDateOnly", () => {
  it("returns the local current date as a YYYY-MM-DD string", () => {
    expect(todayDateOnly()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatDateOnly", () => {
  it("formats by the calendar components in the string", () => {
    expect(formatDateOnly("2026-07-02")).toBe("Jul 2, 2026");
    expect(formatDateOnly("2024-02-29")).toBe("Feb 29, 2024");
  });

  it.each(["2026-2-02", "13-10-2026", "2026-02-29", "2026-00-10"])(
    "rejects invalid date-only value %s",
    (value) => {
      expect(() => formatDateOnly(value)).toThrow();
    },
  );
});

describe("compareDateOnly", () => {
  it("compares valid YYYY-MM-DD strings chronologically", () => {
    expect(compareDateOnly("2026-07-02", "2026-07-03")).toBe(-1);
    expect(compareDateOnly("2026-07-03", "2026-07-02")).toBe(1);
    expect(compareDateOnly("2026-07-02", "2026-07-02")).toBe(0);
  });

  it("rejects invalid date-only input", () => {
    expect(() => compareDateOnly("2026-02-30", "2026-03-01")).toThrow();
  });
});
