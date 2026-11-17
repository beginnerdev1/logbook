import { LOGBOOK_TYPES } from "@/config/logbookTypes";
import { MOCK_DOCUMENT_TYPES, MOCK_OFFICES } from "@/data/mockLookups";
import { MOCK_ENTRIES } from "@/data/mockEntries";
import { compareDateOnly } from "@/lib/dateOnly";
import { canEditSubmission } from "@/lib/permissions";

export const ENTRY_SORT_FIELDS = Object.freeze([
  "entryDate",
  "createdAt",
  "referenceNo",
  "name",
  "amountCentavos",
  "status",
]);

const ENTRY_STATUSES = ["draft", "pending", "approved", "rejected", "failed"];
const ENTRY_SOURCES = ["ai", "manual", "import"];
const DEFAULT_SUBMITTER = Object.freeze({
  id: "000000000000000000009001",
  name: "Jordan Lee",
});
const officeById = new Map(MOCK_OFFICES.map((office) => [office.id, office]));
const documentTypeById = new Map(
  MOCK_DOCUMENT_TYPES.map((documentType) => [documentType.id, documentType]),
);

function objectId(value) {
  return value.toString(16).padStart(24, "0");
}

function clone(value) {
  return structuredClone(value);
}

function stripServerOwnedFields(value, includeReferenceNo = false) {
  const result = { ...value };
  delete result.officeName;
  delete result.documentTypeName;
  if (includeReferenceNo) delete result.referenceNo;
  return result;
}

function serviceError(status, code, message, details = []) {
  return Object.assign(new Error(message), { status, code, details });
}

function matchesValue(actual, expected) {
  return Array.isArray(expected)
    ? expected.includes(actual)
    : actual === expected;
}

function matchesFilters(entry, filters = {}) {
  const { logbookType, documentTypeId, officeId, status, trackingStatus } =
    filters;
  const fromDate = filters.fromDate ?? filters.dateRange?.from;
  const toDate = filters.toDate ?? filters.dateRange?.to;

  if (logbookType && !matchesValue(entry.logbookType, logbookType))
    return false;
  if (documentTypeId && !matchesValue(entry.documentTypeId, documentTypeId)) {
    return false;
  }
  if (officeId && !matchesValue(entry.officeId, officeId)) return false;
  if (status && !matchesValue(entry.status, status)) return false;
  if (trackingStatus && !matchesValue(entry.tracking?.status, trackingStatus)) {
    return false;
  }
  if (
    filters.submittedById &&
    entry.submittedBy?.id !== filters.submittedById
  ) {
    return false;
  }
  if (
    filters.submittedByName &&
    entry.submittedBy?.name !== filters.submittedByName
  ) {
    return false;
  }
  if (fromDate && compareDateOnly(entry.entryDate, fromDate) < 0) return false;
  if (toDate && compareDateOnly(entry.entryDate, toDate) > 0) return false;
  return true;
}

function matchesSearch(entry, search) {
  const query = String(search ?? "")
    .trim()
    .toLocaleLowerCase("en-PH");
  if (!query) return true;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(escapedQuery, "i");

  return [
    entry.name,
    entry.particulars,
    entry.remarks,
    entry.referenceNo,
    entry.documentNumber,
  ].some((value) => matcher.test(String(value ?? "")));
}

function normalizeSort(sort) {
  let field = "createdAt";
  let direction = "desc";

  if (typeof sort === "string" && sort) {
    direction = sort.startsWith("-") ? "desc" : "asc";
    field = sort.replace(/^[+-]/, "");
  } else if (sort && typeof sort === "object") {
    field = sort.field ?? field;
    direction = sort.direction ?? direction;
  }

  if (!ENTRY_SORT_FIELDS.includes(field)) {
    throw serviceError(
      400,
      "INVALID_SORT",
      `Sort field is not allowed: ${field}`,
    );
  }
  if (direction !== "asc" && direction !== "desc") {
    throw serviceError(
      400,
      "INVALID_SORT",
      "Sort direction must be asc or desc.",
    );
  }

  return { field, direction };
}

function compareSortValues(first, second, direction) {
  const multiplier = direction === "asc" ? 1 : -1;
  if (first === second) return 0;
  if (first === undefined || first === null || first === "") return multiplier;
  if (second === undefined || second === null || second === "")
    return -multiplier;
  if (typeof first === "number" && typeof second === "number") {
    return (first - second) * multiplier;
  }
  return (
    String(first).localeCompare(String(second), "en", {
      numeric: true,
      sensitivity: "base",
    }) * multiplier
  );
}

function resolveEntryNames(entry) {
  const office = officeById.get(entry.officeId);
  const documentType = documentTypeById.get(entry.documentTypeId);
  const clientFields = stripServerOwnedFields(entry);
  return {
    ...clientFields,
    officeName: office?.fullName || office?.code.toUpperCase(),
    ...(documentType ? { documentTypeName: documentType.name } : {}),
  };
}

function nextReferenceNo(entry) {
  const prefix = LOGBOOK_TYPES[entry.logbookType]?.prefix;
  if (!prefix) {
    throw serviceError(400, "INVALID_LOGBOOK_TYPE", "Unknown logbook type.");
  }

  const year = entry.entryDate.slice(0, 4);
  const highestSequence = MOCK_ENTRIES.reduce((highest, mockEntry) => {
    const match = new RegExp(`^${prefix}-${year}-(\\d+)$`).exec(
      mockEntry.referenceNo ?? "",
    );
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const existingSequences = Array.from(referenceSequences.values()).filter(
    (sequence) => sequence.prefix === prefix && sequence.year === year,
  );
  const current = Math.max(
    highestSequence,
    ...existingSequences.map((item) => item.sequence),
  );
  const sequence = current + 1;
  referenceSequences.set(`${prefix}-${year}`, { prefix, year, sequence });
  return `${prefix}-${year}-${String(sequence).padStart(5, "0")}`;
}

const referenceSequences = new Map();

export function createMockEntriesAdapter(initialEntries = MOCK_ENTRIES) {
  let entries = initialEntries.map(clone);
  let nextEntryId = 50000;
  const historyByEntryId = new Map();

  function findEntry(id) {
    const entry = entries.find((item) => item.id === id);
    if (!entry)
      throw serviceError(404, "ENTRY_NOT_FOUND", "Entry was not found.");
    return entry;
  }

  function listFiltered(scope = {}) {
    return entries.filter(
      (entry) =>
        matchesFilters(entry, scope) && matchesSearch(entry, scope.search),
    );
  }

  return {
    async listEntries({
      page = 1,
      pageSize = 10,
      search = "",
      sort,
      filters = {},
    } = {}) {
      const parsedPage = Math.max(1, Math.floor(Number(page) || 1));
      const parsedPageSize = Math.min(
        100,
        Math.max(1, Math.floor(Number(pageSize) || 10)),
      );
      const { field, direction } = normalizeSort(sort);
      const filtered = listFiltered({ ...filters, search });
      const total = filtered.length;
      const pageCount = Math.max(1, Math.ceil(total / parsedPageSize));
      const currentPage = parsedPage > pageCount ? 1 : parsedPage;
      const sorted = filtered.sort((first, second) =>
        compareSortValues(first[field], second[field], direction),
      );
      const start = (currentPage - 1) * parsedPageSize;

      return {
        items: sorted
          .slice(start, start + parsedPageSize)
          .map((entry) => clone(resolveEntryNames(entry))),
        total,
        page: currentPage,
        pageSize: parsedPageSize,
      };
    },

    async getEntry(id) {
      return clone(resolveEntryNames(findEntry(id)));
    },

    async createEntry(payload, options = {}) {
      const status = options.status ?? "draft";
      if (!ENTRY_STATUSES.includes(status)) {
        throw serviceError(
          400,
          "INVALID_STATUS",
          "Entry status is not allowed.",
        );
      }
      if (!ENTRY_SOURCES.includes(options.source ?? "manual")) {
        throw serviceError(
          400,
          "INVALID_SOURCE",
          "Entry source is not allowed.",
        );
      }

      const clientFields = stripServerOwnedFields(payload, true);
      const entry = {
        ...clientFields,
        id: objectId(nextEntryId++),
        version: 0,
        status,
        source: options.source ?? "manual",
        submittedBy: options.submittedBy ?? DEFAULT_SUBMITTER,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (status !== "draft") entry.referenceNo = nextReferenceNo(entry);
      if (status === "rejected")
        entry.reviewerComment = "Mock rejection comment";
      entries.push(entry);
      return clone(resolveEntryNames(entry));
    },

    async updateEntry(id, payload, clientVersion, options = {}) {
      const current = findEntry(id);
      if (clientVersion !== current.version) {
        throw serviceError(
          409,
          "VERSION_CONFLICT",
          "This record was changed by someone else. Reload to see the latest.",
          [{ field: "version", message: "The submitted version is stale." }],
        );
      }

      if (!canEditSubmission(options.role, options.user, current)) {
        throw serviceError(
          403,
          "ENTRY_EDIT_FORBIDDEN",
          "You can only edit your own Draft or Rejected entries, or an admin can edit any entry.",
        );
      }

      const status = options.status ?? current.status;
      if (!ENTRY_STATUSES.includes(status)) {
        throw serviceError(
          400,
          "INVALID_STATUS",
          "Entry status is not allowed.",
        );
      }
      if (!ENTRY_SOURCES.includes(options.source ?? current.source)) {
        throw serviceError(
          400,
          "INVALID_SOURCE",
          "Entry source is not allowed.",
        );
      }

      const clientFields = stripServerOwnedFields(payload, true);
      const activeFieldKeys = new Set(
        LOGBOOK_TYPES[payload.logbookType].fields.map((field) => field.key),
      );
      const allFieldKeys = new Set(
        Object.values(LOGBOOK_TYPES).flatMap((type) =>
          type.fields.map((field) => field.key),
        ),
      );
      const retainedFields = Object.fromEntries(
        Object.entries(current).filter(
          ([key]) =>
            key !== "details" &&
            (!allFieldKeys.has(key) || activeFieldKeys.has(key)),
        ),
      );
      const updated = {
        ...retainedFields,
        ...clientFields,
        status,
        source: options.source ?? current.source,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };
      if (!clientFields.details) delete updated.details;
      if (status !== "draft" && !updated.referenceNo) {
        updated.referenceNo = nextReferenceNo(updated);
      }

      const changedFields = Object.keys(clientFields).filter(
        (key) => current[key] !== clientFields[key],
      );
      const history = historyByEntryId.get(id) ?? [];
      historyByEntryId.set(id, [
        ...history,
        {
          id: objectId(nextEntryId++),
          entryId: id,
          version: updated.version,
          changedFields,
          changedAt: updated.updatedAt,
        },
      ]);
      entries = entries.map((entry) => (entry.id === id ? updated : entry));
      return clone(resolveEntryNames(updated));
    },

    async submitEntry(id, payload, clientVersion, options = {}) {
      return this.updateEntry(id, payload, clientVersion, {
        ...options,
        status: "pending",
      });
    },

    async getEntryHistory(id) {
      findEntry(id);
      return clone(historyByEntryId.get(id) ?? []);
    },

    async reviewEntry(id, decision, reviewerComment, reviewerName) {
      const current = findEntry(id);
      if (current.status !== "pending") {
        throw serviceError(
          409,
          "ENTRY_NOT_PENDING",
          "Only pending entries can be reviewed.",
        );
      }
      if (decision !== "approved" && decision !== "rejected") {
        throw serviceError(400, "INVALID_DECISION", "Invalid review decision.");
      }
      if (decision === "rejected" && !String(reviewerComment ?? "").trim()) {
        throw serviceError(
          400,
          "REVIEW_COMMENT_REQUIRED",
          "A comment is required when rejecting an entry.",
        );
      }

      const updated = {
        ...current,
        status: decision,
        reviewerName,
        reviewerComment: String(reviewerComment ?? "").trim(),
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };
      const history = historyByEntryId.get(id) ?? [];
      historyByEntryId.set(id, [
        ...history,
        {
          id: objectId(nextEntryId++),
          entryId: id,
          version: updated.version,
          changedFields: ["status", "reviewerComment"],
          changedAt: updated.updatedAt,
          changedBy: reviewerName,
        },
      ]);
      entries = entries.map((entry) => (entry.id === id ? updated : entry));
      return clone(resolveEntryNames(updated));
    },

    async deleteDraftEntry(id, actor = {}) {
      const current = findEntry(id);
      if (
        actor.role !== "user" ||
        current.status !== "draft" ||
        !canEditSubmission(actor.role, actor.user, current)
      ) {
        throw serviceError(
          403,
          "ENTRY_DELETE_FORBIDDEN",
          "You can only delete your own draft entries.",
        );
      }
      entries = entries.filter((entry) => entry.id !== id);
      historyByEntryId.delete(id);
      return { id, deleted: true };
    },

    async getEntryStats(scope = {}) {
      const scopedEntries = listFiltered(scope);
      const byStatus = Object.fromEntries(
        ENTRY_STATUSES.map((status) => [
          status,
          scopedEntries.filter((entry) => entry.status === status).length,
        ]),
      );
      const byLogbookType = Object.fromEntries(
        Object.keys(LOGBOOK_TYPES).map((type) => [
          type,
          scopedEntries.filter((entry) => entry.logbookType === type).length,
        ]),
      );
      return {
        total: scopedEntries.length,
        byStatus,
        byLogbookType,
        needsReview: scopedEntries.filter((entry) => entry.needsReview).length,
      };
    },
  };
}

export const mockEntriesAdapter = createMockEntriesAdapter();
