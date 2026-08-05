import { CatalogRepository } from '@/data/catalog/CatalogRepository';
import { GrandArchiveApiClient } from '@/data/catalog/GrandArchiveApiClient';
import { mapGrandArchiveCard } from '@/data/catalog/mapGrandArchiveCard';
import { CatalogCard } from '@/data/catalog/types';
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
const MAX_SCAN_CANDIDATES = 5;
const MAX_API_QUERIES = 4;

export type CardResolver = {
  resolveText(text: OcrCardText): Promise<ScanCandidate[]>;
};

export class OfflineCardResolver implements CardResolver {
  constructor(
    private readonly catalogRepository: CatalogRepository,
    private readonly options: {
      apiClient?: Pick<GrandArchiveApiClient, 'fetchAutocomplete'>;
    } = {},
  ) {}

  async resolveText(text: OcrCardText): Promise<ScanCandidate[]> {
    const exactFooter = await this.resolveFooter(text);

    if (exactFooter) {
      return [exactFooter];
    }

    const queries = buildResolverQueries(text);
    const candidatesByUuid = new Map<string, CandidateAccumulator>();

    for (const query of queries) {
      const exactName = await this.catalogRepository.getCardByNormalizedName(
        query.normalized,
      );

      if (exactName) {
        mergeCandidate(candidatesByUuid, exactName, {
          confidence: EXACT_NAME_CONFIDENCE,
          reasons: ['exact_name', ...query.reasons],
          query: query.normalized,
        });
      }

      const searchMatches = await this.findFuzzyCandidates(query.normalized);

      for (const match of searchMatches) {
        const score = scoreNameMatch(query.normalized, match.normalizedName);

        if (score < FUZZY_NAME_CONFIDENCE_FLOOR) {
          continue;
        }

        mergeCandidate(candidatesByUuid, match, {
          confidence: score,
          reasons: ['fuzzy_name', 'search_fallback', ...query.reasons],
          query: query.normalized,
        });
      }
    }

    await this.addApiCandidates(queries, candidatesByUuid);

    return [...candidatesByUuid.values()]
      .map(toScanCandidate)
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, MAX_SCAN_CANDIDATES);
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

  private async addApiCandidates(
    queries: ResolverQuery[],
    candidatesByUuid: Map<string, CandidateAccumulator>,
  ) {
    const apiClient = this.options.apiClient;

    if (!apiClient) {
      return;
    }

    try {
      for (const query of queries.slice(0, MAX_API_QUERIES)) {
        const cards = (await apiClient.fetchAutocomplete(query.text)).map(
          mapGrandArchiveCard,
        );

        if (cards.length === 0) {
          continue;
        }

        await this.catalogRepository.upsertCards(cards);

        for (const card of cards) {
          const score = Math.max(
            FUZZY_NAME_CONFIDENCE_FLOOR,
            scoreNameMatch(query.normalized, card.normalizedName),
          );

          mergeCandidate(candidatesByUuid, card, {
            confidence: Math.min(0.89, score),
            reasons: [
              'grand_archive_query',
              'grand_archive_result',
              ...query.reasons,
            ],
            query: query.normalized,
          });
        }
      }
    } catch {
      return;
    }
  }
}

type ResolverQuery = {
  normalized: string;
  reasons: string[];
  text: string;
};

type CandidateAccumulator = {
  card: CatalogCard;
  confidence: number;
  matchedQueries: Set<string>;
  reasons: Set<string>;
};

function buildResolverQueries(text: OcrCardText): ResolverQuery[] {
  const inputs: ResolverQuery[] = [];

  addResolverQuery(inputs, text.nameText, ['ocr_name_candidate']);

  for (const candidate of text.nameCandidates ?? []) {
    addResolverQuery(inputs, candidate, [
      candidate.includes(',') ? 'raw_line_candidate' : 'fragment_candidate',
    ]);
  }

  const seen = new Set<string>();

  return inputs.filter((query) => {
    if (seen.has(query.normalized)) {
      return false;
    }

    seen.add(query.normalized);
    return true;
  });
}

function addResolverQuery(
  queries: ResolverQuery[],
  value: string | null | undefined,
  reasons: string[],
) {
  const normalized = normalizeName(value);

  if (!normalized || normalized.length < 3) {
    return;
  }

  queries.push({
    normalized,
    reasons,
    text: String(value).trim(),
  });
}

function mergeCandidate(
  candidatesByUuid: Map<string, CandidateAccumulator>,
  card: CatalogCard,
  input: {
    confidence: number;
    query: string;
    reasons: string[];
  },
) {
  const existing = candidatesByUuid.get(card.uuid);

  if (!existing) {
    candidatesByUuid.set(card.uuid, {
      card,
      confidence: input.confidence,
      matchedQueries: new Set([input.query]),
      reasons: new Set(input.reasons),
    });
    return;
  }

  existing.card = card;
  existing.confidence = Math.max(existing.confidence, input.confidence);
  existing.matchedQueries.add(input.query);

  for (const reason of input.reasons) {
    existing.reasons.add(reason);
  }
}

function toScanCandidate(accumulator: CandidateAccumulator): ScanCandidate {
  const confidence = Math.min(
    0.97,
    accumulator.confidence + (accumulator.matchedQueries.size - 1) * 0.04,
  );
  const edition = accumulator.card.editions[0];

  return {
    cardLevel: parseNullableNumber(accumulator.card.level),
    cardName: accumulator.card.name,
    cardTypes: accumulator.card.types,
    cardUuid: accumulator.card.uuid,
    collectorNumber: edition?.collectorNumber,
    confidence,
    editionUuid: edition?.uuid,
    reason: [...accumulator.reasons],
    requiresConfirmation: true,
    setPrefix: edition?.setPrefix,
  };
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
