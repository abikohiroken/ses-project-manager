import Link from "next/link";

import type { Pagination as PaginationData } from "@/lib/api/response";

function hrefFor(basePath: string, params: Record<string, string>, page: number): string {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `${basePath}?${next.toString()}`;
}

export function Pagination({
  basePath,
  params,
  pagination,
}: {
  basePath: string;
  params: Record<string, string>;
  pagination: PaginationData;
}) {
  if (pagination.totalPages <= 1) return null;
  const pages = Array.from({ length: pagination.totalPages }, (_, index) => index + 1).filter(
    (page) => Math.abs(page - pagination.page) <= 2 || page === 1 || page === pagination.totalPages,
  );

  return (
    <nav className="mt-5 flex flex-wrap items-center justify-center gap-2" aria-label="ページネーション">
      {pagination.page > 1 ? (
        <Link className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" href={hrefFor(basePath, params, pagination.page - 1)}>
          前へ
        </Link>
      ) : null}
      {pages.map((page, index) => (
        <span key={page} className="contents">
          {index > 0 && pages[index - 1] !== page - 1 ? <span aria-hidden="true">…</span> : null}
          <Link
            aria-current={page === pagination.page ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm ${page === pagination.page ? "bg-blue-700 font-semibold text-white" : "border border-slate-300 bg-white"}`}
            href={hrefFor(basePath, params, page)}
          >
            {page}
          </Link>
        </span>
      ))}
      {pagination.page < pagination.totalPages ? (
        <Link className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" href={hrefFor(basePath, params, pagination.page + 1)}>
          次へ
        </Link>
      ) : null}
    </nav>
  );
}
