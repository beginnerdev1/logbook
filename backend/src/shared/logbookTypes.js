const f = (key, label, input, required = false, where = "root") => ({
  key,
  label,
  input,
  required,
  where,
});

const date = f("entryDate", "Date", "date", true);
const name = (label = "Name") => f("name", label, "text", true);
const particulars = (required = true) =>
  f("particulars", "Particulars", "textarea", required);
const office = f("officeId", "Office", "office", true);
const remarks = f("remarks", "Remarks", "textarea");
const amount = (required) => f("amountCentavos", "Amount", "money", required);
const docType = f("documentTypeId", "Document type", "documentType", true);
const codeNumber = f("codeNumber", "Code number", "text", true, "details");
const receivedBy = f("receivedBy", "Received by", "text", true, "details");

const permitFieldModes = {
  officeId: "required",
  amountCentavos: "optional",
  documentNumber: "optional",
  counterparty: "optional",
  tracking: "optional",
  routingNote: "optional",
};

export const LOGBOOK_TYPES = {
  permit_certification: {
    label: "Permit & Certification (Document Tracking)",
    prefix: "DOC",
    configurableFields: permitFieldModes,
    fields: [
      date,
      name("Name / Title"),
      particulars(),
      docType,
      office,
      f("documentNumber", "Document number", "text"),
      f("counterparty", "Supplier / sender", "text"),
      amount(false),
      f("tracking", "Returned?", "tracking"),
      f("routingNote", "Routing note", "text"),
      remarks,
    ],
  },
  check: {
    label: "Checks",
    prefix: "CHK",
    fields: [
      date,
      name(),
      particulars(),
      office,
      f("checkNumber", "Check number", "text", true, "details"),
      amount(true),
      remarks,
    ],
  },
  petty_cash: {
    label: "Petty Cash",
    prefix: "PTC",
    fields: [date, name(), particulars(), office, amount(true), remarks],
  },
  voucher: {
    label: "Vouchers",
    prefix: "VCH",
    fields: [date, name(), particulars(), office, amount(true), remarks],
  },
  dtr_leave: {
    label: "DTR / Leave",
    prefix: "DTR",
    fields: [
      date,
      name(),
      particulars(),
      docType,
      office,
      f("periodCovered", "Period covered", "text", false, "details"),
      remarks,
    ],
  },
  travel_order: {
    label: "Travel Order",
    prefix: "TVL",
    fields: [
      date,
      name("Traveler"),
      office,
      f("travelOrderNumber", "Travel order number", "text", true, "details"),
      f("purposeOfTravel", "Purpose of travel", "textarea", true, "details"),
      f("destination", "Destination", "text", true, "details"),
      f("travelStartDate", "Travel start", "date", true, "details"),
      f("travelEndDate", "Travel end", "date", true, "details"),
      remarks,
    ],
  },
  saln_mtop_bond_pds: {
    label: "SALN / MTOP / Fidelity Bond / PDS",
    prefix: "SMB",
    fields: [
      date,
      codeNumber,
      particulars(),
      name(),
      docType,
      office,
      receivedBy,
      remarks,
    ],
  },
  certificate_of_appearance: {
    label: "Certificate of Appearance",
    prefix: "COA",
    fields: [
      date,
      codeNumber,
      particulars(),
      name(),
      office,
      receivedBy,
      remarks,
    ],
  },
};

export function resolveFields(logbookTypeKey, documentType) {
  const config = LOGBOOK_TYPES[logbookTypeKey];
  if (!config) return [];
  if (logbookTypeKey !== "permit_certification") return config.fields;

  const rules = documentType?.fieldRules ?? {};
  return config.fields.flatMap((field) => {
    const defaultMode = permitFieldModes[field.key];
    if (!defaultMode) return [field];
    const mode = rules[field.key] ?? defaultMode;
    if (mode === "hidden") return [];
    return [{ ...field, required: mode === "required" }];
  });
}

export function validateFieldRules(logbookTypeKey, rules) {
  const issues = [];
  if (!LOGBOOK_TYPES[logbookTypeKey]) {
    return [{ field: "logbookType", message: "Unknown logbook type." }];
  }
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
    return [{ field: "fieldRules", message: "Expected an object." }];
  }

  const configurable =
    logbookTypeKey === "permit_certification" ? permitFieldModes : {};
  for (const [field, mode] of Object.entries(rules)) {
    if (!Object.hasOwn(configurable, field)) {
      issues.push({
        field: `fieldRules.${field}`,
        message: "Field is not configurable for this logbook type.",
      });
    } else if (!["hidden", "optional", "required"].includes(mode)) {
      issues.push({
        field: `fieldRules.${field}`,
        message: "Expected hidden, optional, or required.",
      });
    }
  }
  return issues;
}
