import express from "express";
import mongoose from "mongoose";
import { LOGBOOK_TYPES, resolveFields } from "../shared/logbookTypes.js";
import {
  ActivityLog,
  DocumentType,
  Entry,
  Office,
  User,
} from "../models/index.js";
import { createRequireAuth } from "../middleware/auth.js";
import {
  canDeleteDraft,
  canEdit,
  canReview,
  canSubmit,
  canView,
} from "../policies/entryPolicy.js";
import {
  parseDraftInput,
  parseFullEntry,
  parsePatchInput,
  parseSubmitBody,
  isRealDate,
} from "../entries/entryValidation.js";
import {
  ApiError,
  API_ERROR_CODES,
  validationError,
} from "../utils/apiError.js";
import { nextReferenceNo } from "../utils/referenceNo.js";

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/;
const ENTRY_STATUSES = ["draft", "pending", "approved", "rejected", "failed"];
const ENTRY_SOURCES = ["ai", "manual", "import"];
const SORT_FIELDS = new Set([
  "entryDate",
  "createdAt",
  "submittedAt",
  "referenceNo",
  "name",
  "amountCentavos",
  "status",
]);
const ENTRY_QUERY_FIELDS = new Set([
  "page",
  "pageSize",
  "sort",
  "order",
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
]);
const ENTRY_PROJECTION = [
  "_id",
  "__v",
  "referenceNo",
  "logbookType",
  "entryDate",
  "name",
  "particulars",
  "documentTypeId",
  "documentTypeName",
  "officeId",
  "officeName",
  "routingNote",
  "subject",
  "documentNumber",
  "counterparty",
  "amountCentavos",
  "tracking",
  "remarks",
  "details",
  "status",
  "source",
  "needsReview",
  "attachment",
  "ai",
  "submittedBy",
  "submittedAt",
  "reviewedBy",
  "reviewedAt",
  "reviewerComment",
  "createdAt",
  "updatedAt",
].join(" ");

function requestQuery(req, allowedFields) {
  const query = req.query;
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    validationIssue("query", "Query parameters must be key-value strings.");
  }
  for (const key of Object.keys(query)) {
    if (!allowedFields.has(key)) {
      validationIssue(key, "Unknown query parameter.");
    }
    if (typeof query[key] !== "string") {
      validationIssue(key, "Query parameter must be a single string.");
    }
  }
  return query;
}

function queryInteger(value, name, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!/^[0-9]+$/.test(value)) {
    validationIssue(name, `Expected an integer from 1 to ${maximum}.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    validationIssue(name, `Expected an integer from 1 to ${maximum}.`);
  }
  return parsed;
}

function parseEntryQuery(req, { pageSizeMax = 100 } = {}) {
  const query = requestQuery(req, ENTRY_QUERY_FIELDS);
  const page = queryInteger(query.page, "page", 1, 1000);
  const pageSize = queryInteger(query.pageSize, "pageSize", 25, pageSizeMax);
  const sort = query.sort ?? "entryDate";
  const order = query.order ?? "desc";
  if (!SORT_FIELDS.has(sort)) {
    validationIssue("sort", "Sort field is not allowed.");
  }
  if (order !== "asc" && order !== "desc") {
    validationIssue("order", "Order must be asc or desc.");
  }

  if (
    query.logbookType !== undefined &&
    !Object.hasOwn(LOGBOOK_TYPES, query.logbookType)
  ) {
    validationIssue("logbookType", "Unknown logbook type.");
  }
  for (const field of ["documentTypeId", "officeId", "submittedBy"]) {
    if (
      query[field] !== undefined &&
      !OBJECT_ID_PATTERN.test(query[field])
    ) {
      validationIssue(field, "Expected a 24-character hexadecimal id.");
    }
  }
  if (
    query.submittedBy !== undefined &&
    req.user.role !== "admin"
  ) {
    validationIssue("submittedBy", "Only admins may filter by submitter.");
  }
  const statuses =
    query.status === undefined ? undefined : query.status.split(",");
  if (
    statuses?.some(
      (status) => !status || !ENTRY_STATUSES.includes(status),
    )
  ) {
    validationIssue("status", "Unknown entry status.");
  }
  if (
    query.trackingStatus !== undefined &&
    !["received", "returned"].includes(query.trackingStatus)
  ) {
    validationIssue("trackingStatus", "Unknown tracking status.");
  }
  if (query.source !== undefined && !ENTRY_SOURCES.includes(query.source)) {
    validationIssue("source", "Unknown entry source.");
  }
  if (
    query.needsReview !== undefined &&
    query.needsReview !== "true" &&
    query.needsReview !== "false"
  ) {
    validationIssue("needsReview", "Expected true or false.");
  }
  for (const field of ["dateFrom", "dateTo"]) {
    if (query[field] !== undefined && !isRealDate(query[field])) {
      validationIssue(field, "Expected a real date in YYYY-MM-DD format.");
    }
  }
  if (
    query.dateFrom !== undefined &&
    query.dateTo !== undefined &&
    query.dateFrom > query.dateTo
  ) {
    validationIssue("dateFrom", "dateFrom must not be after dateTo.");
  }
  if (query.mine !== undefined && query.mine !== "true") {
    validationIssue("mine", "Only mine=true is supported.");
  }
  if (query.search !== undefined && query.search.length > 100) {
    validationIssue("search", "Search must be at most 100 characters.");
  }
  return { query, page, pageSize, sort, order, statuses };
}

function entryFilter(user, parsed) {
  const { query, statuses } = parsed;
  const clauses = [];
  if (user.role === "admin") {
    clauses.push({
      $or: [{ submittedBy: user._id }, { status: { $ne: "draft" } }],
    });
  } else {
    clauses.push({ submittedBy: user._id });
  }
  if (query.mine === "true") clauses.push({ submittedBy: user._id });
  if (query.submittedBy) {
    clauses.push({
      submittedBy: new mongoose.Types.ObjectId(query.submittedBy),
    });
  }
  if (query.logbookType) clauses.push({ logbookType: query.logbookType });
  if (query.documentTypeId) {
    clauses.push({
      documentTypeId: new mongoose.Types.ObjectId(query.documentTypeId),
    });
  }
  if (query.officeId) {
    clauses.push({ officeId: new mongoose.Types.ObjectId(query.officeId) });
  }
  if (statuses) {
    clauses.push(
      statuses.length === 1 ? { status: statuses[0] } : { status: { $in: statuses } },
    );
  }
  if (query.trackingStatus) {
    clauses.push({ "tracking.status": query.trackingStatus });
  }
  if (query.source) clauses.push({ source: query.source });
  if (query.needsReview !== undefined) {
    clauses.push({ needsReview: query.needsReview === "true" });
  }
  if (query.dateFrom || query.dateTo) {
    const entryDate = {};
    if (query.dateFrom) entryDate.$gte = query.dateFrom;
    if (query.dateTo) entryDate.$lte = query.dateTo;
    clauses.push({ entryDate });
  }
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matcher = new RegExp(escaped, "i");
    clauses.push({
      $or: ["name", "particulars", "remarks", "referenceNo", "documentNumber"].map(
        (field) => ({ [field]: matcher }),
      ),
    });
  }
  return { $and: clauses };
}

function assertId(id) {
  if (!OBJECT_ID_PATTERN.test(id)) {
    throw new ApiError(
      400,
      API_ERROR_CODES.VALIDATION_ERROR,
      "The id must be a 24-character hexadecimal value.",
      [{ field: "id", message: "Expected a 24-character hexadecimal id." }],
    );
  }
}

function notFound() {
  return new ApiError(404, API_ERROR_CODES.NOT_FOUND, "Entry was not found.");
}

function validationIssue(field, message) {
  throw new ApiError(
    400,
    API_ERROR_CODES.VALIDATION_ERROR,
    "Request validation failed.",
    [{ field, message }],
  );
}

function invalidState(message) {
  return new ApiError(409, API_ERROR_CODES.INVALID_STATE, message);
}

function versionConflict() {
  return new ApiError(
    409,
    API_ERROR_CODES.VERSION_CONFLICT,
    "This entry changed since it was loaded. Reload and try again.",
  );
}

function isOwner(user, entry) {
  return user?._id?.equals(entry.submittedBy) ?? false;
}

function configHasField(logbookType, key) {
  return LOGBOOK_TYPES[logbookType].fields.some((field) => field.key === key);
}

function configuredRootKeys(logbookType) {
  return new Set(
    LOGBOOK_TYPES[logbookType].fields
      .filter((field) => field.where !== "details")
      .map((field) => field.key),
  );
}

function fullValidationInput(entry, documentType) {
  const input = { logbookType: entry.logbookType };
  const details = {};
  for (const field of resolveFields(entry.logbookType, documentType)) {
    let value =
      field.where === "details"
        ? entry.details?.[field.key]
        : entry.get(field.key);
    if (value && typeof value.toObject === "function") value = value.toObject();
    if (value instanceof mongoose.Types.ObjectId) value = value.toString();
    if (field.input === "tracking" && value?.status === undefined)
      value = undefined;
    if (value === undefined) continue;
    if (field.where === "details") details[field.key] = value;
    else input[field.key] = value;
  }
  if (Object.keys(details).length) input.details = details;
  return input;
}

function entryPayload(entry) {
  const value =
    typeof entry.toObject === "function"
      ? entry.toObject({ flattenMaps: true })
      : entry;
  const submittedBy = value.submittedBy;
  const reviewedBy = value.reviewedBy;
  const response = {
    id: value._id.toString(),
    ...(value.referenceNo ? { referenceNo: value.referenceNo } : {}),
    version: value.__v,
  };
  for (const [key, fieldValue] of Object.entries(value)) {
    if (
      ["_id", "__v", "referenceNo", "submittedBy", "reviewedBy"].includes(key)
    )
      continue;
    if (fieldValue !== undefined) response[key] = fieldValue;
  }
  response.submittedBy = submittedBy?._id
    ? { id: submittedBy._id.toString(), name: submittedBy.name }
    : null;
  response.reviewedBy = reviewedBy?._id
    ? { id: reviewedBy._id.toString(), name: reviewedBy.name }
    : null;
  return response;
}

async function loadEntry(id) {
  return Entry.findById(id)
    .populate("submittedBy", "name")
    .populate("reviewedBy", "name");
}

async function logEntry(req, entry, action, changes = [], metadata = {}) {
  const resourceRef = entry.referenceNo ?? entry._id.toString();
  await ActivityLog.create({
    at: new Date(),
    userId: req.user._id,
    userName: req.user.name,
    action,
    resourceType: "entry",
    resourceId: entry._id,
    resourceRef,
    result: "success",
    details: `${action} ${resourceRef}.`,
    changes,
    ...metadata,
  });
}

function parseReviewBody(body, decision) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    validationIssue("body", "Expected a JSON object.");
  }
  for (const key of Object.keys(body)) {
    if (key !== "version" && key !== "comment") {
      validationIssue(key, "Unknown review field.");
    }
  }
  if (!Number.isInteger(body.version) || body.version < 0) {
    validationIssue("version", "Expected a non-negative integer version.");
  }
  let comment;
  if (body.comment !== undefined) {
    if (typeof body.comment !== "string") {
      validationIssue("comment", "Comment must be a string.");
    }
    comment = body.comment.trim();
    if (comment.length > 1000) {
      validationIssue("comment", "Comment must be at most 1000 characters.");
    }
    if (!comment) comment = undefined;
  }
  if (decision === "rejected" && !comment) {
    validationIssue("comment", "A trimmed comment is required for rejection.");
  }
  return { version: body.version, comment };
}

function comparable(value) {
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toObject === "function") return value.toObject();
  return value;
}

function entryChanges(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete("_id");
  keys.delete("__v");
  keys.delete("createdAt");
  keys.delete("updatedAt");
  return [...keys].flatMap((field) => {
    const from = comparable(before[field]);
    const to = comparable(after[field]);
    if (JSON.stringify(from) === JSON.stringify(to)) return [];
    return [{ field, from: from ?? null, to: to ?? null }];
  });
}

async function resolveLookups(data, entry, logbookType) {
  const officeId = Object.hasOwn(data, "officeId")
    ? data.officeId
    : entry?.officeId?.toString();
  if (!officeId) {
    delete data.officeId;
    delete data.officeName;
  } else {
    const office = await Office.findById(officeId);
    if (!office) validationIssue("officeId", "Select an existing office.");
    const officeUnchanged = entry && office._id.equals(entry.officeId);
    if (!office.active && !officeUnchanged) {
      validationIssue("officeId", "Select an active office.");
    }
    data.officeId = office._id;
    data.officeName = officeUnchanged
      ? entry.officeName
      : office.fullName || office.code.toUpperCase();
  }

  if (!configHasField(logbookType, "documentTypeId")) {
    delete data.documentTypeId;
    delete data.documentTypeName;
    return null;
  }

  const documentTypeId = Object.hasOwn(data, "documentTypeId")
    ? data.documentTypeId
    : entry?.documentTypeId?.toString();
  if (!documentTypeId) {
    delete data.documentTypeId;
    delete data.documentTypeName;
    return null;
  }
  const documentType = await DocumentType.findById(documentTypeId);
  if (!documentType)
    validationIssue("documentTypeId", "Select an existing document type.");
  const typeUnchanged =
    entry &&
    entry.logbookType === logbookType &&
    documentType._id.equals(entry.documentTypeId);
  if (!documentType.active && !typeUnchanged) {
    validationIssue("documentTypeId", "Select an active document type.");
  }
  if (!documentType.logbookTypes.includes(logbookType)) {
    validationIssue(
      "documentTypeId",
      "Document type is not available for this logbook.",
    );
  }
  data.documentTypeId = documentType._id;
  data.documentTypeName = typeUnchanged
    ? entry.documentTypeName
    : documentType.name;
  return documentType;
}

function ensureCanView(req, entry) {
  if (!canView(req.user, entry)) throw notFound();
}

function ensureCanEdit(req, entry) {
  ensureCanView(req, entry);
  if (!canEdit(req.user, entry)) {
    throw new ApiError(403, "FORBIDDEN", "This entry can no longer be edited.");
  }
}

function translateSaveError(error) {
  if (
    error instanceof mongoose.Error.VersionError ||
    error?.name === "VersionError"
  ) {
    throw versionConflict();
  }
  if (error?.code === 11000 && error?.keyPattern?.referenceNo) {
    throw versionConflict();
  }
  throw error;
}

export function createEntriesRouter(
  config,
  { referenceNumberGenerator = nextReferenceNo } = {},
) {
  const router = express.Router();
  const requireAuth = createRequireAuth(config);

  router.get("/entries", requireAuth, async (req, res) => {
    const parsed = parseEntryQuery(req);
    const filter = entryFilter(req.user, parsed);
    const direction = parsed.order === "asc" ? 1 : -1;
    const [items, total] = await Promise.all([
      Entry.find(filter)
        .select(ENTRY_PROJECTION)
        .populate("submittedBy", "name")
        .populate("reviewedBy", "name")
        .sort({ [parsed.sort]: direction, _id: 1 })
        .skip((parsed.page - 1) * parsed.pageSize)
        .limit(parsed.pageSize)
        .lean(),
      Entry.countDocuments(filter),
    ]);
    res.json({
      items: items.map(entryPayload),
      total,
      page: parsed.page,
      pageSize: parsed.pageSize,
    });
  });

  router.get("/entries/stats", requireAuth, async (req, res) => {
    const parsed = parseEntryQuery(req);
    const filter = entryFilter(req.user, parsed);
    const [groups, amountSummary] = await Promise.all([
      Entry.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { status: "$status", logbookType: "$logbookType" },
            count: { $sum: 1 },
            needsReview: {
              $sum: { $cond: ["$needsReview", 1, 0] },
            },
          },
        },
      ]),
      Entry.aggregate([
        {
          $match: {
            $and: [
              filter,
              { status: "approved" },
              { amountCentavos: { $type: "number" } },
            ],
          },
        },
        {
          $group: {
            _id: null,
            approvedAmountCentavos: { $sum: "$amountCentavos" },
            approvedWithAmountCount: { $sum: 1 },
          },
        },
      ]),
    ]);
    const byStatus = Object.fromEntries(
      ENTRY_STATUSES.map((status) => [status, 0]),
    );
    const byLogbookType = Object.fromEntries(
      Object.keys(LOGBOOK_TYPES).map((type) => [type, 0]),
    );
    let total = 0;
    let needsReview = 0;
    for (const group of groups) {
      total += group.count;
      needsReview += group.needsReview;
      byStatus[group._id.status] += group.count;
      byLogbookType[group._id.logbookType] += group.count;
    }
    const summary = amountSummary[0] ?? {
      approvedAmountCentavos: 0,
      approvedWithAmountCount: 0,
    };
    const response = {
      total,
      byStatus,
      byLogbookType,
      needsReview,
      approvedAmountCentavos: summary.approvedAmountCentavos,
      approvedWithAmountCount: summary.approvedWithAmountCount,
    };
    if (req.user.role === "admin") {
      const recentFilter = {
        $and: [filter, { submittedAt: { $exists: true } }],
      };
      const [totalActiveUsers, recentSubmissions, recentActivity] =
        await Promise.all([
          User.countDocuments({ active: true }),
          Entry.find(recentFilter)
            .select(ENTRY_PROJECTION)
            .populate("submittedBy", "name")
            .populate("reviewedBy", "name")
            .sort({ submittedAt: -1, _id: 1 })
            .limit(5)
            .lean(),
          ActivityLog.find({})
            .select("at action userName resourceRef")
            .sort({ at: -1, _id: -1 })
            .limit(10)
            .lean(),
        ]);
      response.totalActiveUsers = totalActiveUsers;
      response.recentSubmissions = recentSubmissions.map(entryPayload);
      response.recentActivity = recentActivity.map((item) => ({
        at: item.at,
        actor: { name: item.userName ?? null },
        action: item.action,
        resourceRef: item.resourceRef ?? null,
      }));
    }
    res.json(response);
  });

  router.post("/entries", requireAuth, async (req, res) => {
    const requestedType = req.body?.logbookType;
    const initialDocumentType =
      requestedType === "permit_certification" &&
      OBJECT_ID_PATTERN.test(req.body?.documentTypeId ?? "")
        ? await DocumentType.findById(req.body.documentTypeId)
        : null;
    let data = parseDraftInput(req.body, initialDocumentType);
    const logbookType = data.logbookType;
    const documentType = await resolveLookups(data, null, logbookType);
    parseDraftInput(req.body, documentType);
    const entry = new Entry({
      ...data,
      status: "draft",
      source: data.source ?? "manual",
      submittedBy: req.user._id,
    });
    await entry.save();
    await logEntry(req, entry, "entry_created");
    await entry.populate("submittedBy", "name");
    res.status(201).json(entryPayload(entry));
  });

  router.get("/entries/:id", requireAuth, async (req, res) => {
    assertId(req.params.id);
    const entry = await loadEntry(req.params.id);
    if (!entry) throw notFound();
    ensureCanView(req, entry);
    res.json(entryPayload(entry));
  });

  async function review(req, res, decision) {
    if (req.user.role !== "admin") {
      throw new ApiError(403, "FORBIDDEN", "Only admins may review entries.");
    }
    assertId(req.params.id);
    const { version, comment } = parseReviewBody(req.body, decision);
    const entry = await Entry.findById(req.params.id);
    if (!entry) throw notFound();
    if (!canReview(req.user, entry)) {
      throw invalidState("Only pending entries can be reviewed.");
    }
    if (entry.__v !== version) throw versionConflict();

    const selfReview = isOwner(req.user, entry);
    entry.status = decision;
    entry.reviewedBy = req.user._id;
    entry.reviewedAt = new Date();
    entry.reviewerComment = comment;
    try {
      await entry.save();
    } catch (error) {
      translateSaveError(error);
    }
    await logEntry(req, entry, `entry_${decision}`, [], {
      ...(comment ? { comment: comment.slice(0, 200) } : {}),
      selfReview,
    });
    await entry.populate("submittedBy", "name");
    await entry.populate("reviewedBy", "name");
    res.json(entryPayload(entry));
  }

  router.post("/entries/:id/approve", requireAuth, async (req, res) => {
    await review(req, res, "approved");
  });

  router.post("/entries/:id/reject", requireAuth, async (req, res) => {
    await review(req, res, "rejected");
  });

  router.get("/entries/:id/history", requireAuth, async (req, res) => {
    assertId(req.params.id);
    const query = requestQuery(req, new Set(["page", "pageSize"]));
    const page = queryInteger(query.page, "page", 1, 1000);
    const pageSize = queryInteger(query.pageSize, "pageSize", 25, 50);
    const entry = await Entry.findById(req.params.id).select("_id submittedBy");
    if (!entry) throw notFound();
    ensureCanView(req, entry);
    const filter = { resourceType: "entry", resourceId: entry._id };
    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .select("at action userId userName result changes")
        .populate("userId", "name")
        .sort({ at: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      ActivityLog.countDocuments(filter),
    ]);
    res.json({
      items: logs.map((log) => ({
        at: log.at,
        action: log.action,
        actor: {
          id: log.userId?._id?.toString() ?? null,
          name: log.userId?.name ?? log.userName ?? null,
        },
        result: log.result ?? null,
        changes: log.changes ?? [],
      })),
      total,
      page,
      pageSize,
    });
  });

  router.patch("/entries/:id", requireAuth, async (req, res) => {
    assertId(req.params.id);
    const entry = await Entry.findById(req.params.id);
    if (!entry) throw notFound();
    ensureCanEdit(req, entry);
    const requestedType = req.body?.logbookType ?? entry.logbookType;
    const requestedDocumentTypeId =
      req.body?.documentTypeId ??
      (requestedType === "permit_certification" ? entry.documentTypeId : null);
    const initialDocumentType =
      requestedType === "permit_certification" &&
      OBJECT_ID_PATTERN.test(String(requestedDocumentTypeId ?? ""))
        ? await DocumentType.findById(requestedDocumentTypeId)
        : null;
    const { version, data, typeKey } = parsePatchInput(
      req.body,
      entry.logbookType,
      initialDocumentType,
    );
    if (entry.__v !== version) throw versionConflict();
    if (entry.referenceNo && typeKey !== entry.logbookType) {
      throw invalidState(
        "Logbook type cannot change after reference assignment.",
      );
    }

    const before = entry.toObject();
    const previousType = entry.logbookType;
    const merged = { ...data };
    if (data.details) {
      merged.details =
        typeKey === previousType
          ? {
              ...(entry.details?.toObject?.() ?? entry.details ?? {}),
              ...data.details,
            }
          : data.details;
    }
    const documentType = await resolveLookups(merged, entry, typeKey);
    if (typeKey !== previousType) {
      const allowedKeys = configuredRootKeys(typeKey);
      for (const field of LOGBOOK_TYPES[previousType].fields) {
        if (field.where !== "details" && !allowedKeys.has(field.key)) {
          entry.set(field.key, undefined);
        }
      }
      entry.details = {};
    }
    const documentTypeChanged =
      typeKey === "permit_certification" &&
      data.documentTypeId !== undefined &&
      String(data.documentTypeId) !== String(entry.documentTypeId ?? "");
    if (documentTypeChanged && documentType) {
      const visibleKeys = new Set(
        resolveFields(typeKey, documentType).map((field) => field.key),
      );
      for (const key of [
        "officeId",
        "amountCentavos",
        "documentNumber",
        "counterparty",
        "tracking",
        "routingNote",
      ]) {
        if (!visibleKeys.has(key)) {
          entry.set(key, undefined);
          if (key === "officeId") {
            entry.set("officeName", undefined);
            merged.officeId = undefined;
            merged.officeName = undefined;
          }
        }
      }
    }
    await resolveLookups(merged, entry, typeKey);
    Object.assign(entry, merged);
    entry.logbookType = typeKey;
    const changes = entryChanges(before, entry.toObject());
    if (changes.length === 0) {
      await entry.populate("submittedBy", "name");
      await entry.populate("reviewedBy", "name");
      res.json(entryPayload(entry));
      return;
    }
    try {
      await entry.save();
    } catch (error) {
      translateSaveError(error);
    }
    await logEntry(req, entry, "entry_edited", changes);
    await entry.populate("submittedBy", "name");
    await entry.populate("reviewedBy", "name");
    res.json(entryPayload(entry));
  });

  router.delete("/entries/:id", requireAuth, async (req, res) => {
    assertId(req.params.id);
    const entry = await Entry.findById(req.params.id);
    if (!entry) throw notFound();
    ensureCanView(req, entry);
    if (!canDeleteDraft(req.user, entry)) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only an owner may delete an unsubmitted draft.",
      );
    }
    await logEntry(req, entry, "draft_deleted");
    await Entry.deleteOne({ _id: entry._id });
    res.status(204).end();
  });

  router.post("/entries/:id/submit", requireAuth, async (req, res) => {
    assertId(req.params.id);
    const { version } = parseSubmitBody(req.body);
    const entry = await Entry.findById(req.params.id);
    if (!entry) throw notFound();
    ensureCanView(req, entry);
    if (["pending", "approved"].includes(entry.status)) {
      throw invalidState(
        "This entry cannot be submitted in its current state.",
      );
    }
    if (!canSubmit(req.user, entry)) {
      if (isOwner(req.user, entry))
        throw invalidState(
          "This entry cannot be submitted in its current state.",
        );
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only the entry owner may submit it.",
      );
    }
    if (entry.__v !== version) throw versionConflict();

    const currentDocumentType = entry.documentTypeId
      ? await DocumentType.findById(entry.documentTypeId)
      : null;
    parseFullEntry(
      fullValidationInput(entry, currentDocumentType),
      currentDocumentType,
    );
    const data = {
      ...(entry.officeId ? { officeId: entry.officeId.toString() } : {}),
      ...(entry.documentTypeId
        ? { documentTypeId: entry.documentTypeId.toString() }
        : {}),
    };
    await resolveLookups(data, entry, entry.logbookType);
    const before = entry.toObject();
    if (!entry.referenceNo) {
      const year = Number(entry.entryDate.slice(0, 4));
      entry.referenceNo = await referenceNumberGenerator(
        LOGBOOK_TYPES[entry.logbookType].prefix,
        year,
      );
    }
    entry.officeName = data.officeName;
    if (data.documentTypeName) entry.documentTypeName = data.documentTypeName;
    entry.status = "pending";
    entry.submittedAt = new Date();
    try {
      await entry.save();
    } catch (error) {
      if (
        error instanceof mongoose.Error.VersionError ||
        error?.name === "VersionError"
      ) {
        const latest = await Entry.findById(entry._id).select("status").lean();
        if (latest && ["pending", "approved"].includes(latest.status)) {
          throw invalidState(
            "This entry cannot be submitted in its current state.",
          );
        }
      }
      translateSaveError(error);
    }
    await logEntry(
      req,
      entry,
      "entry_submitted",
      entryChanges(before, entry.toObject()),
    );
    await entry.populate("submittedBy", "name");
    await entry.populate("reviewedBy", "name");
    res.json(entryPayload(entry));
  });

  return router;
}
