import { z } from "zod";
import { LOGBOOK_TYPES, resolveFields } from "../config/logbookTypes.js";

const DATE = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Use YYYY-MM-DD");
const TIME = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Use HH:mm (24-hour)");
const RULES = {
  text: z.string().trim(),
  textarea: z.string().trim(),
  date: DATE,
  money: z.number().int().nonnegative(),
  office: z.string().min(1),
  documentType: z.string().min(1),
  tracking: z.object({
    status: z.enum(["received", "returned"]),
    returnedTime: TIME.optional(),
  }),
};

export function buildSchema(typeKey, documentType) {
  const type = LOGBOOK_TYPES[typeKey];
  if (!type) throw new RangeError(`Unknown logbook type: ${typeKey}`);

  const shape = {};
  for (const field of resolveFields(typeKey, documentType)) {
    let rule = RULES[field.input];
    if (!rule) throw new Error(`Unsupported field input: ${field.input}`);

    if (
      field.required &&
      (field.input === "text" || field.input === "textarea")
    ) {
      rule = rule.min(1, `${field.label} is required`);
    }
    shape[field.key] = field.required ? rule : rule.optional();
  }

  return z.object(shape);
}
