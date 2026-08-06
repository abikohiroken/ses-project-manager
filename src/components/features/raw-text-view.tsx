"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { tokenizeRawText } from "@/lib/format/raw-text";

export function RawTextView({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const segments = tokenizeRawText(text);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="max-h-[38rem] overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-5 font-mono text-sm leading-6 text-slate-100">
        {segments.map((segment, index) =>
          segment.kind === "link" ? (
            <a
              key={`${index}-${segment.href}`}
              className="text-sky-300 underline decoration-sky-500 underline-offset-2"
              href={segment.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {segment.text}
            </a>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </div>
      <Button className="mt-3" type="button" variant="secondary" onClick={copy}>
        {copied ? "コピーしました" : "原文をコピー"}
      </Button>
    </div>
  );
}
