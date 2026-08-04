import { DeckSection } from '../validation/types';

export type DeckExportFormat = 'plainText' | 'countPrefix' | 'csv' | 'json';

export type DeckExportRow = {
  section: DeckSection;
  quantity: number;
  cardName: string;
  setPrefix?: string;
  collectorNumber?: string;
};
