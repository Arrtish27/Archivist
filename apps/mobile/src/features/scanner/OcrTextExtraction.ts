import { OcrCardText } from '@/domain/card-resolution/types';

import { OcrTextLine, StillImageOcrResult } from './NativeOcrService';

const FALLBACK_FOOTER_LINE_COUNT = 4;

export function buildOcrCardText(result: StillImageOcrResult): OcrCardText {
  const lines = getReadableLines(result.lines);
  const footerText = getLikelyFooterText(lines, result.rawText);
  const explicitFooter = parseExplicitFooter(footerText);
  const nameText = getLikelyNameText(lines, result.rawText);
  const rawLines = result.rawText.split(/\r?\n/);

  return {
    collectorNumberText: explicitFooter?.collectorNumberText,
    footerText,
    nameCandidates: buildOcrNameCandidates([
      nameText,
      ...lines.map((line) => line.text),
      ...rawLines,
    ]),
    nameText,
    setPrefixText: explicitFooter?.setPrefixText,
  };
}

export function getReadableLines(lines: OcrTextLine[]) {
  return lines
    .map((line) => ({
      ...line,
      text: line.text.replace(/\s+/g, ' ').trim(),
    }))
    .filter((line) => line.text.length > 0);
}

function getLikelyNameText(lines: OcrTextLine[], rawText: string) {
  const framedLines = lines.filter((line) => line.frame);

  if (framedLines.length > 1) {
    const bounds = getVerticalBounds(framedLines);
    const nameRegionBottom = bounds.top + bounds.height * 0.45;
    const candidate = sortByTop(framedLines).find(
      (line) =>
        line.frame &&
        line.frame.top <= nameRegionBottom &&
        !looksLikeFooter(line.text),
    );

    if (candidate) {
      return candidate.text;
    }
  }

  return lines.find((line) => !looksLikeFooter(line.text))?.text ?? rawText;
}

function getLikelyFooterText(lines: OcrTextLine[], rawText: string) {
  const framedLines = lines.filter((line) => line.frame);

  if (framedLines.length > 1) {
    const bounds = getVerticalBounds(framedLines);
    const footerRegionTop = bounds.top + bounds.height * 0.6;
    const footerLines = sortByTop(framedLines).filter(
      (line) => line.frame && line.frame.top >= footerRegionTop,
    );

    if (footerLines.length > 0) {
      return footerLines.map((line) => line.text).join(' ');
    }
  }

  if (lines.length > 0) {
    return lines
      .slice(-FALLBACK_FOOTER_LINE_COUNT)
      .map((line) => line.text)
      .join(' ');
  }

  return rawText;
}

function getVerticalBounds(lines: OcrTextLine[]) {
  const top = Math.min(...lines.map((line) => line.frame?.top ?? 0));
  const bottom = Math.max(
    ...lines.map((line) => {
      const frame = line.frame;
      return frame ? frame.top + frame.height : 0;
    }),
  );

  return {
    height: bottom - top,
    top,
  };
}

function sortByTop(lines: OcrTextLine[]) {
  return [...lines].sort(
    (left, right) => (left.frame?.top ?? 0) - (right.frame?.top ?? 0),
  );
}

function looksLikeFooter(value: string) {
  return /\b[A-Z][A-Z0-9]{1,8}\s*[-# ]\s*[0-9OIL]{1,4}[A-Z]?\b/i.test(value);
}

function parseExplicitFooter(value: string) {
  const match = value.match(
    /\b([A-Z][A-Z0-9]{1,8})\s*[-# ]\s*([0-9OIL]{1,4}[A-Z]?)\b/i,
  );

  if (!match) {
    return null;
  }

  return {
    collectorNumberText: match[2],
    setPrefixText: match[1],
  };
}

export function buildOcrNameCandidates(values: readonly string[]) {
  const candidates: string[] = [];

  for (const value of values) {
    const cleaned = cleanOcrNameCandidate(value);

    if (!cleaned) {
      continue;
    }

    candidates.push(cleaned);

    const commaParts = cleaned.split(',');

    if (commaParts.length > 1) {
      candidates.push(commaParts.slice(1).join(',').trim());
    }

    if (/\blineage\b/i.test(cleaned)) {
      candidates.push(cleaned.replace(/\blineage\b/gi, '').trim());
    }
  }

  return uniqueCandidates(candidates).slice(0, 12);
}

function cleanOcrNameCandidate(value: string | null | undefined) {
  const cleaned = String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^\s*(?:lv\.?|level)\s*[0-9oOIlS]*\s*/i, '')
    .replace(/^\s*[0-9oOIlS]+\s+/, '')
    .trim()
    .replace(/^[^A-Za-z']+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    !cleaned ||
    cleaned.length < 3 ||
    /^(?:cost|champion|tamer|on enter|level|lv\.?|thering)\b/i.test(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function uniqueCandidates(values: readonly string[]) {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const value of values) {
    const key = value.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(value);
  }

  return results;
}
