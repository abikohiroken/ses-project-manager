"use client";

import { useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableContainer, Td, Th } from "@/components/ui/table";
import { apiRequest, errorMessage } from "@/lib/api/client";
import { displayValue, formatJstDateTime } from "@/lib/format/display";
import { redactCsvRawText } from "@/lib/ui/csv-raw";
import type { ApiDetailResponse, CsvImportDetailView } from "@/lib/ui/models";

export function CsvImportDetailPanel({ detail, closeHref }: { detail: CsvImportDetailView; closeHref: string }) {
  const [rawRowId, setRawRowId] = useState<string | null>(null);
  const [rawData, setRawData] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openRawData(rowId: string) {
    setPending(true);
    setError(null);
    try {
      const response = await apiRequest<ApiDetailResponse<CsvImportDetailView>>(
        `/api/csv-imports/${detail.id}?rawDataRowId=${encodeURIComponent(rowId)}`,
      );
      const row = response.data.rows.find((item) => item.id === rowId);
      setRawRowId(rowId);
      setRawData(redactCsvRawText(row?.rawData));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className="rounded-2xl border border-slate-300 bg-white p-5 shadow-xl sm:p-6" aria-labelledby="csv-detail-heading">
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-blue-700">取込詳細</p><h2 id="csv-detail-heading" className="mt-1 text-xl font-bold text-slate-950">{detail.fileName}</h2></div><Link className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" href={closeHref}>閉じる</Link></div>
      {error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-slate-500">DriveファイルID</dt><dd className="mt-1 break-all font-medium">{detail.driveFileId}</dd></div>
        <div><dt className="text-slate-500">fileHash</dt><dd className="mt-1 break-all font-mono text-xs">{displayValue(detail.fileHash)}</dd></div>
        <div><dt className="text-slate-500">schemaVersion</dt><dd className="mt-1 font-medium">{displayValue(detail.schemaVersion)}</dd></div>
        <div><dt className="text-slate-500">取込日時</dt><dd className="mt-1 font-medium">{formatJstDateTime(detail.importedAt)}</dd></div>
        <div><dt className="text-slate-500">errorCode / 終了理由</dt><dd className="mt-1 font-medium">{displayValue(detail.errorCode)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-500">errorMessage</dt><dd className="mt-1 font-medium">{displayValue(detail.errorMessage)}</dd></div>
        <div><dt className="text-slate-500">重複元取込</dt><dd className="mt-1 font-medium">{detail.duplicateOfImport?.fileName ?? "—"}</dd></div>
      </dl>
      <h3 className="mt-8 text-lg font-bold text-slate-900">行結果</h3>
      <div className="mt-3"><TableContainer><Table><thead><tr><Th>行</Th><Th>受付ID</Th><Th>状態</Th><Th>エラー</Th><Th>詳細</Th></tr></thead><tbody className="divide-y divide-slate-100">{detail.rows.map((row) => <tr key={row.id}><Td>{row.rowNumber}</Td><Td>{displayValue(row.receptionId)}</Td><Td><Badge tone={row.status === "ERROR" ? "red" : row.status === "SUCCESS" ? "green" : "slate"}>{row.status}</Badge></Td><Td><p>{displayValue(row.errorCode)}</p><p className="mt-1 text-xs text-slate-500">{displayValue(row.errorMessage)}</p></Td><Td>{row.status === "ERROR" ? <Button type="button" variant="secondary" disabled={pending} onClick={() => void openRawData(row.id)}>rawDataを表示</Button> : "—"}</Td></tr>)}</tbody></Table></TableContainer></div>
      {rawRowId ? <section className="mt-5 rounded-xl bg-slate-950 p-4 text-slate-100"><h3 className="text-sm font-bold">ERROR行 rawData</h3><p className="mt-1 text-xs text-slate-400">LINE原文（raw_text）は表示しません。</p><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(rawData, null, 2)}</pre></section> : null}
    </aside>
  );
}
