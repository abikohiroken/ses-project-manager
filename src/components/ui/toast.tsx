"use client";

import { useEffect } from "react";

export function Toast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, 3500);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div className="fixed right-4 top-4 z-50 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-lg" role="status">
      {message}
    </div>
  );
}
