import assert from "node:assert/strict";
import test from "node:test";
import {
  LOGBOOK_TYPES,
  resolveFields,
  validateFieldRules,
} from "./logbookTypes.js";

test("permit field rules default office to required and other configurable fields to optional", () => {
  const fields = resolveFields("permit_certification");
  assert.equal(fields.find(({ key }) => key === "officeId").required, true);
  for (const key of [
    "amountCentavos",
    "documentNumber",
    "counterparty",
    "tracking",
    "routingNote",
  ]) {
    assert.equal(fields.find((field) => field.key === key).required, false);
  }
});

test("permit document rules hide fields and override required modes", () => {
  const fields = resolveFields("permit_certification", {
    fieldRules: { officeId: "hidden", amountCentavos: "required" },
  });
  assert.equal(
    fields.some(({ key }) => key === "officeId"),
    false,
  );
  assert.equal(
    fields.find(({ key }) => key === "amountCentavos").required,
    true,
  );
});

test("other logbook types ignore document field rules", () => {
  assert.equal(
    resolveFields("check", { fieldRules: { amountCentavos: "hidden" } }),
    LOGBOOK_TYPES.check.fields,
  );
});

test("field rules reject unknown fields, invalid modes, and non-permit rules", () => {
  assert.deepEqual(validateFieldRules("permit_certification", {}), []);
  assert.equal(
    validateFieldRules("permit_certification", { amountCentavos: "sometimes" })
      .length,
    1,
  );
  assert.equal(
    validateFieldRules("permit_certification", { particulars: "hidden" })
      .length,
    1,
  );
  assert.equal(
    validateFieldRules("check", { amountCentavos: "hidden" }).length,
    1,
  );
});
