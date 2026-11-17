import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLookupText } from "./lookups.js";

test("normalizeLookupText trims, lowercases, and collapses spaces", () => {
  assert.equal(
    normalizeLookupText("  Purchase   REQUEST  "),
    "purchase request",
  );
  assert.equal(normalizeLookupText("\tMDRRMO\n"), "mdrrmo");
  assert.equal(normalizeLookupText(""), "");
});
