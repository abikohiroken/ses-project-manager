"use client";

import { signIn, signOut } from "next-auth/react";
import { useState } from "react";

export function LoginButton() {
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      type="button"
      className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
      disabled={isPending}
      onClick={async () => {
        setIsPending(true);
        try {
          await signIn("google", { callbackUrl: "/project-intakes" });
        } finally {
          setIsPending(false);
        }
      }}
    >
      {isPending ? "処理中..." : "Googleでログイン"}
    </button>
  );
}

export function LogoutButton() {
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      type="button"
      className="rounded border border-white/50 px-3 py-1.5"
      disabled={isPending}
      onClick={async () => {
        setIsPending(true);
        try {
          await signOut({ callbackUrl: "/login" });
        } finally {
          setIsPending(false);
        }
      }}
    >
      {isPending ? "処理中..." : "ログアウト"}
    </button>
  );
}
