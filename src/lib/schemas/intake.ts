import { z } from "zod";

import {
  businessFields,
  monthSchema,
  rangeDateTimeSchema,
  timestampSchema,
  uuidSchema,
  validMonthRange,
} from "@/lib/schemas/common";

export const intakeUpdateSchema = z
  .object({ updatedAt: timestampSchema, ...businessFields })
  .strict()
  .refine(validMonthRange, {
    path: ["endMonth"],
    message: "終了月は開始月以降を指定してください。",
  });

export const createProjectSchema = z
  .object({ updatedAt: timestampSchema, projectStatus: z.literal("OPEN") })
  .strict();

export const rejectIntakeSchema = z.object({ updatedAt: timestampSchema }).strict();

export const mergeFields = [
  "projectName",
  "projectSummary",
  "requiredSkills",
  "preferredSkills",
  "role",
  "process",
  "unitPriceMinMan",
  "unitPriceMaxMan",
  "settlementRange",
  "startMonth",
  "endMonth",
  "workDaysPerWeek",
  "location",
  "nearestStation",
  "remoteStyle",
  "remoteNote",
  "recruitmentCount",
  "commercialFlow",
  "interviewCount",
  "foreignerAllowed",
  "ageLimit",
  "nationalityNote",
  "employmentCondition",
] as const;

export const mergeIntakeSchema = z
  .object({
    updatedAt: timestampSchema,
    targetProjectId: uuidSchema,
    targetProjectUpdatedAt: timestampSchema,
    applyFields: z.array(z.enum(mergeFields)),
  })
  .strict();

export const intakeQuerySchema = z
  .object({
    reviewStatus: z
      .enum(["PENDING", "REVIEWED", "MERGED", "REJECTED"])
      .default("PENDING"),
    q: z.string().optional(),
    hasWarning: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    sourceCompany: z.string().optional(),
    receivedFrom: rangeDateTimeSchema.optional(),
    receivedTo: rangeDateTimeSchema.optional(),
    startMonth: monthSchema.optional(),
    sort: z
      .enum([
        "receivedAt:desc",
        "receivedAt:asc",
        "updatedAt:desc",
        "updatedAt:asc",
        "projectName:asc",
        "projectName:desc",
        "startMonth:asc",
        "startMonth:desc",
      ])
      .default("receivedAt:desc"),
  })
  .strict();

export type IntakeUpdateInput = z.infer<typeof intakeUpdateSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type MergeIntakeInput = z.infer<typeof mergeIntakeSchema>;
export type IntakeQuery = z.infer<typeof intakeQuerySchema>;
