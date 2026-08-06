import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableContainer, Td, Th } from "@/components/ui/table";
import { requireRole } from "@/lib/api/guard";
import { parsePagination } from "@/lib/api/pagination";
import { parseQuery } from "@/lib/api/validation";
import { displayValue, formatJstDateTime, formatMonth, formatPrice } from "@/lib/format/display";
import { projectQuerySchema } from "@/lib/schemas/project";
import { listProjects } from "@/lib/services/project-service";
import { stringArray } from "@/lib/ui/business-fields";
import { projectStatusLabels, projectStatusTone } from "@/lib/ui/labels";
import { firstSearchValue, toSearchRecord, toUrlSearchParams, type PageSearchParams } from "@/lib/ui/page-query";

const remoteLabels: Record<string, string> = { full: "フルリモート", hybrid: "ハイブリッド", onsite: "常駐", unknown: "不明" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  await requireRole("ADMIN", "OPERATOR", "VIEWER");
  const raw = await searchParams;
  const params = toUrlSearchParams(raw);
  const page = parsePagination(params);
  const query = parseQuery(params, projectQuerySchema, ["page", "pageSize"]);
  const result = await listProjects(query, page, { excludeArchived: !query.projectStatus });

  return (
    <div className="mx-auto max-w-[100rem] space-y-6">
      <div><p className="text-sm font-semibold text-blue-700">SCR-004</p><h1 className="mt-1 text-2xl font-bold text-slate-950">正式案件</h1></div>
      <form className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 xl:grid-cols-4" method="get">
        <label className="text-sm font-medium text-slate-700">キーワード<input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" name="q" defaultValue={firstSearchValue(raw.q)} /></label>
        <label className="text-sm font-medium text-slate-700">状態<select className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3" name="projectStatus" defaultValue={firstSearchValue(raw.projectStatus) ?? ""}><option value="">アーカイブ以外</option><option value="OPEN">募集中</option><option value="ON_HOLD">保留</option><option value="CLOSED">募集終了</option><option value="ARCHIVED">アーカイブ</option></select></label>
        <label className="text-sm font-medium text-slate-700">開始月<input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" type="month" name="startMonth" defaultValue={firstSearchValue(raw.startMonth)} /></label>
        <label className="text-sm font-medium text-slate-700">勤務地<input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" name="location" defaultValue={firstSearchValue(raw.location)} /></label>
        <label className="text-sm font-medium text-slate-700">必須スキル<input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" name="requiredSkill" defaultValue={firstSearchValue(raw.requiredSkill)} /></label>
        <label className="text-sm font-medium text-slate-700">尚可スキル<input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" name="preferredSkill" defaultValue={firstSearchValue(raw.preferredSkill)} /></label>
        <input type="hidden" name="sort" value="updatedAt:desc" /><input type="hidden" name="pageSize" value="50" />
        <div className="flex items-end gap-2"><button className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white" type="submit">検索</button><Link className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold" href="/projects">条件クリア</Link></div>
      </form>
      {result.data.length === 0 ? <EmptyState message="条件に一致する正式案件はありません。" /> : (
        <TableContainer><Table><thead><tr><Th>案件コード</Th><Th>案件名</Th><Th>状態</Th><Th>必須スキル</Th><Th>単価</Th><Th>開始月</Th><Th>勤務地</Th><Th>勤務形態</Th><Th>更新日時</Th><Th>操作</Th></tr></thead><tbody className="divide-y divide-slate-100">
          {result.data.map((project) => <tr key={project.id} className="hover:bg-slate-50"><Td className="whitespace-nowrap font-mono text-xs">{project.projectCode}</Td><Td className="min-w-64 font-medium text-slate-950">{project.projectName}</Td><Td><Badge tone={projectStatusTone(project.projectStatus)}>{projectStatusLabels[project.projectStatus]}</Badge></Td><Td className="min-w-48">{stringArray(project.requiredSkills).join("、") || "—"}</Td><Td className="whitespace-nowrap">{formatPrice(project.unitPriceMinMan, project.unitPriceMaxMan)}</Td><Td>{formatMonth(project.startMonth)}</Td><Td>{displayValue(project.location)}</Td><Td>{remoteLabels[project.remoteStyle ?? ""] ?? "—"}</Td><Td className="whitespace-nowrap">{formatJstDateTime(project.updatedAt)}</Td><Td><Link className="font-semibold text-blue-700 hover:underline" href={`/projects/${project.id}`}>詳細</Link></Td></tr>)}
        </tbody></Table></TableContainer>
      )}
      <Pagination basePath="/projects" params={toSearchRecord(params, ["page"])} pagination={result.pagination} />
    </div>
  );
}
