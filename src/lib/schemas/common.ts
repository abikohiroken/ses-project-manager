import { z } from "zod";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export const uuidSchema = z.string().uuid();
export const timestampSchema = z.string().datetime({ offset: true });
export const monthSchema = z.string().regex(monthPattern, "YYYY-MM形式で指定してください。");
export const rangeDateTimeSchema = z.string().refine(
  (value) => datePattern.test(value) || timestampSchema.safeParse(value).success,
  "YYYY-MM-DDまたはオフセット付きISO 8601日時を指定してください。",
);

export const businessFields = {
  projectName: z.string().max(255).nullable().optional(),
  projectSummary: z.string().nullable().optional(),
  requiredSkills: z.array(z.string()).optional(),
  preferredSkills: z.array(z.string()).optional(),
  role: z.string().max(100).nullable().optional(),
  process: z.string().max(255).nullable().optional(),
  unitPriceMinMan: z.number().int().min(0).nullable().optional(),
  unitPriceMaxMan: z.number().int().min(0).nullable().optional(),
  settlementRange: z.string().max(100).nullable().optional(),
  startMonth: monthSchema.nullable().optional(),
  endMonth: monthSchema.nullable().optional(),
  workDaysPerWeek: z.number().int().min(1).max(7).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  nearestStation: z.string().max(255).nullable().optional(),
  remoteStyle: z
    .enum(["full", "hybrid", "onsite", "unknown"])
    .nullable()
    .optional(),
  remoteNote: z.string().nullable().optional(),
  recruitmentCount: z.number().int().min(1).nullable().optional(),
  commercialFlow: z.string().nullable().optional(),
  interviewCount: z.number().int().min(0).nullable().optional(),
  foreignerAllowed: z
    .enum(["allowed", "not_allowed", "conditional", "unknown"])
    .nullable()
    .optional(),
  ageLimit: z.string().max(100).nullable().optional(),
  nationalityNote: z.string().nullable().optional(),
  employmentCondition: z.string().nullable().optional(),
};

export function validMonthRange<T extends { startMonth?: string | null; endMonth?: string | null }>(
  value: T,
): boolean {
  return !value.startMonth || !value.endMonth || value.startMonth <= value.endMonth;
}
