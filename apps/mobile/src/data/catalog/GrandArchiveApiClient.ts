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
  data?: GrandArchiveCard[];
  has_more?: boolean;
  page?: number;
  page_size?: number;
  total_cards?: number;
  total_pages?: number;
};

type WrappedValueResponse<T> = {
  value?: T[];
  Count?: number;
};

export type GrandArchiveApiClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
};

export class GrandArchiveApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(options: GrandArchiveApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? syncConfig.apiBaseUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent =
      options.userAgent ?? 'GrandArchiveCompanion/0.1 Phase01CatalogSync';
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
    const response = await this.get<CardsSearchResponse>('/cards/search', {
      page: String(page),
      page_size: String(pageSize),
    });

    return {
      data: response.data ?? [],
      hasMore: Boolean(response.has_more),
      page: response.page ?? page,
      pageSize: response.page_size ?? pageSize,
      totalCards: response.total_cards ?? response.data?.length ?? 0,
      totalPages: response.total_pages ?? page,
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
    const response = await this.get<WrappedValueResponse<GrandArchiveCard>>(
      '/cards/autocomplete',
      { name },
    );

    return response.value ?? [];
  }

  private async get<T>(path: string, params: Record<string, string> = {}) {
    const url = new URL(path, this.baseUrl);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await this.fetchImpl(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': this.userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Grand Archive API ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as T;
  }
}
