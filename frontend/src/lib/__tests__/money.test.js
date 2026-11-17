import { describe, expect, it } from "vitest";
import { formatPesos, parsePesos } from "../money.js";

describe("parsePesos", () => {
  it.each([
    ["1,250.50", 125050],
    ["1250.50", 125050],
    ["1,250.5", 125050],
    ["1.1", 110],
    ["0", 0],
  ])("parses %s as %i centavos", (input, expected) => {
    expect(parsePesos(input)).toBe(expected);
  });

  it("returns undefined for empty input", () => {
    expect(parsePesos("")).toBeUndefined();
    expect(parsePesos("   ")).toBeUndefined();
    expect(parsePesos(undefined)).toBeUndefined();
  });

  it.each(["-1", "-1.00", "1.001", "8,576,304.000.00", "1,25.00", "1,000,00"])(
    "rejects malformed or unsupported input %s",
    (input) => {
      expect(() => parsePesos(input)).toThrow();
    },
  );

  it("rejects non-text input and unsafe integer amounts", () => {
    expect(() => parsePesos(1.1)).toThrow("entered as text");
    expect(() => parsePesos("999999999999999999999999")).toThrow("too large");
  });
});

describe("formatPesos", () => {
  it("formats integer centavos as en-PH PHP currency", () => {
    expect(formatPesos(125050)).toBe("₱1,250.50");
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid centavos %s",
    (amount) => {
      expect(() => formatPesos(amount)).toThrow();
    },
  );
});
