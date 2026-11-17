import { z } from "zod";
import { LOGBOOK_TYPES, resolveFields } from "../shared/logbookTypes.js";
import { validationError } from "../utils/apiError.js";

const logbookTypeSchema = z.enum(Object.keys(LOGBOOK_TYPES));
const sourceSchema = z.enum(["manual", "ai"]);
const idSchema = z
  .string()
  .regex(/^[0-9a-f]{24}$/, "Expected a lowercase 24-character hexadecimal id.");
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24-hour).");

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 2000 || year > 2100) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function blankToUndefined(value) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

function optionalToUndefined(value) {
  return value === null ? undefined : blankToUndefined(value);
}

function nullablePatchValue(value, required, partial) {
  if (value === null) return required ? "" : undefined;
  return blankToUndefined(value);
}

function optionalFieldSchema(schema, required, partial) {
  const target = !required || partial ? schema.optional() : schema;
  return z.preprocess(
    (value) => nullablePatchValue(value, required, partial),
    target,
  );
}

function stringSchema(field, required, partial) {
  let schema = z.string().trim();
  if (field.key === "name") schema = schema.max(200);
  if (field.key === "particulars" || field.key === "remarks") {
    schema = schema.max(2000);
  }
  if (required) schema = schema.min(1, `${field.label} is required.`);
  return optionalFieldSchema(schema, required, partial);
}

function fieldSchema(field, required, partial) {
  switch (field.input) {
    case "text":
    case "textarea":
      return stringSchema(field, required, partial);
    case "date": {
      const schema = z
        .string()
        .refine(isRealDate, "Use a real date in YYYY-MM-DD format.");
      return optionalFieldSchema(schema, required, partial);
    }
    case "money": {
      const schema = z.number().int().min(0).max(99999999999);
      return optionalFieldSchema(schema, required, partial);
    }
    case "office":
    case "documentType": {
      const schema = idSchema;
      return optionalFieldSchema(schema, required, partial);
    }
    case "tracking": {
      const schema = z
        .object({
          status: z.enum(["received", "returned"]),
          returnedTime: z.preprocess(blankToUndefined, timeSchema.optional()),
        })
        .strict();
      return optionalFieldSchema(schema, required, partial);
    }
    default:
      return z.unknown().optional();
  }
}

export function buildEntrySchema(
  typeKey,
  { mode = "draft", partial = false, documentType } = {},
) {
  const config = LOGBOOK_TYPES[typeKey];
  if (!config) return null;
  const fields = resolveFields(typeKey, documentType);
  const rootShape = {
    logbookType: partial ? logbookTypeSchema.optional() : logbookTypeSchema,
    source: sourceSchema.optional(),
  };
  const detailsShape = {};
  for (const field of fields) {
    const coreRequired =
      ["entryDate", "name"].includes(field.key) ||
      (field.key === "officeId" && typeKey !== "permit_certification");
    const required = partial
      ? typeKey === "permit_certification"
        ? coreRequired
        : field.required || coreRequired
      : mode === "full"
        ? field.required
        : coreRequired;
    const schema = fieldSchema(field, required, partial);
    if (field.where === "details") detailsShape[field.key] = schema;
    else rootShape[field.key] = schema;
  }
  if (Object.keys(detailsShape).length) {
    const detailsRequired =
      !partial &&
      mode === "full" &&
      fields.some((field) => field.where === "details" && field.required);
    rootShape.details = detailsRequired
      ? z.preprocess((value) => value ?? {}, z.object(detailsShape).strict())
      : z.preprocess(
          optionalToUndefined,
          z.object(detailsShape).strict().optional(),
        );
  }
  return z.object(rootShape).strict();
}

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

function typeFromBody(body, fallback) {
  if (fallback && body?.logbookType === undefined) return fallback;
  const result = z
    .object({ logbookType: logbookTypeSchema })
    .passthrough()
    .safeParse(body);
  if (!result.success) throw validationError(result.error);
  return result.data.logbookType;
}

export function parseDraftInput(body, documentType) {
  const typeKey = typeFromBody(body);
  return parse(buildEntrySchema(typeKey, { documentType }), body);
}

export function parsePatchInput(body, currentType, documentType) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw validationError(z.object({}).safeParse(body).error);
  }
  const { version, ...payload } = body;
  if (!Number.isInteger(version) || version < 0) {
    throw validationError(
      z
        .object({ version: z.number().int().nonnegative() })
        .safeParse({ version }).error,
    );
  }
  const typeKey = typeFromBody(payload, currentType);
  const data = parse(
    buildEntrySchema(typeKey, { partial: true, documentType }),
    payload,
  );
  if (Object.keys(data).length === 0) {
    throw validationError(
      z.object({ change: z.string().min(1) }).safeParse({}).error,
    );
  }
  return { version, data, typeKey };
}

export function parseFullEntry(entry, documentType) {
  return parse(
    buildEntrySchema(entry.logbookType, { mode: "full", documentType }),
    entry,
  );
}

export function parseSubmitBody(body) {
  const schema = z.object({ version: z.number().int().nonnegative() }).strict();
  return parse(schema, body);
}

export { isRealDate };
