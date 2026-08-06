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
    <div className="min-h-screen">
      <header className="flex min-h-16 items-center justify-between bg-slate-900 px-6 py-3 text-white">
        <p className="font-bold">SES案件管理システム</p>
        <div className="flex items-center gap-4 text-sm">
          <span>{session.user.name ?? "—"}</span>
          <LogoutButton />
        </div>
      </header>
      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 md:grid-cols-[15rem_1fr]">
        <nav
          className="bg-white p-4 shadow-sm"
          aria-label="メインナビゲーション"
        >
          <ul className="space-y-1">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  className="block rounded px-3 py-2 text-sm font-medium"
                  href={item.href}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            {session.user.role === "ADMIN" ? (
              <li>
                <Link
                  className="block rounded px-3 py-2 text-sm font-medium"
                  href="/admin/users"
                >
                  ユーザー管理
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
