import { describe, expect, it } from "vitest";
import { LOGBOOK_TYPES } from "../../config/logbookTypes.js";
import { buildSchema } from "../buildSchema.js";

function validValue(field) {
  switch (field.input) {
    case "date":
      return "2026-07-02";
    case "money":
      return 125050;
    case "office":
    case "documentType":
      return "lookup-id";
    case "tracking":
      return { status: "received", returnedTime: "16:43" };
    default:
      return "valid field value";
  }
}

describe("buildSchema", () => {
  it.each(Object.entries(LOGBOOK_TYPES))(
    "accepts a valid %s entry",
    (typeKey, config) => {
      const values = Object.fromEntries(
        config.fields.map((field) => [field.key, validValue(field)]),
      );
      expect(buildSchema(typeKey).safeParse(values).success).toBe(true);
    },
  );

  it.each(Object.entries(LOGBOOK_TYPES))(
    "rejects an empty required text field for %s with its label",
    (typeKey, config) => {
      const values = Object.fromEntries(
        config.fields.map((field) => [field.key, validValue(field)]),
      );
      const requiredTextField = config.fields.find(
        (field) => field.required && ["text", "textarea"].includes(field.input),
      );
      expect(requiredTextField).toBeDefined();
      values[requiredTextField.key] = "";

      const result = buildSchema(typeKey).safeParse(values);
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path[0] === requiredTextField.key &&
            issue.message === `${requiredTextField.label} is required`,
        ),
      ).toBe(true);
    },
  );

  it("enforces date, tracking time, and integer non-negative centavos", () => {
    const permitSchema = buildSchema("permit_certification");
    const base = Object.fromEntries(
      LOGBOOK_TYPES.permit_certification.fields.map((field) => [
        field.key,
        validValue(field),
      ]),
    );
    expect(
      permitSchema.safeParse({ ...base, entryDate: "13-10-2026" }).success,
    ).toBe(false);
    expect(
      permitSchema.safeParse({
        ...base,
        tracking: { status: "returned", returnedTime: "16:70" },
      }).success,
    ).toBe(false);

    const checkFields = Object.fromEntries(
      LOGBOOK_TYPES.check.fields.map((field) => [field.key, validValue(field)]),
    );
    expect(
      buildSchema("check").safeParse({ ...checkFields, amountCentavos: 12.5 })
        .success,
    ).toBe(false);
    expect(
      buildSchema("check").safeParse({ ...checkFields, amountCentavos: -1 })
        .success,
    ).toBe(false);
  });

  it("requires purchase-request amount and allows certification without office or amount", () => {
    const purchaseRequest = {
      fieldRules: { amountCentavos: "required" },
    };
    const certification = {
      fieldRules: { officeId: "hidden", amountCentavos: "hidden" },
    };
    const base = {
      entryDate: "2026-07-02",
      name: "Permit record",
      particulars: "Filed document",
      documentTypeId: "lookup-id",
    };

    expect(
      buildSchema("permit_certification", purchaseRequest).safeParse(base)
        .success,
    ).toBe(false);
    expect(
      buildSchema("permit_certification", purchaseRequest).safeParse({
        ...base,
        amountCentavos: 100,
        officeId: "lookup-id",
      }).success,
    ).toBe(true);
    expect(
      buildSchema("permit_certification", certification).safeParse(base)
        .success,
    ).toBe(true);
  });

  it("rejects an unknown logbook type", () => {
    expect(() => buildSchema("unknown")).toThrow("Unknown logbook type");
  });
});
