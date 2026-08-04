export type ScanCandidate = {
  cardUuid: string;
  editionUuid?: string;
  cardName?: string;
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
