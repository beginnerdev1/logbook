import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDraftInput,
  parseFullEntry,
  parsePatchInput,
} from "./entryValidation.js";

const officeId = "0123456789abcdef01234567";

function captureValidation(action) {
  try {
    action();
  } catch (error) {
    assert.equal(error.status, 400);
    assert.equal(error.code, "VALIDATION_ERROR");
    return error;
  }
  assert.fail("Expected validation to fail.");
}

test("draft input requires only logbook type, date, name, and office", () => {
  const draft = parseDraftInput({
    logbookType: "check",
    entryDate: "2026-02-28",
    name: "  Check payee  ",
    officeId,
    particulars: "  ",
  });
  assert.equal(draft.name, "Check payee");
  assert.equal(draft.particulars, undefined);
});

test("permit drafts require only date and name beyond logbook type", () => {
  const draft = parseDraftInput({
    logbookType: "permit_certification",
    entryDate: "2026-02-28",
    name: "Certification",
  });
  assert.equal(draft.officeId, undefined);
  assert.equal(draft.particulars, undefined);
});

test("permit document rules allow no office and reject hidden request values", () => {
  const documentType = {
    fieldRules: { officeId: "hidden", amountCentavos: "hidden" },
  };
  const draft = parseDraftInput(
    {
      logbookType: "permit_certification",
      entryDate: "2026-02-28",
      name: "Certification",
      documentTypeId: officeId,
    },
    documentType,
  );
  assert.equal(draft.officeId, undefined);
  const error = captureValidation(() =>
    parseDraftInput(
      {
        logbookType: "permit_certification",
        entryDate: "2026-02-28",
        name: "Certification",
        officeId,
      },
      documentType,
    ),
  );
  assert.ok(error.details.some((issue) => issue.field === "officeId"));
});

test("permit submission requirements follow document-type field rules", () => {
  const documentType = {
    fieldRules: { officeId: "hidden", amountCentavos: "required" },
  };
  const base = {
    logbookType: "permit_certification",
    entryDate: "2026-02-28",
    name: "Purchase request",
    particulars: "Office supplies",
    documentTypeId: officeId,
  };
  assert.throws(() => parseFullEntry(base, documentType));
  assert.doesNotThrow(() =>
    parseFullEntry({ ...base, amountCentavos: 100 }, documentType),
  );
});

test("permit drafts may save without document-required values", () => {
  const parsed = parsePatchInput(
    {
      version: 0,
      entryDate: "2026-02-28",
      name: "Incomplete purchase request",
    },
    "permit_certification",
    { fieldRules: { amountCentavos: "required" } },
  );
  assert.equal(parsed.data.amountCentavos, undefined);
});

test("full schema requires config fields including details", () => {
  const error = captureValidation(() =>
    parseFullEntry({
      logbookType: "check",
      entryDate: "2026-02-28",
      name: "Payee",
      officeId,
      source: "manual",
    }),
  );
  assert.ok(
    error.details.some((issue) => issue.field === "details.checkNumber"),
  );
  assert.ok(error.details.some((issue) => issue.field === "amountCentavos"));
});

test("strict bodies reject protected and unknown properties by field", () => {
  for (const field of [
    "referenceNo",
    "status",
    "submittedBy",
    "officeName",
    "ai",
    "attachment",
  ]) {
    const error = captureValidation(() =>
      parseDraftInput({
        logbookType: "petty_cash",
        entryDate: "2026-02-28",
        name: "Payee",
        officeId,
        [field]: "forbidden",
      }),
    );
    assert.ok(error.details.some((issue) => issue.field === field));
  }
});

test("dates are calendar-valid and amounts stay in the integer bound", () => {
  for (const entryDate of ["2026-02-30", "2026-2-03"]) {
    captureValidation(() =>
      parseDraftInput({
        logbookType: "petty_cash",
        entryDate,
        name: "Payee",
        officeId,
      }),
    );
  }
  captureValidation(() =>
    parseFullEntry({
      logbookType: "petty_cash",
      entryDate: "2026-02-28",
      name: "Payee",
      officeId,
      amountCentavos: 100000000000,
      source: "manual",
    }),
  );
});

test("PATCH requires a version and rejects client-controlled state", () => {
  const parsed = parsePatchInput({ version: 0, name: "Updated" }, "petty_cash");
  assert.equal(parsed.version, 0);
  assert.equal(parsed.data.name, "Updated");
  const error = captureValidation(() =>
    parsePatchInput({ version: 0, status: "approved" }, "petty_cash"),
  );
  assert.ok(error.details.some((issue) => issue.field === "status"));
});

test("returned time is 24-hour and configured text lengths are enforced", () => {
  captureValidation(() =>
    parseFullEntry({
      logbookType: "permit_certification",
      entryDate: "2026-02-28",
      name: "Payee",
      particulars: "Details",
      officeId,
      documentTypeId: officeId,
      tracking: { status: "returned", returnedTime: "24:00" },
    }),
  );
  captureValidation(() =>
    parseDraftInput({
      logbookType: "petty_cash",
      entryDate: "2026-02-28",
      name: "n".repeat(201),
      officeId,
    }),
  );
  captureValidation(() =>
    parseDraftInput({
      logbookType: "petty_cash",
      entryDate: "2026-02-28",
      name: "Payee",
      officeId,
      remarks: "r".repeat(2001),
    }),
  );
});

test("entry date years are limited to 2000 through 2100", () => {
  for (const entryDate of ["2000-01-01", "2100-12-31"]) {
    assert.equal(
      parseDraftInput({
        logbookType: "petty_cash",
        entryDate,
        name: "Payee",
        officeId,
      }).entryDate,
      entryDate,
    );
  }
  for (const entryDate of ["0001-01-01", "9999-12-31", "2101-01-01"]) {
    assert.throws(() =>
      parseDraftInput({
        logbookType: "petty_cash",
        entryDate,
        name: "Payee",
        officeId,
      }),
    );
  }
});

test("PATCH null clears optional fields but is rejected for required fields", () => {
  const parsed = parsePatchInput({ version: 0, remarks: null }, "petty_cash");
  assert.equal(parsed.data.remarks, undefined);
  assert.throws(() =>
    parsePatchInput({ version: 0, name: null }, "petty_cash"),
  );
});

test("null source is rejected instead of clearing required model state", () => {
  captureValidation(() =>
    parseDraftInput({
      logbookType: "petty_cash",
      entryDate: "2026-02-28",
      name: "Payee",
      officeId,
      source: null,
    }),
  );
});
