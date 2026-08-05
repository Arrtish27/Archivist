import { CatalogRepository } from '@/data/catalog/CatalogRepository';
import {
  CatalogService,
  createCatalogService,
} from '@/data/catalog/CatalogService';
import { GrandArchiveApiClient } from '@/data/catalog/GrandArchiveApiClient';
import { openAppDatabase } from '@/data/database/ExpoSQLiteDatabase';
import { createDeckService, DeckService } from '@/data/decks/DeckService';
import {
  createNativeOcrService,
  NativeOcrService,
} from '@/features/scanner/NativeOcrService';
import {
  createOfflineScannerService,
  ScannerService,
} from '@/features/scanner/ScannerService';

export type AppServices = {
  catalog: CatalogService;
  decks: DeckService;
  ocr: NativeOcrService;
  scanner: ScannerService;
};

let appServicesPromise: Promise<AppServices> | null = null;

export function getAppServices() {
  appServicesPromise ??= createAppServices();
  return appServicesPromise;
}

async function createAppServices(): Promise<AppServices> {
  const database = await openAppDatabase();
  const catalogRepository = new CatalogRepository(database);
  const apiClient = new GrandArchiveApiClient();
  const catalog = createCatalogService({
    apiClient,
    repository: catalogRepository,
  });
  const decks = createDeckService(database);

  await catalog.initialize();
  await decks.initialize();

  return {
    catalog,
    decks,
    ocr: createNativeOcrService(),
    scanner: createOfflineScannerService(catalogRepository, apiClient),
  };
}

export function resetAppServicesForRetry() {
  appServicesPromise = null;
}
