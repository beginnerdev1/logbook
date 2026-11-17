import { LOGBOOK_TYPES, resolveFields } from "../config/logbookTypes.js";

function cleanApiValue(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(cleanApiValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cleanApiValue(child)]),
    );
  }
  return value;
}

function requireLogbookType(logbookType) {
  const type = LOGBOOK_TYPES[logbookType];
  if (!type) throw new RangeError(`Unknown logbook type: ${logbookType}`);
  return type;
}

export function toFormValues(entry = {}, documentType) {
  requireLogbookType(entry.logbookType);
  const fields = resolveFields(entry.logbookType, documentType);
  return Object.fromEntries(
    fields.map((field) => {
      const value =
        field.where === "details"
          ? entry.details?.[field.key]
          : entry[field.key];
      return [field.key, value ?? ""];
    }),
  );
}

export function toApiPayload(values = {}, logbookType, documentType) {
  requireLogbookType(logbookType);
  const fields = resolveFields(logbookType, documentType);
  const payload = { logbookType };
  const details = {};
  let hasDetails = false;

  for (const field of fields) {
    const value = cleanApiValue(values[field.key]);
    if (field.where === "details") {
      details[field.key] = value;
      hasDetails = true;
    } else {
      payload[field.key] = value;
    }
  }

  if (hasDetails) payload.details = details;
  return payload;
}
