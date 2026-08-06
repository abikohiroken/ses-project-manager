const EMPTY = "—";
const JST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatJstDateTime(value: Date | string | null | undefined): string {
  if (!value) return EMPTY;
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return EMPTY;
  const jst = new Date(instant.getTime() + JST_OFFSET_MILLISECONDS);
  return `${jst.getUTCFullYear()}/${pad(jst.getUTCMonth() + 1)}/${pad(jst.getUTCDate())} ${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`;
}

export function formatMonth(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return match ? `${match[1]}/${match[2]}` : EMPTY;
}

export function formatPrice(
  minimum: number | null | undefined,
  maximum: number | null | undefined,
): string {
  if (minimum != null && maximum != null) return `${minimum}〜${maximum}万円`;
  if (minimum != null) return `${minimum}万円〜`;
  if (maximum != null) return `〜${maximum}万円`;
  return EMPTY;
}

export function displayValue(value: string | number | null | undefined): string {
  if (value == null || (typeof value === "string" && value.trim() === "")) return EMPTY;
  return String(value);
}
