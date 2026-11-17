import { z } from "zod";

export const reviewerCommentSchema = z.object({
  comment: z.string().trim().min(1, "A reviewer comment is required."),
});