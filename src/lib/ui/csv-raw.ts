export function redactCsvRawText(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactCsvRawText);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      key === "raw_text" || key === "rawText" ? "（原文はこの画面では表示しません）" : redactCsvRawText(item),
    ]),
  );
}
