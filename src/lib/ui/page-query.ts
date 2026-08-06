export type PageSearchParams = Record<string, string | string[] | undefined>;

export function firstSearchValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function toUrlSearchParams(value: PageSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, item] of Object.entries(value)) {
    const first = firstSearchValue(item);
    if (first !== undefined && first !== "") params.set(key, first);
  }
  return params;
}

export function toSearchRecord(params: URLSearchParams, omitted: readonly string[] = []): Record<string, string> {
  return Object.fromEntries([...params.entries()].filter(([key]) => !omitted.includes(key)));
}
