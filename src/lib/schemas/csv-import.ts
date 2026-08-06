import { z } from "zod";

import { rangeDateTimeSchema, uuidSchema } from "@/lib/schemas/common";

export const csvImportQuerySchema = z
  .object({
    status: z
      .enum(["PENDING", "PROCESSING", "SUCCESS", "PARTIAL_SUCCESS", "ERROR", "SKIPPED"])
      .optional(),
    driveMoveStatus: z.enum(["PENDING", "MOVED", "MOVE_PENDING", "ERROR"]).optional(),
    fileName: z.string().optional(),
    batchId: z.string().optional(),
    importedFrom: rangeDateTimeSchema.optional(),
    importedTo: rangeDateTimeSchema.optional(),
    sort: z
      .enum(["importedAt:desc", "importedAt:asc", "createdAt:desc", "createdAt:asc"])
      .default("importedAt:desc"),
  })
  .strict();

export const csvImportDetailQuerySchema = z
  .object({ rawDataRowId: uuidSchema.optional() })
  .strict();

export type CsvImportQuery = z.infer<typeof csvImportQuerySchema>;
