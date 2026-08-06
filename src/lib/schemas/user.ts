import { z } from "zod";

import { timestampSchema } from "@/lib/schemas/common";

export const userCreateSchema = z
  .object({
    email: z.string().email().max(254),
    name: z.string().trim().min(1).max(100),
    role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]),
  })
  .strict();

export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]).optional(),
    isActive: z.boolean().optional(),
    updatedAt: timestampSchema,
  })
  .strict();

export const userQuerySchema = z
  .object({
    isActive: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    sort: z
      .enum([
        "email:asc",
        "email:desc",
        "name:asc",
        "name:desc",
        "createdAt:desc",
        "createdAt:asc",
        "lastLoginAt:desc",
      ])
      .default("email:asc"),
  })
  .strict();

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
