const punctuationPattern = /[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~]/g;
const whitespacePattern = /\s+/g;

export function normalizeSearchText(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/[-‐‑‒–—]/g, ' ')
    .replace(punctuationPattern, ' ')
    .toLowerCase()
    .replace(whitespacePattern, ' ')
    .trim();
}

export function normalizeName(value: string | null | undefined) {
  return normalizeSearchText(value);
}

export function normalizeFacet(value: string | null | undefined) {
  return normalizeSearchText(value).toUpperCase();
}

export function normalizeSetPrefix(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(whitespacePattern, ' ')
    .trim()
    .toUpperCase();
}

export function normalizeCollectorNumber(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[Oo]/g, '0')
    .replace(/[Il]/g, '1')
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase();
}

export function normalizeCollectorNumberForCompare(
  value: string | null | undefined,
) {
  const normalized = normalizeCollectorNumber(value);
  const trimmed = normalized.replace(/^0+/, '');

  return trimmed.length > 0 ? trimmed : '0';
}

export function normalizeCardType(value: string) {
  return normalizeSearchText(value);
}

export function uniqueNormalized(values: readonly string[]) {
  return [...new Set(values.map(normalizeFacet).filter(Boolean))];
}

export function buildSearchableText(parts: readonly unknown[]) {
  return normalizeSearchText(
    parts
      .flatMap((part) => {
        if (Array.isArray(part)) {
          return part;
        }

        return [part];
      })
      .filter((part) => part !== null && part !== undefined)
      .join(' '),
  );
}
