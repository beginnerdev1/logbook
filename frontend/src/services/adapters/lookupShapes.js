export function normalizeOffice(office = {}) {
  return {
    id: String(office.id ?? office._id ?? ""),
    code: String(office.code ?? ""),
    fullName: String(office.fullName ?? ""),
    kind: office.kind,
    aliases: Array.isArray(office.aliases) ? office.aliases : [],
    active: office.active !== false,
  };
}

export function normalizeDocumentType(documentType = {}) {
  return {
    id: String(documentType.id ?? documentType._id ?? ""),
    name: String(documentType.name ?? ""),
    aliases: Array.isArray(documentType.aliases) ? documentType.aliases : [],
    logbookTypes: Array.isArray(documentType.logbookTypes)
      ? documentType.logbookTypes
      : [],
    fieldRules:
      documentType.fieldRules && typeof documentType.fieldRules === "object"
        ? documentType.fieldRules
        : {},
    active: documentType.active !== false,
  };
}

export function unwrapLookupList(payload, normalize) {
  const items = Array.isArray(payload) ? payload : payload?.items;
  return Array.isArray(items) ? items.map(normalize) : [];
}

export function normalizeLookupText(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
