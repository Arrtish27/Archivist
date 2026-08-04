import { OcrCardText, ScanCandidate } from '../../domain/card-resolution/types';

export type ScannerService = {
  resolveText(text: OcrCardText): Promise<ScanCandidate[]>;
};

export const scannerService: ScannerService = {
  async resolveText() {
    return [];
  },
};
