import { CatalogRepository } from './CatalogRepository';
import {
  GrandArchiveApiClient,
  GrandArchiveApiClientOptions,
} from './GrandArchiveApiClient';
import { mapGrandArchiveCard } from './mapGrandArchiveCard';
import {
  normalizeCardType,
  normalizeFacet,
  normalizeSearchText,
  normalizeSetPrefix,
} from './normalization';
import { syncCatalog, CatalogSyncOptions } from './CatalogSyncService';
import {
  CatalogCard,
  CatalogCardSearchFilters,
  CatalogEditionMatch,
  CatalogSyncResult,
  CatalogSyncState,
} from './types';

export type CatalogService = {
  initialize(): Promise<void>;
  getSyncStatus(): Promise<CatalogSyncState>;
  sync(options?: CatalogSyncOptions): Promise<CatalogSyncResult>;
  getCard(cardUuid: string): Promise<CatalogCard | null>;
  searchCards(filters?: CatalogCardSearchFilters): Promise<CatalogCard[]>;
  resolveEdition(
    setPrefix: string,
    collectorNumber: string,
  ): Promise<CatalogEditionMatch | null>;
};

export type CatalogServiceDependencies = {
  repository: CatalogRepository;
  apiClient: GrandArchiveApiClient;
};

export function createCatalogService({
  apiClient,
  repository,
}: CatalogServiceDependencies): CatalogService {
  return {
    async getSyncStatus() {
      return repository.getSyncState();
    },
    async initialize() {
      await repository.initialize();
    },
    async getCard(cardUuid) {
      return repository.getCardByUuid(cardUuid);
    },
    async resolveEdition(setPrefix, collectorNumber) {
      return repository.resolveEditionBySetCollector(
        setPrefix,
        collectorNumber,
      );
    },
    async searchCards(filters = {}) {
      const query = normalizeSearchText(filters.query);

      if (!query || query.length < 2) {
        return repository.searchCards(filters);
      }

      try {
        const apiCards = (
          await apiClient.searchCardsByName({
            name: filters.query ?? query,
            pageSize: filters.limit ?? 50,
          })
        ).map(mapGrandArchiveCard);

        if (apiCards.length > 0) {
          await repository.upsertCards(apiCards);
        }

        const usefulApiCards = apiCards.filter((card) =>
          cardMatchesFilters(card, filters),
        );

        if (usefulApiCards.length > 0) {
          const localCards = await repository.searchCards(filters);

          return mergeCardsByApiFreshness(
            usefulApiCards,
            localCards,
            filters.limit ?? 50,
          );
        }
      } catch {
        return repository.searchCards(filters);
      }

      return repository.searchCards(filters);
    },
    async sync(options = {}) {
      return syncCatalog({
        apiClient,
        options,
        repository,
      });
    },
  };
}

let defaultCatalogService: CatalogService | null = null;

export async function getCatalogService(
  apiOptions: GrandArchiveApiClientOptions = {},
) {
  if (!defaultCatalogService) {
    const { openAppDatabase } = await import('../database/ExpoSQLiteDatabase');
    const database = await openAppDatabase();
    const repository = new CatalogRepository(database);

    defaultCatalogService = createCatalogService({
      apiClient: new GrandArchiveApiClient(apiOptions),
      repository,
    });
    await defaultCatalogService.initialize();
  }

  return defaultCatalogService;
}

function mergeCardsByApiFreshness(
  apiCards: CatalogCard[],
  localCards: CatalogCard[],
  limit: number,
) {
  const merged = new Map<string, CatalogCard>();

  for (const card of localCards) {
    merged.set(card.uuid, card);
  }

  for (const card of apiCards) {
    merged.delete(card.uuid);
  }

  return [...apiCards, ...merged.values()].slice(0, limit);
}

function cardMatchesFilters(
  card: CatalogCard,
  filters: CatalogCardSearchFilters,
) {
  if (filters.type && !card.types.includes(normalizeCardType(filters.type))) {
    return false;
  }

  if (
    filters.element &&
    !card.elements.includes(normalizeFacet(filters.element))
  ) {
    return false;
  }

  if (filters.class && !card.classes.includes(normalizeFacet(filters.class))) {
    return false;
  }

  if (
    filters.setPrefix &&
    !card.editions.some(
      (edition) =>
        edition.normalizedSetPrefix === normalizeSetPrefix(filters.setPrefix),
    )
  ) {
    return false;
  }

  return true;
}
