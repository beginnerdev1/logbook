import { LOGBOOK_TYPES } from "@/config/logbookTypes";
import { formatDateOnly } from "@/lib/dateOnly";
import { formatPesos } from "@/lib/money";
import { format12Hour } from "@/lib/time";
import { ROLES } from "@/lib/permissions";

function safeDate(value) {
  if (!value) return "Not provided";
  try {
    return formatDateOnly(value);
  } catch {
    return value;
  }
}

export function getEntryTableValues(entry) {
  const trackingTime = entry.tracking?.returnedTime;
  let tracking = entry.tracking?.status
    ? entry.tracking.status === "returned"
      ? "Returned"
      : "Received"
    : "Not tracked";
  if (trackingTime) {
    try {
      tracking += ` · ${format12Hour(trackingTime)}`;
    } catch {
      tracking += ` · ${trackingTime}`;
    }
  }

  return {
    referenceNo: entry.status === "draft" ? "Draft" : entry.referenceNo || "—",
    type: LOGBOOK_TYPES[entry.logbookType]?.label || entry.logbookType,
    date: safeDate(entry.entryDate),
    name: entry.name || "—",
    particulars: entry.particulars || entry.details?.purposeOfTravel || "—",
    office: entry.officeName || "—",
    amount: Number.isSafeInteger(entry.amountCentavos)
      ? formatPesos(entry.amountCentavos)
      : "—",
    tracking,
    status: entry.status,
    source: entry.source || "—",
  };
}

export function buildEntryFilters(
  mode,
  role,
  ownerName,
  logbookType,
  documentTypeId,
  officeId,
  status,
  trackingStatus,
  fromDate,
  toDate,
  realEntries = false,
) {
  const filters = {};
  for (const [key, value] of Object.entries({
    logbookType,
    documentTypeId,
    officeId,
    status,
    trackingStatus,
    fromDate,
    toDate,
  })) {
    if (value) filters[key] = value;
  }

  if (mode === "pending") filters.status = "pending";
  if (mode === "own" && realEntries) {
    filters.mine = true;
  } else if (mode === "own" || (mode === "history" && role !== ROLES.ADMIN)) {
    filters.submittedByName = ownerName;
  }
  return filters;
}

export function updateEntrySearchParams(params, changes, resetPage = true) {
  const nextParams = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) {
    if (value) nextParams.set(key, String(value));
    else nextParams.delete(key);
  }
  if (resetPage) nextParams.set("page", "1");
  return nextParams;
}
