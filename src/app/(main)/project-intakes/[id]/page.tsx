import { notFound } from "next/navigation";

import { IntakeEditor } from "@/components/features/intake-editor";
import { ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/guard";
import { getIntake } from "@/lib/services/intake-service";
import { objectValue, stringArray, type BusinessValues } from "@/lib/ui/business-fields";
import { capabilitiesForRole } from "@/lib/ui/permissions";

export default async function ProjectIntakeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("ADMIN", "OPERATOR", "VIEWER");
  const { id } = await params;
  let intake: Awaited<ReturnType<typeof getIntake>>;
  try {
    intake = await getIntake(id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const fields: BusinessValues = {
    projectName: intake.projectName,
    projectSummary: intake.projectSummary,
    requiredSkills: stringArray(intake.requiredSkills),
    preferredSkills: stringArray(intake.preferredSkills),
    role: intake.role,
    process: intake.process,
    unitPriceMinMan: intake.unitPriceMinMan,
    unitPriceMaxMan: intake.unitPriceMaxMan,
    settlementRange: intake.settlementRange,
    startMonth: intake.startMonth,
    endMonth: intake.endMonth,
    workDaysPerWeek: intake.workDaysPerWeek,
    location: intake.location,
    nearestStation: intake.nearestStation,
    remoteStyle: intake.remoteStyle,
    remoteNote: intake.remoteNote,
    recruitmentCount: intake.recruitmentCount,
    commercialFlow: intake.commercialFlow,
    interviewCount: intake.interviewCount,
    foreignerAllowed: intake.foreignerAllowed,
    ageLimit: intake.ageLimit,
    nationalityNote: intake.nationalityNote,
    employmentCondition: intake.employmentCondition,
  };
  const canEdit = capabilitiesForRole(user.role).canEditProjects && intake.reviewStatus === "PENDING";

  return (
    <IntakeEditor
      canEdit={canEdit}
      intake={{
        ...fields,
        id: intake.id,
        receptionId: intake.receptionId,
        reviewStatus: intake.reviewStatus,
        warningCodes: stringArray(intake.warningCodes),
        receivedAt: intake.receivedAt.toISOString(),
        updatedAt: intake.updatedAt.toISOString(),
        aiSnapshot: objectValue(intake.aiSnapshot),
        source: intake.source
          ? {
              sourceCompany: intake.source.sourceCompany,
              sourceContact: intake.source.sourceContact,
              rawText: intake.source.rawText,
              receivedAt: intake.source.receivedAt.toISOString(),
            }
          : null,
      }}
    />
  );
}
