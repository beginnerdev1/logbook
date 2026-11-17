function objectId(value) {
  return value.toString(16).padStart(24, "0");
}

const internalOfficeCodes = [
  "mdrrmo",
  "mdrrmc",
  "abe",
  "peso",
  "lsb",
  "mho",
  "mswdo",
  "bac",
  "mpdc",
  "mcr",
  "sb",
  "mbo",
  "mao",
  "menro",
  "bplo",
  "hr",
  "tourism",
  "treasury",
  "assessor",
  "accounting",
  "records",
  "budget",
];

const externalOfficeCodes = [
  "pcg-air-station",
  "bfp",
  "pnp",
  "dilg",
  "psa",
  "aurelco",
];

export const MOCK_OFFICES = Object.freeze([
  ...internalOfficeCodes.map((code, index) => ({
    id: objectId(index + 1),
    code,
    fullName: "",
    kind: "internal",
    aliases: [],
    active: true,
  })),
  ...externalOfficeCodes.map((code, index) => ({
    id: objectId(internalOfficeCodes.length + index + 1),
    code,
    fullName: "",
    kind: "external",
    aliases: [],
    active: true,
  })),
]);

const permitDocumentTypes = [
  {
    name: "purchase request",
    aliases: ["pr"],
    fieldRules: { amountCentavos: "required" },
  },
  {
    name: "purchase order",
    aliases: [],
    fieldRules: { amountCentavos: "required" },
  },
  {
    name: "job order",
    aliases: [],
    fieldRules: { amountCentavos: "required" },
  },
  { name: "notice of award", aliases: [], fieldRules: {} },
  {
    name: "activity proposal",
    aliases: ["activity prosal", "activity propsal"],
    fieldRules: {},
  },
  { name: "request letter", aliases: ["letter of request"], fieldRules: {} },
  {
    name: "letter of invitation",
    aliases: [],
    fieldRules: { amountCentavos: "hidden" },
  },
  {
    name: "notice of meeting",
    aliases: [],
    fieldRules: { amountCentavos: "hidden" },
  },
  { name: "minutes of the meeting", aliases: [], fieldRules: {} },
  { name: "resolution", aliases: [], fieldRules: {} },
  {
    name: "executive order",
    aliases: [],
    fieldRules: { amountCentavos: "hidden" },
  },
  { name: "ordinance", aliases: ["ordinansa"], fieldRules: {} },
  {
    name: "certification",
    aliases: ["cetification"],
    fieldRules: { officeId: "hidden", amountCentavos: "hidden" },
  },
  {
    name: "itinerary of travel",
    aliases: [],
    fieldRules: { amountCentavos: "hidden" },
  },
  {
    name: "trip ticket",
    aliases: [],
    fieldRules: { amountCentavos: "hidden" },
  },
  {
    name: "transmittal letter",
    aliases: ["transmital letter"],
    fieldRules: { amountCentavos: "hidden" },
  },
  { name: "report", aliases: [], fieldRules: {} },
  { name: "directive", aliases: [], fieldRules: { amountCentavos: "hidden" } },
].map((documentType) => ({
  ...documentType,
  logbookTypes: ["permit_certification"],
  fieldRules: documentType.fieldRules ?? {},
  active: true,
}));

const scopedDocumentTypes = [
  ...["DTR", "Leave"].map((name) => ({
    name,
    aliases: [],
    logbookTypes: ["dtr_leave"],
    active: true,
  })),
  ...["SALN", "MTOP", "Fidelity Bond", "PDS"].map((name) => ({
    name,
    aliases: [],
    logbookTypes: ["saln_mtop_bond_pds"],
    active: true,
  })),
];

export const MOCK_DOCUMENT_TYPES = Object.freeze(
  [...permitDocumentTypes, ...scopedDocumentTypes].map(
    (documentType, index) => ({
      id: objectId(1001 + index),
      ...documentType,
      fieldRules: documentType.fieldRules ?? {},
    }),
  ),
);
