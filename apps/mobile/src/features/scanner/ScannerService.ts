import {
  CardResolver,
  OfflineCardResolver,
} from '@/domain/card-resolution/CardResolver';
import { OcrCardText, ScanCandidate } from '@/domain/card-resolution/types';
import { CatalogRepository } from '@/data/catalog/CatalogRepository';

export type ScannerService = {
  resolveText(text: OcrCardText): Promise<ScanCandidate[]>;
};

export function createScannerService(resolver: CardResolver): ScannerService {
  return {
    resolveText(text) {
      return resolver.resolveText(text);
    },
  };
}

export function createOfflineScannerService(repository: CatalogRepository) {
  return createScannerService(new OfflineCardResolver(repository));
}
