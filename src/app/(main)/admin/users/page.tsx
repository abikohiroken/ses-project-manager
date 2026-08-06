import { UserManager } from "@/components/features/user-manager";
import { Pagination } from "@/components/ui/pagination";
import { ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/guard";
import { parsePagination } from "@/lib/api/pagination";
import { parseQuery } from "@/lib/api/validation";
import { userQuerySchema } from "@/lib/schemas/user";
import { listUsers } from "@/lib/services/user-service";
import type { UserView } from "@/lib/ui/models";
import { toSearchRecord, toUrlSearchParams, type PageSearchParams } from "@/lib/ui/page-query";

export default async function UsersPage({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  try {
    await requireRole("ADMIN");
  } catch (error) {
    if (error instanceof ApiError && error.code === "FORBIDDEN") {
      return (
        <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-800" role="alert">
          <h1 className="text-xl font-bold">アクセスできません</h1>
          <p className="mt-2 text-sm">ユーザー管理は管理者のみ利用できます。</p>
        </div>
      );
    }
    throw error;
  }

  const raw = await searchParams;
  const params = toUrlSearchParams(raw);
  const page = parsePagination(params);
  const query = parseQuery(params, userQuerySchema, ["page", "pageSize"]);
  const result = await listUsers(query, page);
  const users: UserView[] = result.data.map((user) => ({
    ...user,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    updatedAt: user.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-[100rem] space-y-6">
      <div><p className="text-sm font-semibold text-blue-700">SCR-007</p><h1 className="mt-1 text-2xl font-bold text-slate-950">ユーザー管理</h1></div>
      <UserManager initialUsers={users} />
      <Pagination basePath="/admin/users" params={toSearchRecord(params, ["page"])} pagination={result.pagination} />
    </div>
  );
}
