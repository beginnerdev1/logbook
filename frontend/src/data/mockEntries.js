import { LOGBOOK_TYPES } from "@/config/logbookTypes";
import { MOCK_DOCUMENT_TYPES, MOCK_OFFICES } from "@/data/mockLookups";

const STATUSES = ["draft", "pending", "approved", "rejected", "failed"];
const SOURCES = ["manual", "ai", "import", "manual", "ai"];
const PEOPLE = [
  { id: "000000000000000000009001", name: "Jordan Lee" },
  { id: "000000000000000000009002", name: "Morgan Patel" },
  { id: "000000000000000000009003", name: "Avery Chen" },
  { id: "000000000000000000009004", name: "Riley Brooks" },
  { id: "000000000000000000009005", name: "Sam Rivera" },
];
const officeByCode = new Map(
  MOCK_OFFICES.map((office) => [office.code, office]),
);
const documentTypeByName = new Map(
  MOCK_DOCUMENT_TYPES.map((documentType) => [documentType.name, documentType]),
);

const TEMPLATES = [
  {
    logbookType: "permit_certification",
    officeCode: "peso",
    documentTypeName: "purchase request",
    name: "Jordan Lee",
    particulars: "Purchase request for inspection supplies",
    documentNumber: "PR-2026-014",
    counterparty: "North Supply",
    amountCentavos: 125050,
    tracking: { status: "returned", returnedTime: "16:43" },
  },
  {
    logbookType: "check",
    officeCode: "accounting",
    name: "Morgan Patel",
    particulars: "Quarterly equipment service",
    amountCentavos: 890025,
    details: { checkNumber: "000184" },
  },
  {
    logbookType: "petty_cash",
    officeCode: "treasury",
    name: "Avery Chen",
    particulars: "Local transport reimbursement",
    amountCentavos: 7250,
    details: { pcvNumber: "PCV-026" },
  },
  {
    logbookType: "voucher",
    officeCode: "budget",
    name: "Riley Brooks",
    particulars: "Facilities maintenance payment",
    amountCentavos: 240050,
    details: { voucherNumber: "VCH-026" },
  },
  {
    logbookType: "dtr_leave",
    officeCode: "hr",
    documentTypeName: "DTR",
    name: "Sam Rivera",
    particulars: "Daily attendance record",
    details: { periodCovered: "October 2026" },
  },
  {
    logbookType: "travel_order",
    officeCode: "tourism",
    name: "Jordan Lee",
    particulars: "Regional coordination meeting",
    details: {
      travelOrderNumber: "TO-2026-031",
      purposeOfTravel: "Attend coordination meeting",
      destination: "Regional Office",
      travelStartDate: "2026-10-20",
      travelEndDate: "2026-10-21",
    },
  },
  {
    logbookType: "saln_mtop_bond_pds",
    officeCode: "records",
    documentTypeName: "SALN",
    name: "Morgan Patel",
    particulars: "Annual disclosure received",
    details: { codeNumber: "SALN-2026-018", receivedBy: "Avery Chen" },
  },
  {
    logbookType: "certificate_of_appearance",
    officeCode: "mdrrmo",
    name: "Sam Rivera",
    particulars: "Certificate issued for coordination visit",
    details: { codeNumber: "COA-2026-011", receivedBy: "Riley Brooks" },
  },
];

function objectId(value) {
  return value.toString(16).padStart(24, "0");
}

function officeFor(code) {
  const office = officeByCode.get(code);
  return {
    officeId: office.id,
    officeName: office.fullName || office.code.toUpperCase(),
  };
}

function documentTypeFor(name) {
  const documentType = documentTypeByName.get(name);
  return documentType
    ? { documentTypeId: documentType.id, documentTypeName: documentType.name }
    : {};
}

let referenceSequence = 0;

export const MOCK_ENTRIES = Object.freeze(
  TEMPLATES.flatMap((template, typeIndex) =>
    STATUSES.map((status, statusIndex) => {
      const logbookType = LOGBOOK_TYPES[template.logbookType];
      const source = SOURCES[statusIndex];
      const sequence = typeIndex * STATUSES.length + statusIndex + 1;
      const base = {
        id: objectId(2001 + sequence),
        version: 0,
        logbookType: template.logbookType,
        entryDate: `2026-10-${String(1 + ((sequence - 1) % 28)).padStart(2, "0")}`,
        name: template.name,
        particulars: template.particulars,
        remarks: `${template.logbookType} review notes ${sequence}`,
        ...officeFor(template.officeCode),
        ...documentTypeFor(template.documentTypeName),
        source,
        status,
        needsReview: sequence === 1 || source === "import",
        ...(source === "ai"
          ? {
              confidenceMap: Object.fromEntries(
                logbookType.fields.map((field, fieldIndex) => [
                  field.key,
                  Number(
                    (0.65 + ((sequence + fieldIndex) % 30) / 100).toFixed(2),
                  ),
                ]),
              ),
            }
          : {}),
        ...(sequence === 2
          ? {
              attachment: {
                previewUrl: "/sample-logbook-page.svg",
                name: "sample-logbook-page.svg",
              },
            }
          : {}),
        submittedBy: PEOPLE[(sequence - 1) % PEOPLE.length],
        createdAt: `2026-10-${String(1 + ((sequence - 1) % 28)).padStart(2, "0")}T08:00:00.000Z`,
        updatedAt: `2026-10-${String(1 + ((sequence - 1) % 28)).padStart(2, "0")}T08:30:00.000Z`,
        ...(status === "draft"
          ? {}
          : {
              submittedAt: `2026-10-${String(1 + ((sequence - 1) % 28)).padStart(2, "0")}T08:15:00.000Z`,
              referenceNo: `${logbookType.prefix}-2026-${String(++referenceSequence).padStart(5, "0")}`,
            }),
        ...(status === "rejected"
          ? {
              reviewerComment:
                "Please verify the source details before resubmission.",
            }
          : {}),
      };

      if (template.amountCentavos !== undefined) {
        base.amountCentavos = template.amountCentavos + statusIndex * 125;
      }
      if (template.documentNumber)
        base.documentNumber = template.documentNumber;
      if (template.counterparty) base.counterparty = template.counterparty;
      if (template.tracking) {
        base.tracking = {
          status: statusIndex % 2 === 0 ? "received" : "returned",
          ...(statusIndex % 2 === 0 ? {} : { returnedTime: "16:43" }),
        };
      }
      if (template.details) base.details = { ...template.details };

      return base;
    }),
  ),
);
