const punctuation = /[^\p{L}\p{N}]+/gu;

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(punctuation, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function buildSearchText(
  parts: Array<string | undefined | null>,
): string {
  const present = parts.filter((part): part is string => Boolean(part));
  return [...new Set(present.map((part) => normalizeSearch(part)))]
    .join(' ')
    .trim();
}
