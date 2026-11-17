import { LOGBOOK_TYPES, resolveFields } from "@/config/logbookTypes";
import { buildSchema } from "@/lib/buildSchema";
import { toApiPayload, toFormValues } from "@/lib/entryMapper";
import { canEditSubmission } from "@/lib/permissions";
import {
  getApiAdapter,
  isRealServiceEnabled,
} from "@/services/adapters";

const ENTRY_STATUSES = ["draft", "pending", "approved", "rejected", "failed"];
const ENTRY_SOURCES = ["ai", "manual", "import"];

function validateDraft(values, logbookType) {
  if (!LOGBOOK_TYPES[logbookType]) {
    throw new RangeError(`Unknown logbook type: ${logbookType}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.entryDate ?? "")) {
    throw new Error("Date must use YYYY-MM-DD.");
  }
  if (!String(values.name ?? "").trim()) {
    throw new Error("Name is required.");
  }
  if (
    logbookType !== "permit_certification" &&
    !String(values.officeId ?? "").trim()
  ) {
    throw new Error("Office is required.");
  }
}

function normalizeOptionalValue(value) {
  if (value === "" || value === null) return undefined;
  if (Array.isArray(value)) return value.map(normalizeOptionalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        normalizeOptionalValue(child),
      ]),
    );
  }
  return value;
}

async function prepare(values, logbookType, status) {
  if (!ENTRY_STATUSES.includes(status)) {
    throw new Error(`Entry status is not allowed: ${status}`);
  }
  const documentType =
    logbookType === "permit_certification" && values.documentTypeId
      ? await getApiAdapter("documentTypes").getDocumentType(values.documentTypeId)
      : null;
  if (status === "draft") validateDraft(values, logbookType);
  else {
    const validationValues = { ...values };
    for (const field of resolveFields(logbookType, documentType)) {
      if (!field.required) {
        validationValues[field.key] = normalizeOptionalValue(
          validationValues[field.key],
        );
      }
    }
    buildSchema(logbookType, documentType).parse(validationValues);
  }
  return toApiPayload(values, logbookType, documentType);
}

export function listEntries(options = {}) {
  const { adapter = getApiAdapter("entries"), ...listOptions } = options;
  return adapter.listEntries(listOptions);
}

export function getEntry(id, adapter = getApiAdapter("entries")) {
  return adapter.getEntry(id);
}

export async function createEntry(values, options = {}) {
  const logbookType = options.logbookType ?? values.logbookType;
  const status = options.status ?? values.status ?? "draft";
  const source = options.source ?? values.source ?? "manual";
  if (!ENTRY_SOURCES.includes(source)) {
    throw new Error(`Entry source is not allowed: ${source}`);
  }

  const adapter = options.adapter ?? getApiAdapter("entries");
  const realEntries = !options.adapter && isRealServiceEnabled("entries");
  const payload = await prepare(values, logbookType, realEntries ? "draft" : status);
  return adapter.createEntry(payload, {
    status: realEntries ? "draft" : status,
    source,
    submittedBy: options.submittedBy,
  });
}

export async function updateEntry(id, values, version, options = {}) {
  if (!Number.isInteger(version)) {
    throw new TypeError("The client entry version is required.");
  }

  const adapter = options.adapter ?? getApiAdapter("entries");
  if (!options.adapter && isRealServiceEnabled("entries")) {
    const logbookType = options.logbookType ?? values.logbookType;
    const source = options.source ?? values.source;
    if (source !== undefined && !["manual", "ai"].includes(source)) {
      throw new Error(`Entry source is not allowed: ${source}`);
    }
    const payload = await prepare(values, logbookType, options.status ?? "draft");
    return adapter.updateEntry(
      id,
      payload,
      version,
      source === undefined ? {} : { source },
    );
  }

  const current = await adapter.getEntry(id);
  if (current.version !== version) {
    throw Object.assign(
      new Error(
        "This record was changed by someone else. Reload to see the latest.",
      ),
      { status: 409, code: "VERSION_CONFLICT" },
    );
  }
  if (!canEditSubmission(options.role, options.user, current)) {
    throw Object.assign(
      new Error(
        "You can only edit your own Draft or Rejected entries, or an admin can edit any entry.",
      ),
      { status: 403, code: "ENTRY_EDIT_FORBIDDEN" },
    );
  }
  const currentDocumentType = current.documentTypeId
    ? await adapter.getDocumentType(current.documentTypeId)
    : null;
  const formValues = toFormValues(current, currentDocumentType);
  const mergedValues = { ...formValues, ...values };
  const logbookType =
    options.logbookType ?? values.logbookType ?? current.logbookType;
  const status =
    options.status ??
    values.status ??
    (current.status === "rejected" ? "pending" : current.status);
  const source = options.source ?? values.source ?? current.source ?? "manual";

  if (!ENTRY_SOURCES.includes(source)) {
    throw new Error(`Entry source is not allowed: ${source}`);
  }

  const payload = await prepare(mergedValues, logbookType, status);
  return adapter.updateEntry(id, payload, version, {
    status,
    source,
    role: options.role,
    user: options.user,
  });
}

export async function submitEntry(id, values, version, options = {}) {
  if (!Number.isInteger(version)) {
    throw new TypeError("The client entry version is required.");
  }
  const adapter = options.adapter ?? getApiAdapter("entries");
  if (!options.adapter && isRealServiceEnabled("entries")) {
    return adapter.submitEntry(id, {}, version);
  }

  const current = await adapter.getEntry(id);
  if (current.version !== version) {
    throw Object.assign(
      new Error(
        "This record was changed by someone else. Reload to see the latest.",
      ),
      { status: 409, code: "VERSION_CONFLICT" },
    );
  }
  if (
    !["draft", "rejected"].includes(current.status) ||
    !canEditSubmission(options.role, options.user, current)
  ) {
    throw Object.assign(
      new Error("Only an editable draft or rejected entry can be submitted."),
      { status: 403, code: "ENTRY_SUBMIT_FORBIDDEN" },
    );
  }

  const currentDocumentType = current.documentTypeId
    ? await adapter.getDocumentType(current.documentTypeId)
    : null;
  const formValues = toFormValues(current, currentDocumentType);
  const mergedValues = { ...formValues, ...values };
  const logbookType = values.logbookType ?? current.logbookType;
  const source = options.source ?? values.source ?? current.source ?? "manual";
  if (!ENTRY_SOURCES.includes(source)) {
    throw new Error(`Entry source is not allowed: ${source}`);
  }
  const payload = await prepare(mergedValues, logbookType, "pending");
  return adapter.submitEntry(id, payload, version, {
    source,
    role: options.role,
    user: options.user,
  });
}

export async function saveAndSubmitEntry(values, draft, options = {}) {
  const { onEntryChange, ...serviceOptions } = options;
  const source = serviceOptions.source ?? "manual";
  let current = draft;

  if (!current) {
    current = await createEntry(values, {
      ...serviceOptions,
      logbookType: values.logbookType,
      status: "draft",
      source,
    });
    onEntryChange?.(current);
  }

  const saved = await updateEntry(current.id, values, current.version, {
    ...serviceOptions,
    status: "pending",
    source: undefined,
  });
  onEntryChange?.(saved);

  const submitted = await submitEntry(current.id, {}, saved.version, {
    ...serviceOptions,
  });
  onEntryChange?.(submitted);
  return submitted;
}

export async function deleteDraftEntry(id, actor = {}) {
  const adapter = actor.adapter ?? getApiAdapter("entries");
  if (!actor.adapter && isRealServiceEnabled("entries")) {
    return adapter.deleteDraftEntry(id);
  }

  const current = await adapter.getEntry(id);
  if (
    actor.role !== "user" ||
    current.status !== "draft" ||
    !canEditSubmission(actor.role, actor.user, current)
  ) {
    throw Object.assign(
      new Error("You can only delete your own draft entries."),
      { status: 403, code: "ENTRY_DELETE_FORBIDDEN" },
    );
  }
  return adapter.deleteDraftEntry(id, {
    role: actor.role,
    user: actor.user,
  });
}

export function getEntryStats(scope = {}, adapter = getApiAdapter("entries")) {
  return adapter.getEntryStats(scope);
}

export function getEntryHistory(
  entryId,
  adapter = getApiAdapter("entries"),
) {
  return adapter.getEntryHistory(entryId);
}

export function reviewEntry(id, decision, reviewerComment, actor = {}) {
  if (actor.role !== "admin") {
    throw Object.assign(new Error("Only admins can review entries."), {
      status: 403,
      code: "ENTRY_REVIEW_FORBIDDEN",
    });
  }
  return (actor.adapter ?? getApiAdapter("entries")).reviewEntry(
    id,
    decision,
    reviewerComment,
    actor.user?.name,
  );
}

export const MAX_EXPORT_ROWS = 5000;

export async function exportEntries(filters = {}, options = {}) {
  const pageSize = 100;
  const exported = [];
  let page = 1;
  let total = 0;
  const fetchPage =
    options.listPage ??
    ((query) => listEntries({ ...query, adapter: options.adapter }));
  const maxRows = options.maxRows ?? MAX_EXPORT_ROWS;

  while (page === 1 || exported.length < Math.min(total, maxRows)) {
    const result = await fetchPage({ page, pageSize, filters });
    const remaining = maxRows - exported.length;
    exported.push(...result.items.slice(0, remaining));
    total = result.total;
    if (result.items.length === 0 || exported.length >= total) break;
    page += 1;
  }

  return {
    items: exported,
    total,
    capped: total > maxRows && exported.length >= maxRows,
  };
}
