import { openAppDatabase } from '../database/ExpoSQLiteDatabase';
import { CatalogRepository } from './CatalogRepository';
import {
  GrandArchiveApiClient,
  GrandArchiveApiClientOptions,
} from './GrandArchiveApiClient';
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
    async resolveEdition(setPrefix, collectorNumber) {
      return repository.resolveEditionBySetCollector(
        setPrefix,
        collectorNumber,
      );
    },
    async searchCards(filters = {}) {
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
