export type RawTextSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

const URL_END_CHARACTERS = new Set([
  ".",
  ",",
  "、",
  "。",
  "!",
  "！",
  "?",
  "？",
  ";",
  "；",
  ")",
  "]",
  "}",
  "】",
  "」",
  "』",
]);

function schemeLengthAt(text: string, index: number): number {
  const rest = text.slice(index).toLowerCase();
  if (rest.startsWith("https://")) return 8;
  if (rest.startsWith("http://")) return 7;
  return 0;
}

function isUrlDelimiter(character: string): boolean {
  return /\s/u.test(character) || character === "<" || character === ">" || character === '"' || character === "'";
}

export function safeHttpHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export function tokenizeRawText(text: string): RawTextSegment[] {
  const segments: RawTextSegment[] = [];
  let plainStart = 0;
  let index = 0;

  while (index < text.length) {
    const schemeLength = schemeLengthAt(text, index);
    if (schemeLength === 0) {
      index += 1;
      continue;
    }

    let end = index + schemeLength;
    while (end < text.length && !isUrlDelimiter(text[end])) end += 1;

    let linkEnd = end;
    while (linkEnd > index && URL_END_CHARACTERS.has(text[linkEnd - 1])) linkEnd -= 1;
    const candidate = text.slice(index, linkEnd);
    const href = safeHttpHref(candidate);
    if (!href) {
      index += schemeLength;
      continue;
    }

    if (plainStart < index) {
      segments.push({ kind: "text", text: text.slice(plainStart, index) });
    }
    segments.push({ kind: "link", text: candidate, href });
    plainStart = linkEnd;
    index = end;
  }

  if (plainStart < text.length) {
    segments.push({ kind: "text", text: text.slice(plainStart) });
  }
  return segments;
}
