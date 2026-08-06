import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableContainer, Td, Th } from "@/components/ui/table";
import { formatJstDateTime, formatMonth, formatPrice, displayValue } from "@/lib/format/display";
import { requireRole } from "@/lib/api/guard";
import { parsePagination } from "@/lib/api/pagination";
import { parseQuery } from "@/lib/api/validation";
import { intakeQuerySchema } from "@/lib/schemas/intake";
import { getIntegrationStatus } from "@/lib/services/integration-status-service";
import { listIntakes } from "@/lib/services/intake-service";
import { stringArray } from "@/lib/ui/business-fields";
import { firstSearchValue, toSearchRecord, toUrlSearchParams, type PageSearchParams } from "@/lib/ui/page-query";

export default async function ProjectIntakesPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  await requireRole("ADMIN", "OPERATOR", "VIEWER");
  const raw = await searchParams;
  const params = toUrlSearchParams(raw);
  const page = parsePagination(params);
  const query = parseQuery(params, intakeQuerySchema, ["page", "pageSize"]);
  const [result, integration] = await Promise.all([
    listIntakes(query, page),
    getIntegrationStatus().catch(() => null),
  ]);

  return (
    <div className="mx-auto max-w-[100rem] space-y-6">
      <div>
        <p className="text-sm font-semibold text-blue-700">SCR-002</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">確認待ち案件</h1>
      </div>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="連携状態">
        <div>
          <p className="text-xs text-slate-500">Drive接続</p>
          <div className="mt-1">
            <Badge tone={integration?.drive.connected ? "green" : "red"}>
              {integration?.drive.connected ? "正常" : "エラー"}
            </Badge>
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500">inbox</p>
          <p className="mt-1 font-semibold">{integration?.drive.inboxFiles ?? "—"}件</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">最終取込</p>
          <p className="mt-1 font-semibold">{formatJstDateTime(integration?.imports.lastImportedAt)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">取込エラー / 移動待ち</p>
          <p className="mt-1 font-semibold">
            {integration ? `${integration.imports.errorCount}件 / ${integration.imports.movePendingCount}件` : "—"}
          </p>
        </div>
      </section>

      <form className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 xl:grid-cols-4" method="get">
        <label className="text-sm font-medium text-slate-700">
          キーワード
          <input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" name="q" defaultValue={firstSearchValue(raw.q)} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          警告
          <select className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3" name="hasWarning" defaultValue={firstSearchValue(raw.hasWarning) ?? ""}>
            <option value="">すべて</option>
            <option value="true">あり</option>
            <option value="false">なし</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          送信元会社
          <input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" name="sourceCompany" defaultValue={firstSearchValue(raw.sourceCompany)} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          開始月
          <input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" type="month" name="startMonth" defaultValue={firstSearchValue(raw.startMonth)} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          受信日From
          <input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" type="date" name="receivedFrom" defaultValue={firstSearchValue(raw.receivedFrom)} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          受信日To
          <input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" type="date" name="receivedTo" defaultValue={firstSearchValue(raw.receivedTo)} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          表示状態
          <select className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3" name="reviewStatus" defaultValue={query.reviewStatus}>
            <option value="PENDING">確認待ち</option>
            <option value="REVIEWED">正式登録済み</option>
            <option value="MERGED">統合済み</option>
            <option value="REJECTED">対象外</option>
          </select>
        </label>
        <input type="hidden" name="sort" value="receivedAt:desc" />
        <input type="hidden" name="pageSize" value="50" />
        <div className="flex items-end gap-2">
          <button className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white" type="submit">検索</button>
          <Link className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold" href="/project-intakes">条件クリア</Link>
        </div>
      </form>

      {result.data.length === 0 ? (
        <EmptyState message="条件に一致する確認待ち案件はありません。" />
      ) : (
        <TableContainer>
          <Table>
            <thead><tr><Th>警告</Th><Th>受付ID</Th><Th>案件名</Th><Th>単価</Th><Th>開始月</Th><Th>勤務地</Th><Th>送信元</Th><Th>受信日時</Th><Th>操作</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {result.data.map((intake) => {
                const warnings = stringArray(intake.warningCodes);
                return (
                  <tr key={intake.id} className="hover:bg-slate-50">
                    <Td>{warnings.length > 0 ? <Badge tone="amber">⚠ {warnings.length}件</Badge> : <span>なし</span>}</Td>
                    <Td className="whitespace-nowrap font-mono text-xs">{intake.receptionId}</Td>
                    <Td className="min-w-64 font-medium text-slate-950">{intake.projectName || "案件名未設定"}</Td>
                    <Td className="whitespace-nowrap">{formatPrice(intake.unitPriceMinMan, intake.unitPriceMaxMan)}</Td>
                    <Td className="whitespace-nowrap">{formatMonth(intake.startMonth)}</Td>
                    <Td>{displayValue(intake.location)}</Td>
                    <Td>{displayValue(intake.sourceCompany)}</Td>
                    <Td className="whitespace-nowrap">{formatJstDateTime(intake.receivedAt)}</Td>
                    <Td><Link className="font-semibold text-blue-700 underline-offset-2 hover:underline" href={`/project-intakes/${intake.id}`}>確認</Link></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableContainer>
      )}
      <Pagination basePath="/project-intakes" params={toSearchRecord(params, ["page"])} pagination={result.pagination} />
    </div>
  );
}
