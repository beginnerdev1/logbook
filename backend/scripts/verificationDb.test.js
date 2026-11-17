import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedVerificationDatabase } from "./verificationDb.js";

test("verification is restricted to the logbook_test database", () => {
  assert.equal(isAllowedVerificationDatabase("logbook_test"), true);
  assert.equal(isAllowedVerificationDatabase("staging_test"), false);
  assert.equal(isAllowedVerificationDatabase("logbook"), false);
});
