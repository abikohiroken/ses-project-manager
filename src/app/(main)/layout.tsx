import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { LogoutButton } from "@/components/auth-buttons";

const navigation = [
  { label: "確認待ち案件", href: "/project-intakes" },
  { label: "正式案件", href: "/projects" },
  { label: "CSV取込履歴", href: "/csv-imports" },
];

export default async function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex min-h-16 items-center justify-between gap-4 bg-slate-950 px-4 py-3 text-white sm:px-6">
        <Link className="font-bold tracking-wide" href="/project-intakes">
          SES案件管理システム
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-slate-300 sm:inline">{session.user.name ?? "—"}</span>
          <LogoutButton />
        </div>
      </header>
      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-[15rem_1fr]">
        <nav
          className="border-b border-slate-200 bg-white px-3 py-2 shadow-sm lg:border-b-0 lg:border-r lg:p-4"
          aria-label="メインナビゲーション"
        >
          <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  href={item.href}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            {session.user.role === "ADMIN" ? (
              <li>
                <Link
                  className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  href="/admin/users"
                >
                  ユーザー管理
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
