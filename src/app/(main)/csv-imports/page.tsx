import Link from "next/link";

import { CsvImportDetailPanel } from "@/components/features/csv-import-detail-panel";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableContainer, Td, Th } from "@/components/ui/table";
import { requireRole } from "@/lib/api/guard";
import { parsePagination } from "@/lib/api/pagination";
import { parseQuery } from "@/lib/api/validation";
import { formatJstDateTime } from "@/lib/format/display";
import { csvImportQuerySchema } from "@/lib/schemas/csv-import";
import { getCsvImport, listCsvImports } from "@/lib/services/csv-import-service";
import { csvDisplayKind, type CsvDisplayKind } from "@/lib/ui/csv-display";
import { csvStatusLabels, driveMoveStatusLabels } from "@/lib/ui/labels";
import type { CsvImportDetailView } from "@/lib/ui/models";
import { firstSearchValue, toSearchRecord, toUrlSearchParams, type PageSearchParams } from "@/lib/ui/page-query";

const toneByKind: Record<CsvDisplayKind, BadgeTone> = {
  success: "green",
  info: "blue",
  warning: "amber",
  error: "red",
  neutral: "slate",
};

export default async function CsvImportsPage({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  await requireRole("ADMIN", "OPERATOR", "VIEWER");
  const raw = await searchParams;
  const params = toUrlSearchParams(raw);
  const page = parsePagination(params);
  const query = parseQuery(params, csvImportQuerySchema, ["page", "pageSize", "detail"]);
  const selectedId = firstSearchValue(raw.detail);
  const [result, selected] = await Promise.all([
    listCsvImports(query, page),
    selectedId ? getCsvImport(selectedId).catch(() => null) : Promise.resolve(null),
  ]);
  const selectedView: CsvImportDetailView | null = selected
    ? {
        id: selected.id,
        driveFileId: selected.driveFileId,
        fileHash: selected.fileHash,
        fileName: selected.fileName,
        schemaVersion: selected.schemaVersion,
        batchId: selected.batchId,
        status: selected.status,
        driveMoveStatus: selected.driveMoveStatus,
        totalRows: selected.totalRows,
        successRows: selected.successRows,
        failedRows: selected.failedRows,
        skippedRows: selected.skippedRows,
        importedAt: selected.importedAt?.toISOString() ?? null,
        errorCode: selected.errorCode,
        errorMessage: selected.errorMessage,
        duplicateOfImport: selected.duplicateOfImport
          ? {
              ...selected.duplicateOfImport,
              importedAt: selected.duplicateOfImport.importedAt?.toISOString() ?? null,
            }
          : null,
        rows: selected.rows.map((row) => ({
          id: row.id,
          rowNumber: row.rowNumber,
          receptionId: row.receptionId,
          status: row.status,
          errorCode: row.errorCode,
          errorMessage: row.errorMessage,
        })),
      }
    : null;
  const closeParams = new URLSearchParams(params);
  closeParams.delete("detail");
  const closeHref = closeParams.size ? `/csv-imports?${closeParams}` : "/csv-imports";

  return (
    <div className="mx-auto max-w-[100rem] space-y-6">
      <div><p className="text-sm font-semibold text-blue-700">SCR-006</p><h1 className="mt-1 text-2xl font-bold text-slate-950">CSV取込履歴</h1></div>
      <form className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 xl:grid-cols-4" method="get">
        <label className="text-sm font-medium text-slate-700">ステータス<select className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3" name="status" defaultValue={firstSearchValue(raw.status) ?? ""}><option value="">すべて</option>{Object.entries(csvStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">移動状態<select className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3" name="driveMoveStatus" defaultValue={firstSearchValue(raw.driveMoveStatus) ?? ""}><option value="">すべて</option>{Object.entries(driveMoveStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">ファイル名<input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" name="fileName" defaultValue={firstSearchValue(raw.fileName)} /></label>
        <label className="text-sm font-medium text-slate-700">batchId<input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" name="batchId" defaultValue={firstSearchValue(raw.batchId)} /></label>
        <label className="text-sm font-medium text-slate-700">取込日From<input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" type="date" name="importedFrom" defaultValue={firstSearchValue(raw.importedFrom)} /></label>
        <label className="text-sm font-medium text-slate-700">取込日To<input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3" type="date" name="importedTo" defaultValue={firstSearchValue(raw.importedTo)} /></label>
        <input type="hidden" name="sort" value="importedAt:desc" /><input type="hidden" name="pageSize" value="50" />
        <div className="flex items-end gap-2"><button className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white" type="submit">検索</button><Link className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold" href="/csv-imports">条件クリア</Link></div>
      </form>

      {result.data.length === 0 ? <EmptyState message="CSV取込履歴はありません。" /> : (
        <TableContainer><Table><thead><tr><Th>ファイル名</Th><Th>batchId</Th><Th>status</Th><Th>移動状態</Th><Th>総行数</Th><Th>成功</Th><Th>エラー</Th><Th>スキップ</Th><Th>取込日時</Th><Th>操作</Th></tr></thead><tbody className="divide-y divide-slate-100">
          {result.data.map((item) => {
            const kind = csvDisplayKind(item.status, item.errorCode, item.driveMoveStatus);
            const detailParams = new URLSearchParams(params); detailParams.set("detail", item.id);
            return <tr key={item.id} className="hover:bg-slate-50"><Td className="min-w-64 font-medium">{item.fileName}</Td><Td className="font-mono text-xs">{item.batchId ?? "—"}</Td><Td><Badge tone={toneByKind[kind]}>{csvStatusLabels[item.status] ?? item.status}</Badge></Td><Td>{item.driveMoveStatus === "MOVE_PENDING" ? <Badge tone="amber">⚠ {driveMoveStatusLabels[item.driveMoveStatus]}</Badge> : driveMoveStatusLabels[item.driveMoveStatus]}</Td><Td>{item.totalRows}</Td><Td>{item.successRows}</Td><Td>{item.failedRows}</Td><Td>{item.skippedRows}</Td><Td className="whitespace-nowrap">{formatJstDateTime(item.importedAt)}</Td><Td><Link className="font-semibold text-blue-700 hover:underline" href={`/csv-imports?${detailParams}`}>詳細</Link></Td></tr>;
          })}
        </tbody></Table></TableContainer>
      )}
      <Pagination basePath="/csv-imports" params={toSearchRecord(params, ["page", "detail"])} pagination={result.pagination} />
      {selectedId && !selectedView ? <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">指定された取込履歴が見つかりません。</p> : null}
      {selectedView ? <CsvImportDetailPanel detail={selectedView} closeHref={closeHref} /> : null}
    </div>
  );
}
