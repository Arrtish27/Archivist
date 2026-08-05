import {
  CardResolver,
  OfflineCardResolver,
} from '@/domain/card-resolution/CardResolver';
import { OcrCardText, ScanCandidate } from '@/domain/card-resolution/types';
import { CatalogRepository } from '@/data/catalog/CatalogRepository';

import { StillImageOcrResult } from './NativeOcrService';
import { buildOcrCardText } from './OcrTextExtraction';

export type ScannerResolution = {
  candidates: ScanCandidate[];
  ocrText: OcrCardText;
  rawText: string;
  resolvedAt: string;
};

export type ScannerService = {
  analyzeStillImage(ocr: StillImageOcrResult): Promise<ScannerResolution>;
  resolveText(text: OcrCardText): Promise<ScanCandidate[]>;
};

export function createScannerService(resolver: CardResolver): ScannerService {
  return {
    async analyzeStillImage(ocr) {
      const ocrText = buildOcrCardText(ocr);

      return {
        candidates: await resolver.resolveText(ocrText),
        ocrText,
        rawText: ocr.rawText,
        resolvedAt: new Date().toISOString(),
      };
    },
    resolveText(text) {
      return resolver.resolveText(text);
    },
  };
}

export function createOfflineScannerService(repository: CatalogRepository) {
  return createScannerService(new OfflineCardResolver(repository));
}
