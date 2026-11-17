import express from "express";
import { z } from "zod";
import { LOGBOOK_TYPES, validateFieldRules } from "../shared/logbookTypes.js";
import { ActivityLog, DocumentType, Office } from "../models/index.js";
import { createRequireAuth, requireRole } from "../middleware/auth.js";
import {
  ApiError,
  API_ERROR_CODES,
  validationError,
} from "../utils/apiError.js";
import {
  findDocumentTypeById,
  findOfficeById,
  isValidLookupId,
  normalizeLookupText,
} from "../services/lookups.js";

const logbookTypeKeys = Object.keys(LOGBOOK_TYPES);
const fieldRuleModes = ["hidden", "optional", "required"];
const officeCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{1,40}$/),
    fullName: z.string().trim().max(200).optional().default(""),
    kind: z.enum(["internal", "external"]),
    aliases: z
      .array(z.string().trim().min(1).max(80))
      .max(20)
      .optional()
      .default([]),
    active: z.boolean().optional().default(true),
  })
  .strict();
const officePatchSchema = z
  .object({
    fullName: z.string().trim().max(200),
    kind: z.enum(["internal", "external"]),
    aliases: z.array(z.string().trim().min(1).max(80)).max(20),
    active: z.boolean(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const documentTypeCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    aliases: z
      .array(z.string().trim().min(1).max(80))
      .max(20)
      .optional()
      .default([]),
    logbookTypes: z.array(z.enum(logbookTypeKeys)).optional().default([]),
    fieldRules: z
      .record(z.string(), z.enum(fieldRuleModes))
      .optional()
      .default({}),
    active: z.boolean().optional().default(true),
  })
  .strict();
const documentTypePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    aliases: z.array(z.string().trim().min(1).max(80)).max(20),
    logbookTypes: z.array(z.enum(logbookTypeKeys)),
    fieldRules: z.record(z.string(), z.enum(fieldRuleModes)),
    active: z.boolean(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const officeQuerySchema = z
  .object({
    active: z.enum(["true", "false"]).optional(),
    kind: z.enum(["internal", "external"]).optional(),
    search: z.string().optional(),
  })
  .strict();
const documentTypeQuerySchema = z
  .object({
    active: z.enum(["true", "false"]).optional(),
    logbookType: z.enum(logbookTypeKeys).optional(),
    search: z.string().optional(),
  })
  .strict();

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

function normalizeAliases(aliases = []) {
  return [...new Set(aliases.map(normalizeLookupText))];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function publicOffice(office) {
  return {
    id: office._id.toString(),
    code: office.code,
    fullName: office.fullName,
    kind: office.kind,
    aliases: office.aliases,
    active: office.active,
  };
}

function publicDocumentType(documentType) {
  return {
    id: documentType._id.toString(),
    name: documentType.name,
    aliases: documentType.aliases,
    logbookTypes: documentType.logbookTypes,
    fieldRules: documentType.fieldRules ?? {},
    active: documentType.active,
  };
}

function assertFieldRules(logbookTypes, fieldRules) {
  const validationType = logbookTypes.includes("permit_certification")
    ? "permit_certification"
    : "check";
  const issues = validateFieldRules(validationType, fieldRules);
  if (issues.length) {
    throw new ApiError(
      400,
      API_ERROR_CODES.VALIDATION_ERROR,
      "Request validation failed.",
      issues,
    );
  }
}

function conflict(field) {
  return new ApiError(
    409,
    API_ERROR_CODES.CONFLICT,
    `${field} conflicts with another record.`,
    [{ field, message: `${field} must be unique.` }],
  );
}

function notFound(resource) {
  return new ApiError(
    404,
    API_ERROR_CODES.NOT_FOUND,
    `${resource} was not found.`,
  );
}

function assertId(id) {
  if (!isValidLookupId(id)) {
    throw new ApiError(
      400,
      API_ERROR_CODES.VALIDATION_ERROR,
      "The id must be a 24-character hexadecimal value.",
      [{ field: "id", message: "Expected a 24-character hexadecimal id." }],
    );
  }
}

async function assertOfficeUnique(candidate, excludedId) {
  const values = [candidate.code, ...candidate.aliases].map(
    normalizeLookupText,
  );
  const records = await Office.find(
    excludedId ? { _id: { $ne: excludedId } } : {},
  )
    .select("code aliases")
    .lean();
  for (const record of records) {
    const existing = [record.code, ...(record.aliases ?? [])].map(
      normalizeLookupText,
    );
    if (values.some((value) => existing.includes(value))) {
      throw conflict(
        values.includes(normalizeLookupText(record.code)) ? "code" : "aliases",
      );
    }
  }
}

async function assertDocumentTypeUnique(candidate, excludedId) {
  const values = [candidate.name, ...candidate.aliases].map(
    normalizeLookupText,
  );
  const records = await DocumentType.find(
    excludedId ? { _id: { $ne: excludedId } } : {},
  )
    .select("name aliases")
    .lean();
  for (const record of records) {
    const existing = [record.name, ...(record.aliases ?? [])].map(
      normalizeLookupText,
    );
    if (values.some((value) => existing.includes(value))) {
      throw conflict(
        values.includes(normalizeLookupText(record.name)) ? "name" : "aliases",
      );
    }
  }
}

async function writeActivity(req, { id, name, resourceType, action, changes }) {
  await ActivityLog.create({
    at: new Date(),
    userId: req.user._id,
    userName: req.user.name,
    action,
    resourceType,
    resourceId: id,
    resourceRef: id.toString(),
    result: "success",
    details: `${action} ${name}.`,
    changes,
  });
}

function changesFor(before, after, fields) {
  return fields.flatMap((field) => {
    const from = before?.[field] ?? null;
    const to = after[field] ?? null;
    return JSON.stringify(from) === JSON.stringify(to)
      ? []
      : [{ field, from, to }];
  });
}

function handleDuplicate(error, field) {
  if (error?.code === 11000) throw conflict(field);
  throw error;
}

export function createLookupRouter(config) {
  const router = express.Router();
  const requireAuth = createRequireAuth(config);
  const adminOnly = requireRole("admin");

  router.get("/offices", requireAuth, async (req, res) => {
    const query = parse(officeQuerySchema, req.query);
    const filter = { active: query.active === "false" ? false : true };
    if (query.kind) filter.kind = query.kind;
    if (query.search?.trim()) {
      const search = new RegExp(escapeRegex(query.search.trim()), "i");
      filter.$or = [
        { code: search },
        { fullName: search },
        { aliases: search },
      ];
    }
    const [items, total] = await Promise.all([
      Office.find(filter).sort({ code: 1 }).limit(200),
      Office.countDocuments(filter),
    ]);
    res.json({ items: items.map(publicOffice), total });
  });

  router.get("/offices/:id", requireAuth, async (req, res) => {
    assertId(req.params.id);
    const office = await findOfficeById(req.params.id);
    if (!office) throw notFound("Office");
    res.json(publicOffice(office));
  });

  router.post("/offices", requireAuth, adminOnly, async (req, res) => {
    const input = parse(officeCreateSchema, req.body);
    const data = { ...input, aliases: normalizeAliases(input.aliases) };
    await assertOfficeUnique(data);
    let office;
    try {
      office = await Office.create(data);
    } catch (error) {
      handleDuplicate(error, "code");
    }
    const changes = changesFor(null, data, [
      "code",
      "fullName",
      "kind",
      "aliases",
      "active",
    ]);
    await writeActivity(req, {
      id: office._id,
      name: office.code,
      resourceType: "office",
      action: "office_created",
      changes,
    });
    res.status(201).json(publicOffice(office));
  });

  router.patch("/offices/:id", requireAuth, adminOnly, async (req, res) => {
    assertId(req.params.id);
    const input = parse(officePatchSchema, req.body);
    const office = await findOfficeById(req.params.id);
    if (!office) throw notFound("Office");
    const before = office.toObject();
    const data = { ...input };
    if (data.aliases) data.aliases = normalizeAliases(data.aliases);
    await assertOfficeUnique(
      { code: office.code, aliases: data.aliases ?? office.aliases },
      office._id,
    );
    Object.assign(office, data);
    try {
      await office.save();
    } catch (error) {
      handleDuplicate(error, "code");
    }
    const fields = Object.keys(data);
    const changes = changesFor(before, office.toObject(), fields);
    const deactivated = before.active && office.active === false;
    await writeActivity(req, {
      id: office._id,
      name: office.code,
      resourceType: "office",
      action: deactivated ? "office_deactivated" : "office_updated",
      changes,
    });
    res.json(publicOffice(office));
  });

  router.get("/document-types", requireAuth, async (req, res) => {
    const query = parse(documentTypeQuerySchema, req.query);
    const filter = { active: query.active === "false" ? false : true };
    if (query.logbookType) filter.logbookTypes = query.logbookType;
    if (query.search?.trim()) {
      const search = new RegExp(escapeRegex(query.search.trim()), "i");
      filter.$or = [{ name: search }, { aliases: search }];
    }
    const [items, total] = await Promise.all([
      DocumentType.find(filter).sort({ name: 1 }).limit(200),
      DocumentType.countDocuments(filter),
    ]);
    res.json({ items: items.map(publicDocumentType), total });
  });

  router.get("/document-types/:id", requireAuth, async (req, res) => {
    assertId(req.params.id);
    const documentType = await findDocumentTypeById(req.params.id);
    if (!documentType) throw notFound("Document type");
    res.json(publicDocumentType(documentType));
  });

  router.post("/document-types", requireAuth, adminOnly, async (req, res) => {
    const input = parse(documentTypeCreateSchema, req.body);
    const data = {
      ...input,
      aliases: normalizeAliases(input.aliases),
      logbookTypes: [...new Set(input.logbookTypes)],
    };
    assertFieldRules(data.logbookTypes, data.fieldRules);
    await assertDocumentTypeUnique(data);
    let documentType;
    try {
      documentType = await DocumentType.create(data);
    } catch (error) {
      handleDuplicate(error, "name");
    }
    const changes = changesFor(null, data, [
      "name",
      "aliases",
      "logbookTypes",
      "fieldRules",
      "active",
    ]);
    await writeActivity(req, {
      id: documentType._id,
      name: documentType.name,
      resourceType: "documentType",
      action: "document_type_created",
      changes,
    });
    res.status(201).json(publicDocumentType(documentType));
  });

  router.patch(
    "/document-types/:id",
    requireAuth,
    adminOnly,
    async (req, res) => {
      assertId(req.params.id);
      const input = parse(documentTypePatchSchema, req.body);
      const documentType = await findDocumentTypeById(req.params.id);
      if (!documentType) throw notFound("Document type");
      const before = documentType.toObject();
      const data = { ...input };
      if (data.aliases) data.aliases = normalizeAliases(data.aliases);
      if (data.logbookTypes)
        data.logbookTypes = [...new Set(data.logbookTypes)];
      assertFieldRules(
        data.logbookTypes ?? documentType.logbookTypes,
        data.fieldRules ?? documentType.fieldRules ?? {},
      );
      await assertDocumentTypeUnique(
        {
          name: data.name ?? documentType.name,
          aliases: data.aliases ?? documentType.aliases,
        },
        documentType._id,
      );
      Object.assign(documentType, data);
      try {
        await documentType.save();
      } catch (error) {
        handleDuplicate(error, "name");
      }
      const changes = changesFor(
        before,
        documentType.toObject(),
        Object.keys(data),
      );
      const deactivated = before.active && documentType.active === false;
      await writeActivity(req, {
        id: documentType._id,
        name: documentType.name,
        resourceType: "documentType",
        action: deactivated
          ? "document_type_deactivated"
          : "document_type_updated",
        changes,
      });
      res.json(publicDocumentType(documentType));
    },
  );

  return router;
}
