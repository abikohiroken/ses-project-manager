import { notFound } from "next/navigation";

import { ProjectEditor } from "@/components/features/project-editor";
import { RawTextView } from "@/components/features/raw-text-view";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/guard";
import { displayValue, formatJstDateTime } from "@/lib/format/display";
import { getProject } from "@/lib/services/project-service";
import { stringArray, type BusinessValues } from "@/lib/ui/business-fields";
import { reviewStatusLabels } from "@/lib/ui/labels";
import { capabilitiesForRole } from "@/lib/ui/permissions";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("ADMIN", "OPERATOR", "VIEWER");
  const { id } = await params;
  let project: Awaited<ReturnType<typeof getProject>>;
  try {
    project = await getProject(id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const fields: BusinessValues = {
    projectName: project.projectName,
    projectSummary: project.projectSummary,
    requiredSkills: stringArray(project.requiredSkills),
    preferredSkills: stringArray(project.preferredSkills),
    role: project.role,
    process: project.process,
    unitPriceMinMan: project.unitPriceMinMan,
    unitPriceMaxMan: project.unitPriceMaxMan,
    settlementRange: project.settlementRange,
    startMonth: project.startMonth,
    endMonth: project.endMonth,
    workDaysPerWeek: project.workDaysPerWeek,
    location: project.location,
    nearestStation: project.nearestStation,
    remoteStyle: project.remoteStyle,
    remoteNote: project.remoteNote,
    recruitmentCount: project.recruitmentCount,
    commercialFlow: project.commercialFlow,
    interviewCount: project.interviewCount,
    foreignerAllowed: project.foreignerAllowed,
    ageLimit: project.ageLimit,
    nationalityNote: project.nationalityNote,
    employmentCondition: project.employmentCondition,
  };
  const intakeById = new Map(project.linkedIntakes.map((intake) => [intake.id, intake]));
  const canEdit = capabilitiesForRole(user.role).canEditProjects && project.projectStatus !== "ARCHIVED";

  return (
    <div className="mx-auto max-w-[100rem] space-y-8">
      <ProjectEditor
        canEdit={canEdit}
        project={{
          ...fields,
          id: project.id,
          projectCode: project.projectCode,
          projectStatus: project.projectStatus,
          updatedAt: project.updatedAt.toISOString(),
        }}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-xl font-bold text-slate-950">関連LINE原文</h2>
        <div className="mt-5 space-y-5">
          {project.sources.length === 0 ? <p className="text-sm text-slate-500">関連する原文はありません。</p> : project.sources.map((source) => {
            const intake = intakeById.get(source.projectIntakeId);
            return (
              <article key={source.id} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
                  <span>{formatJstDateTime(source.receivedAt)}</span>
                  <span>{displayValue(source.sourceCompany)}</span>
                  {intake ? <Badge tone="blue">{reviewStatusLabels[intake.reviewStatus] ?? intake.reviewStatus}</Badge> : null}
                </div>
                <RawTextView text={source.rawText} />
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-xl font-bold text-slate-950">取込元情報</h2>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-slate-500">作成者</dt><dd className="mt-1 font-medium">{project.createdBy.name} ({project.createdBy.email})</dd></div>
          <div><dt className="text-slate-500">更新者</dt><dd className="mt-1 font-medium">{project.updatedBy ? `${project.updatedBy.name} (${project.updatedBy.email})` : "—"}</dd></div>
          <div><dt className="text-slate-500">作成日時</dt><dd className="mt-1 font-medium">{formatJstDateTime(project.createdAt)}</dd></div>
          <div><dt className="text-slate-500">更新日時</dt><dd className="mt-1 font-medium">{formatJstDateTime(project.updatedAt)}</dd></div>
          <div><dt className="text-slate-500">関連原文</dt><dd className="mt-1 font-medium">{project.sources.length}件</dd></div>
        </dl>
      </section>
    </div>
  );
}
