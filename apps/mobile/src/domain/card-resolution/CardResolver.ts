import { CatalogRepository } from '@/data/catalog/CatalogRepository';
import {
  normalizeCollectorNumber,
  normalizeName,
  normalizeSearchText,
  normalizeSetPrefix,
} from '@/data/catalog/normalization';

import { OcrCardText, ScanCandidate } from './types';

const EXACT_FOOTER_CONFIDENCE = 0.98;
const EXACT_NAME_CONFIDENCE = 0.9;
const FUZZY_NAME_CONFIDENCE_FLOOR = 0.62;

export type CardResolver = {
  resolveText(text: OcrCardText): Promise<ScanCandidate[]>;
};

export class OfflineCardResolver implements CardResolver {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  async resolveText(text: OcrCardText): Promise<ScanCandidate[]> {
    const exactFooter = await this.resolveFooter(text);

    if (exactFooter) {
      return [exactFooter];
    }

    const normalizedName = normalizeName(text.nameText);

    if (!normalizedName) {
      return [];
    }

    const exactName =
      await this.catalogRepository.getCardByNormalizedName(normalizedName);

    if (exactName) {
      return [
        {
          cardLevel: parseNullableNumber(exactName.level),
          cardName: exactName.name,
          cardTypes: exactName.types,
          cardUuid: exactName.uuid,
          confidence: EXACT_NAME_CONFIDENCE,
          reason: ['exact_name'],
          requiresConfirmation: true,
        },
      ];
    }

    const candidates = await this.findFuzzyCandidates(normalizedName);

    return candidates
      .map((candidate) => {
        const score = scoreNameMatch(normalizedName, candidate.normalizedName);

        return {
          cardLevel: parseNullableNumber(candidate.level),
          cardName: candidate.name,
          cardTypes: candidate.types,
          cardUuid: candidate.uuid,
          confidence: score,
          reason: ['fuzzy_name'],
          requiresConfirmation: true,
        };
      })
      .filter(
        (candidate) => candidate.confidence >= FUZZY_NAME_CONFIDENCE_FLOOR,
      )
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, 5);
  }

  private async findFuzzyCandidates(normalizedName: string) {
    const exactSearch = await this.catalogRepository.findNameCandidates(
      normalizedName,
      20,
    );

    if (exactSearch.length > 0) {
      return exactSearch;
    }

    const candidatesByUuid = new Map<string, (typeof exactSearch)[number]>();

    for (const term of normalizedName.split(/\s+/).filter(Boolean)) {
      const termMatches = await this.catalogRepository.findNameCandidates(
        term,
        20,
      );

      for (const candidate of termMatches) {
        candidatesByUuid.set(candidate.uuid, candidate);
      }
    }

    return [...candidatesByUuid.values()];
  }

  private async resolveFooter(text: OcrCardText) {
    const parsedFooter = parseEditionFooter(text);

    if (!parsedFooter) {
      return null;
    }

    const match = await this.catalogRepository.resolveEditionBySetCollector(
      parsedFooter.setPrefix,
      parsedFooter.collectorNumber,
    );

    if (!match) {
      return null;
    }

    return {
      cardLevel: parseNullableNumber(match.card.level),
      cardName: match.card.name,
      cardTypes: match.card.types,
      cardUuid: match.card.uuid,
      collectorNumber: match.edition.collectorNumber,
      confidence: EXACT_FOOTER_CONFIDENCE,
      editionUuid: match.edition.uuid,
      reason: ['exact_footer', 'offline_set_collector'],
      requiresConfirmation: false,
      setPrefix: match.edition.setPrefix,
    };
  }
}

export function parseEditionFooter(text: OcrCardText) {
  const explicitPrefix = normalizeSetPrefix(text.setPrefixText);
  const explicitCollector = normalizeCollectorNumber(text.collectorNumberText);

  if (explicitPrefix && explicitCollector) {
    return {
      collectorNumber: explicitCollector,
      setPrefix: explicitPrefix,
    };
  }

  const footer = normalizeFooterText(text.footerText);

  if (!footer) {
    return null;
  }

  const match = footer.match(
    /\b([A-Z][A-Z0-9+ -]{0,18}?)\s*[-# ]\s*([0-9OIL]{1,4}[A-Z]?)\b/,
  );

  if (!match) {
    return null;
  }

  return {
    collectorNumber: normalizeCollectorNumber(match[2]),
    setPrefix: normalizeSetPrefix(match[1]),
  };
}

export function scoreNameMatch(input: string, candidate: string) {
  const normalizedInput = normalizeSearchText(input);
  const normalizedCandidate = normalizeSearchText(candidate);

  if (!normalizedInput || !normalizedCandidate) {
    return 0;
  }

  if (normalizedCandidate.includes(normalizedInput)) {
    return Math.min(0.88, normalizedInput.length / normalizedCandidate.length);
  }

  const distance = levenshteinDistance(normalizedInput, normalizedCandidate);
  const maxLength = Math.max(
    normalizedInput.length,
    normalizedCandidate.length,
  );

  return Math.max(0, 1 - distance / maxLength);
}

function normalizeFooterText(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function parseNullableNumber(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
