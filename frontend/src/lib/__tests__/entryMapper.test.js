import { describe, expect, it } from "vitest";
import { LOGBOOK_TYPES } from "../../config/logbookTypes.js";
import { toApiPayload, toFormValues } from "../entryMapper.js";

function valueFor(field) {
  if (field.input === "date") return "2026-07-02";
  if (field.input === "money") return 125050;
  if (field.input === "office" || field.input === "documentType")
    return "lookup-id";
  if (field.input === "tracking") {
    return { status: "returned", returnedTime: "16:43" };
  }
  return `value for ${field.key}`;
}

describe("entryMapper", () => {
  it.each(Object.entries(LOGBOOK_TYPES))(
    "round-trips root and details fields for %s",
    (logbookType, config) => {
      const values = Object.fromEntries(
        config.fields.map((field) => [field.key, valueFor(field)]),
      );
      const payload = toApiPayload(values, logbookType);

      expect(payload.logbookType).toBe(logbookType);
      for (const field of config.fields) {
        if (field.where === "details") {
          expect(payload.details[field.key]).toEqual(values[field.key]);
          expect(payload[field.key]).toBeUndefined();
        } else {
          expect(payload[field.key]).toEqual(values[field.key]);
        }
      }
      expect(toFormValues(payload)).toEqual(values);
    },
  );

  it("maps empty strings to undefined, including nested detail values", () => {
    const payload = toApiPayload(
      {
        entryDate: "2026-07-02",
        name: "Test",
        particulars: "Test particulars",
        officeId: "office-id",
        checkNumber: "",
        amountCentavos: 100,
        remarks: "",
      },
      "check",
    );

    expect(payload.checkNumber).toBeUndefined();
    expect(payload.details.checkNumber).toBeUndefined();
    expect(payload.remarks).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('"remarks":""');
    expect(toFormValues(payload).checkNumber).toBe("");
  });

  it("omits hidden permit fields from form values and API payloads", () => {
    const documentType = {
      fieldRules: { officeId: "hidden", amountCentavos: "hidden" },
    };
    const entry = {
      logbookType: "permit_certification",
      officeId: "office-id",
      amountCentavos: 1200,
      entryDate: "2026-07-02",
      name: "Certification",
    };
    const values = toFormValues(entry, documentType);
    const payload = toApiPayload(values, "permit_certification", documentType);

    expect(values).not.toHaveProperty("officeId");
    expect(values).not.toHaveProperty("amountCentavos");
    expect(payload).not.toHaveProperty("officeId");
    expect(payload).not.toHaveProperty("amountCentavos");
  });

  it("rejects unknown logbook types", () => {
    expect(() => toFormValues({ logbookType: "unknown" })).toThrow(
      "Unknown logbook type",
    );
    expect(() => toApiPayload({}, "unknown")).toThrow("Unknown logbook type");
  });
});
