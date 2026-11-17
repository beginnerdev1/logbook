import { apiClient } from "@/lib/apiClient";
import { LOGBOOK_TYPES } from "@/config/logbookTypes";
import {
  normalizeDocumentType,
  normalizeOffice,
  unwrapLookupList,
} from "@/services/adapters/lookupShapes";

const ENTRY_QUERY_KEYS = [
  "logbookType",
  "documentTypeId",
  "officeId",
  "status",
  "trackingStatus",
  "source",
  "needsReview",
  "dateFrom",
  "dateTo",
  "submittedBy",
  "mine",
  "search",
];

function queryValue(key, value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) {
    return key === "status" ? value.filter(Boolean).join(",") || undefined : undefined;
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function listQuery(options = {}) {
  const { page, pageSize, search, sort, filters = {} } = options;
  const params = new URLSearchParams();
  const pageValue = queryValue("page", page);
  if (pageValue !== undefined) params.set("page", pageValue);
  const pageSizeValue = queryValue("pageSize", pageSize);
  if (pageSizeValue !== undefined) {
    const parsedPageSize = Number(pageSizeValue);
    if (Number.isFinite(parsedPageSize)) {
      params.set(
        "pageSize",
        String(Math.min(100, Math.max(1, Math.floor(parsedPageSize)))),
      );
    }
  }
  if (sort) {
    const field =
      typeof sort === "string" ? sort.replace(/^[+-]/, "") : sort.field;
    const direction =
      typeof sort === "string"
        ? sort.startsWith("-") ? "desc" : "asc"
        : sort.direction;
    if (field) params.set("sort", String(field));
    const orderValue = queryValue("order", direction);
    if (orderValue !== undefined) params.set("order", orderValue);
  }

  const filterAliases = { dateFrom: "fromDate", dateTo: "toDate" };
  const values = { ...filters, search: search ?? filters.search };
  for (const key of ENTRY_QUERY_KEYS) {
    const value = queryValue(
      key,
      values[key] ?? values[filterAliases[key]],
    );
    if (value !== undefined) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function entryPayload(payload = {}) {
  const type = LOGBOOK_TYPES[payload.logbookType];
  if (!type) throw new RangeError(`Unknown logbook type: ${payload.logbookType}`);
  const fields = { logbookType: payload.logbookType };
  const details = {};
  for (const field of type.fields) {
    if (field.where === "details") {
      if (payload.details?.[field.key] !== undefined) {
        details[field.key] = payload.details[field.key];
      }
    } else if (payload[field.key] !== undefined) {
      fields[field.key] = payload[field.key];
    }
  }
  if (Object.keys(details).length) fields.details = details;
  return fields;
}

function entryOptions(options = {}) {
  return Object.fromEntries(
    ["source"]
      .filter((key) => options[key] !== undefined)
      .map((key) => [key, options[key]]),
  );
}

function normalizeHistory(response) {
  const items = Array.isArray(response) ? response : response?.items ?? [];
  return items.map((item, index) => ({
    ...item,
    id: item.id ?? `${item.at ?? item.changedAt ?? "history"}-${index}`,
    changedAt: item.changedAt ?? item.at,
    changedFields:
      item.changedFields ??
      (item.changes && typeof item.changes === "object"
        ? Object.keys(item.changes)
        : []),
    changedBy: item.changedBy ?? item.actor?.name,
  }));
}

function lookupQuery(options = {}, keys) {
  const params = new URLSearchParams();
  for (const key of keys) {
    if (options[key] !== undefined && options[key] !== "") {
      params.set(key, String(options[key]));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const realApiAdapter = {
  listUsers: () => apiClient.get("/users"),
  getUsers: () => apiClient.get("/users"),
  listNotifications: () => apiClient.get("/notifications"),
  getNotifications: () => apiClient.get("/notifications"),
  listOffices: async (options = {}) =>
    unwrapLookupList(
      await apiClient.get(
        `/offices${lookupQuery(options, ["active", "kind", "search"])}`,
      ),
      normalizeOffice,
    ),
  getOffice: async (id) => {
    const office = await apiClient.get(`/offices/${id}`);
    return office ? normalizeOffice(office) : null;
  },
  listDocumentTypes: async (options = {}) =>
    unwrapLookupList(
      await apiClient.get(
        `/document-types${lookupQuery(options, ["active", "logbookType", "search"])}`,
      ),
      normalizeDocumentType,
    ),
  getDocumentType: async (id) => {
    const documentType = await apiClient.get(`/document-types/${id}`);
    return documentType ? normalizeDocumentType(documentType) : null;
  },
  listEntries: (options) => apiClient.get(`/entries${listQuery(options)}`),
  getEntry: (id) => apiClient.get(`/entries/${id}`),
  createEntry: (payload, options = {}) =>
    apiClient.post("/entries", {
      ...entryPayload(payload),
      ...entryOptions(options),
    }),
  updateEntry: (id, payload, version, options = {}) =>
    apiClient.patch(`/entries/${id}`, {
      ...entryPayload(payload),
      ...entryOptions(options),
      version,
    }),
  submitEntry: async (id, _payload, version) => {
    const entry = await apiClient.post(`/entries/${id}/submit`, { version });
    return entry;
  },
  deleteDraftEntry: async (id) => {
    await apiClient.del(`/entries/${id}`);
    return { id, deleted: true };
  },
  reviewEntry: (id, decision, reviewerComment) =>
    apiClient.patch(`/entries/${id}/review`, {
      decision,
      reviewerComment,
    }),
  getEntryStats: (scope) =>
    apiClient.get(`/entries/stats${listQuery({ filters: scope })}`),
  getEntryHistory: async (id) =>
    normalizeHistory(await apiClient.get(`/entries/${id}/history`)),
};
