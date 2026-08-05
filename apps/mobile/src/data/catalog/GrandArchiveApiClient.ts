import { syncConfig } from '../sync/config';

export type GrandArchiveListCard = {
  name: string;
  slug: string;
  uuid: string;
};

export type GrandArchiveSet = {
  name?: string;
  prefix?: string;
  language?: string;
  release_date?: string;
};

export type GrandArchiveEdition = {
  uuid: string;
  card_id?: string;
  slug?: string;
  set?: GrandArchiveSet;
  collector_number?: string;
  rarity?: number | null;
  language?: string | null;
  image?: string | null;
  release_date?: string | null;
  last_update?: string | null;
  effect_raw?: string | null;
  flavor?: string | null;
};

export type GrandArchiveCard = {
  uuid: string;
  slug: string;
  name: string;
  cost?: {
    type?: string | null;
    value?: string | number | null;
  } | null;
  level?: string | number | null;
  power?: string | number | null;
  life?: string | number | null;
  durability?: string | number | null;
  speed?: string | number | null;
  effect_raw?: string | null;
  flavor?: string | null;
  last_update?: string | null;
  types?: string[];
  subtypes?: string[];
  classes?: string[];
  elements?: string[];
  editions?: GrandArchiveEdition[];
  result_editions?: GrandArchiveEdition[];
};

export type GrandArchiveCardsPage = {
  data: GrandArchiveCard[];
  hasMore: boolean;
  page: number;
  pageSize: number;
  totalCards: number;
  totalPages: number;
};

type CardsSearchResponse = {
  cards?: GrandArchiveCard[];
  data?: GrandArchiveCard[];
  has_more?: boolean;
  paginated_cards_count?: number;
  page?: number;
  page_size?: number;
  results?: GrandArchiveCard[];
  total_cards?: number;
  total_pages?: number;
  value?: GrandArchiveCard[];
};

type WrappedValueResponse<T> = {
  value?: T[];
  Count?: number;
};

export type GrandArchiveApiClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
};

export class GrandArchiveApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(options: GrandArchiveApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? syncConfig.apiBaseUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 6000;
    this.userAgent = options.userAgent ?? 'Archivist/0.1 Phase01CatalogSync';
  }

  async fetchAllCards() {
    const response =
      await this.get<WrappedValueResponse<GrandArchiveListCard>>('/cards/all');

    return {
      cards: response.value ?? [],
      count: response.Count ?? response.value?.length ?? 0,
    };
  }

  async fetchCardsPage({
    page,
    pageSize = syncConfig.catalogBatchSize,
  }: {
    page: number;
    pageSize?: number;
  }): Promise<GrandArchiveCardsPage> {
    const response = await this.get<CardsSearchResponse | GrandArchiveCard[]>(
      '/cards/search',
      {
        page: String(page),
        page_size: String(pageSize),
      },
    );
    const data = extractGrandArchiveCards(response);
    const responseRecord = isRecord(response) ? response : {};

    return {
      data,
      hasMore: Boolean(responseRecord.has_more),
      page: toNumber(responseRecord.page) ?? page,
      pageSize: toNumber(responseRecord.page_size) ?? pageSize,
      totalCards:
        toNumber(responseRecord.total_cards) ??
        toNumber(responseRecord.paginated_cards_count) ??
        data.length,
      totalPages: toNumber(responseRecord.total_pages) ?? page,
    };
  }

  async fetchCardBySlug(slug: string) {
    return this.get<GrandArchiveCard>(`/cards/${encodeURIComponent(slug)}`);
  }

  async fetchCardByEdition(setPrefix: string, collectorNumber: string) {
    return this.get<GrandArchiveCard>(
      `/cards/${encodeURIComponent(setPrefix)}/${encodeURIComponent(
        collectorNumber,
      )}`,
    );
  }

  async fetchAutocomplete(name: string) {
    const response = await this.get<
      WrappedValueResponse<GrandArchiveCard> | GrandArchiveCard[]
    >('/cards/autocomplete', { name });

    return extractGrandArchiveCards(response);
  }

  async searchCardsByName({
    name,
    page = 1,
    pageSize = 20,
  }: {
    name: string;
    page?: number;
    pageSize?: number;
  }) {
    const response = await this.get<CardsSearchResponse | GrandArchiveCard[]>(
      '/cards/search',
      {
        name,
        page: String(page),
        page_size: String(pageSize),
      },
    );

    return extractGrandArchiveCards(response);
  }

  private async get<T>(path: string, params: Record<string, string> = {}) {
    const url = new URL(path, this.baseUrl);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs);

    let response: Response;

    try {
      response = await this.fetchImpl(url.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': this.userAgent,
        },
        signal: abortController.signal,
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error(
          `Grand Archive API request timed out after ${this.timeoutMs}ms`,
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(
        `Grand Archive API ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as T;
  }
}

function extractGrandArchiveCards(response: unknown): GrandArchiveCard[] {
  if (Array.isArray(response)) {
    return response.filter(isGrandArchiveCard);
  }

  if (!isRecord(response)) {
    return [];
  }

  for (const key of ['data', 'value', 'cards', 'results'] as const) {
    const value = response[key];

    if (Array.isArray(value)) {
      return value.filter(isGrandArchiveCard);
    }
  }

  return [];
}

function isGrandArchiveCard(value: unknown): value is GrandArchiveCard {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.uuid === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}
