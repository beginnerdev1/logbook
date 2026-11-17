import { z } from "zod";
import { ROLES } from "@/lib/permissions";

export const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().email("Enter a valid email address."),
  role: z.enum([ROLES.ADMIN, ROLES.USER]),
});

export function createEmptyUserValues() {
  return { name: "", email: "", role: ROLES.USER };
}