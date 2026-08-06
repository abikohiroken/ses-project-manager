"use client";

import { useState } from "react";

export function TagInput({
  id,
  label,
  value,
  onChange,
  readOnly = false,
}: {
  id: string;
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function addDraft() {
    const tag = draft.trim();
    if (!tag || value.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <div className="rounded-lg border border-slate-300 bg-white p-2 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100">
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-800">
              {tag}
              {!readOnly ? (
                <button
                  type="button"
                  aria-label={`${tag}を削除`}
                  className="font-bold focus-visible:outline-2 focus-visible:outline-blue-700"
                  onClick={() => onChange(value.filter((item) => item !== tag))}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
        {!readOnly ? (
          <input
            id={id}
            className="mt-2 min-h-9 w-full border-0 px-1 text-sm outline-none"
            value={draft}
            placeholder="入力後にEnter"
            onBlur={addDraft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addDraft();
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
