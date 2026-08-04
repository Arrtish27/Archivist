export type CatalogSyncStatus = 'idle' | 'syncing' | 'ready' | 'failed';

export type CatalogService = {
  getSyncStatus(): CatalogSyncStatus;
};

export const catalogService: CatalogService = {
  getSyncStatus() {
    return 'idle';
  },
};
