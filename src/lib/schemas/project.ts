import { z } from "zod";

import {
  businessFields,
  monthSchema,
  timestampSchema,
  validMonthRange,
} from "@/lib/schemas/common";

export const projectUpdateSchema = z
  .object({
    updatedAt: timestampSchema,
    ...businessFields,
    projectName: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .refine(validMonthRange, {
    path: ["endMonth"],
    message: "終了月は開始月以降を指定してください。",
  });

export const projectStateSchema = z.object({ updatedAt: timestampSchema }).strict();

export const projectQuerySchema = z
  .object({
    q: z.string().optional(),
    projectStatus: z.enum(["OPEN", "ON_HOLD", "CLOSED", "ARCHIVED"]).optional(),
    startMonth: monthSchema.optional(),
    location: z.string().optional(),
    requiredSkill: z.string().optional(),
    preferredSkill: z.string().optional(),
    sort: z
      .enum([
        "updatedAt:desc",
        "updatedAt:asc",
        "projectName:asc",
        "projectName:desc",
        "startMonth:asc",
        "startMonth:desc",
        "projectCode:asc",
        "projectCode:desc",
      ])
      .default("updatedAt:desc"),
  })
  .strict();

export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type ProjectQuery = z.infer<typeof projectQuerySchema>;
