export type CatalogSyncStatus = 'idle' | 'syncing' | 'ready' | 'failed';

export type CatalogSyncState = {
  status: CatalogSyncStatus;
  lastAttemptAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  sourceCardCount: number | null;
  syncedCardCount: number;
  syncedEditionCount: number;
};

export type CatalogCardSummary = {
  uuid: string;
  slug: string;
  name: string;
  normalizedName: string;
  types: string[];
  subtypes: string[];
  classes: string[];
  elements: string[];
  level: string | null;
  lastUpdate: string;
};

export type CatalogEdition = {
  uuid: string;
  cardUuid: string;
  slug: string;
  setPrefix: string;
  normalizedSetPrefix: string;
  setName: string;
  collectorNumber: string;
  normalizedCollectorNumber: string;
  rarity: number | null;
  language: string | null;
  imagePath: string | null;
  releaseDate: string | null;
  lastUpdate: string;
  rawJson: string;
};

export type CatalogCard = CatalogCardSummary & {
  costType: string | null;
  costValue: string | null;
  power: string | null;
  life: string | null;
  durability: string | null;
  speed: string | null;
  effectRaw: string | null;
  flavor: string | null;
  editions: CatalogEdition[];
  rawJson: string;
};

export type CatalogCardSearchFilters = {
  query?: string;
  type?: string;
  element?: string;
  class?: string;
  setPrefix?: string;
  limit?: number;
};

export type CatalogEditionMatch = {
  card: CatalogCardSummary;
  edition: CatalogEdition;
};

export type CatalogSyncResult =
  | {
      status: 'success';
      cardsSynced: number;
      editionsSynced: number;
      pagesSynced: number;
      completedAt: string;
    }
  | {
      status: 'failed';
      error: string;
      pagesSynced: number;
      failedAt: string;
    };
