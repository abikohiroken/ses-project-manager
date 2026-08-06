import type { TextareaHTMLAttributes } from "react";

export function Textarea({
  id,
  label,
  error,
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <textarea
        id={id}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={Boolean(error)}
        className={`min-h-24 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 read-only:bg-slate-50 ${error ? "border-red-500" : "border-slate-300"} ${className}`}
        {...props}
      />
      {error ? (
        <span id={`${id}-error`} className="mt-1 block text-sm text-red-700" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
