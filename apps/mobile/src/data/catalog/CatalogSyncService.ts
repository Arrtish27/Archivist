import { syncConfig } from '../sync/config';
import { GrandArchiveApiClient } from './GrandArchiveApiClient';
import { mapGrandArchiveCard } from './mapGrandArchiveCard';
import { CatalogRepository } from './CatalogRepository';
import { CatalogSyncResult } from './types';

export type CatalogSyncOptions = {
  pageSize?: number;
  maxPages?: number;
};

export async function syncCatalog({
  apiClient,
  repository,
  options = {},
}: {
  apiClient: GrandArchiveApiClient;
  repository: CatalogRepository;
  options?: CatalogSyncOptions;
}): Promise<CatalogSyncResult> {
  const pageSize = options.pageSize ?? syncConfig.catalogBatchSize;
  let pagesSynced = 0;
  let cardsSynced = 0;
  let editionsSynced = 0;

  try {
    const allCards = await apiClient.fetchAllCards();
    await repository.markSyncStarted(allCards.count);

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      if (options.maxPages && page > options.maxPages) {
        break;
      }

      const response = await apiClient.fetchCardsPage({ page, pageSize });
      const cards = response.data.map(mapGrandArchiveCard);

      await repository.upsertCards(cards);
      pagesSynced += 1;
      cardsSynced += cards.length;
      editionsSynced += cards.reduce(
        (total, card) => total + card.editions.length,
        0,
      );

      hasMore = response.hasMore;
      page += 1;
    }

    const completedAt = new Date().toISOString();
    await repository.markSyncSucceeded(completedAt);

    return {
      cardsSynced,
      completedAt,
      editionsSynced,
      pagesSynced,
      status: 'success',
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);

    await repository.markSyncFailed(message, failedAt);

    return {
      error: message,
      failedAt,
      pagesSynced,
      status: 'failed',
    };
  }
}
