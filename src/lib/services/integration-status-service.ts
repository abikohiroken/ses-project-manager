import { toJstIso } from "@/lib/api/datetime";
import { getDriveStatus } from "@/lib/google/drive-status";
import { prisma } from "@/lib/prisma";

export async function getIntegrationStatus() {
  const [drive, latestImport, errorCount, partialSuccessCount, movePendingCount] =
    await Promise.all([
      getDriveStatus(),
      prisma.csvImport.findFirst({
        where: { importedAt: { not: null } },
        orderBy: { importedAt: "desc" },
        select: { importedAt: true },
      }),
      prisma.csvImport.count({ where: { status: "ERROR" } }),
      prisma.csvImport.count({ where: { status: "PARTIAL_SUCCESS" } }),
      prisma.csvImport.count({ where: { driveMoveStatus: "MOVE_PENDING" } }),
    ]);

  return {
    drive,
    imports: {
      lastImportedAt: toJstIso(latestImport?.importedAt ?? null),
      errorCount,
      partialSuccessCount,
      movePendingCount,
    },
  };
}
