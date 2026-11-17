import { describe, expect, it } from "vitest";
import { format12Hour, to24Hour } from "../time.js";

describe("to24Hour", () => {
  it.each([
    [12, 0, "AM", "00:00"],
    [12, 30, "PM", "12:30"],
    [1, 5, "AM", "01:05"],
    [11, 59, "PM", "23:59"],
  ])("converts %s:%s %s to %s", (hour, minute, meridiem, expected) => {
    expect(to24Hour(hour, minute, meridiem)).toBe(expected);
  });

  it("requires an explicit valid AM/PM choice", () => {
    expect(() => to24Hour(4, 43)).toThrow();
    expect(() => to24Hour(4, 43, "")).toThrow();
    expect(() => to24Hour(13, 0, "PM")).toThrow();
    expect(() => to24Hour(4, 60, "PM")).toThrow();
  });
});

describe("format12Hour", () => {
  it("formats HH:mm without guessing", () => {
    expect(format12Hour("16:43")).toBe("4:43 PM");
    expect(format12Hour("00:00")).toBe("12:00 AM");
  });

  it("rejects invalid 24-hour values", () => {
    expect(() => format12Hour("24:00")).toThrow();
    expect(() => format12Hour("4:43 PM")).toThrow();
  });
});
