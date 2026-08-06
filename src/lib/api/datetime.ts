const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export function monthToDbDate(month: string): Date {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1));
}

export function dbDateToMonth(date: Date | null): string | null {
  if (!date) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function jstDayStartUtc(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - JST_OFFSET_MS);
}

export function jstDayEndUtc(ymd: string): Date {
  return new Date(jstDayStartUtc(ymd).getTime() + DAY_MS - 1);
}

export function rangeStart(value: string): Date {
  return DATE_ONLY_PATTERN.test(value) ? jstDayStartUtc(value) : new Date(value);
}

export function rangeEnd(value: string): Date {
  return DATE_ONLY_PATTERN.test(value) ? jstDayEndUtc(value) : new Date(value);
}

export function toJstIso(date: Date | null): string | null {
  if (!date) return null;
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return `${jst.toISOString().slice(0, -1)}+09:00`;
}

export function jstDateKey(date = new Date()): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10).replaceAll("-", "");
}
