import { getEntryTableValues } from "@/features/entries/entryListUtils";
import {
  exportEntries,
  listEntries,
  MAX_EXPORT_ROWS,
} from "@/services/entriesService";
import { mockApiAdapter } from "@/services/adapters/mockApiAdapter";

export { MAX_EXPORT_ROWS };

export const REPORT_COLUMNS = Object.freeze([
  "Ref No",
  "Type",
  "Date",
  "Name",
  "Particulars",
  "Office",
  "Amount",
  "Tracking",
  "Status",
  "Source",
]);

export const REPORT_LIGHT_PALETTE = Object.freeze({
  background: "FFFFFF",
  headerBackground: "F1F5F9",
  alternateBackground: "F8FAFC",
  text: "111827",
  border: "CBD5E1",
});

const VALUE_KEYS = Object.freeze([
  "referenceNo",
  "type",
  "date",
  "name",
  "particulars",
  "office",
  "amount",
  "tracking",
  "status",
  "source",
]);

export function listReportRows(options = {}) {
  return listEntries({ ...options, adapter: mockApiAdapter });
}

export function formatReportRows(entries) {
  return entries.map((entry) => {
    const values = getEntryTableValues(entry);
    return Object.fromEntries(
      REPORT_COLUMNS.map((column, index) => [
        column,
        ["office", "amount"].includes(VALUE_KEYS[index]) &&
        values[VALUE_KEYS[index]] === "—"
          ? ""
          : values[VALUE_KEYS[index]],
      ]),
    );
  });
}

export async function exportReportRows(filters = {}, options = {}) {
  const result = await exportEntries(filters, {
    ...options,
    adapter: mockApiAdapter,
  });
  return {
    ...result,
    rows: formatReportRows(result.items),
  };
}

export function buildReportFilename(logbookType, dateString, format) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new TypeError("Filename date must be a YYYY-MM-DD string.");
  }
  if (format !== "xlsx" && format !== "pdf") {
    throw new RangeError("Report format must be xlsx or pdf.");
  }
  const safeType = String(logbookType || "all").replace(/[^a-z0-9_-]/gi, "-");
  return `logbook-${safeType}-${dateString}.${format}`;
}
