export type ScanCandidate = {
  cardUuid: string;
  editionUuid?: string;
  confidence: number;
  reason: string[];
};

export type OcrCardText = {
  nameText?: string;
  footerText?: string;
  typeText?: string;
};
