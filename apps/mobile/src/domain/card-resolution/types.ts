export type ScanCandidate = {
  cardUuid: string;
  editionUuid?: string;
  cardName?: string;
  cardLevel?: number;
  cardTypes?: string[];
  confidence: number;
  requiresConfirmation?: boolean;
  reason: string[];
  setPrefix?: string;
  collectorNumber?: string;
};

export type OcrCardText = {
  nameText?: string;
  footerText?: string;
  setPrefixText?: string;
  collectorNumberText?: string;
  typeText?: string;
};
