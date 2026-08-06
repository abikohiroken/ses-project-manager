import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { LoginButton } from "@/components/auth-buttons";

const errorMessages: Record<string, string> = {
  NOT_REGISTERED: "このアカウントは利用登録されていません",
  INACTIVE: "このアカウントは無効です",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/project-intakes");

  const { error } = await searchParams;
  const errorCode = Array.isArray(error) ? error[0] : error;
  const errorMessage = errorCode
    ? (errorMessages[errorCode] ?? "ログインに失敗しました")
    : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-center text-2xl font-bold text-slate-900">
          SES案件管理システム
        </h1>
        <p className="mt-3 text-center text-sm text-slate-600">
          登録済みのGoogleアカウントでログインしてください
        </p>
        {errorMessage ? (
          <p
            className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-6">
          <LoginButton />
        </div>
      </section>
    </main>
  );
}
