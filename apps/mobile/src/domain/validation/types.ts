export type DeckSection = 'material' | 'main' | 'sideboard';

export type RuleSeverity = 'error' | 'warning' | 'info';

export type CardType =
  | 'champion'
  | 'regalia'
  | 'action'
  | 'ally'
  | 'attack'
  | 'item'
  | 'weapon'
  | 'domain';

export type DeckCard = {
  cardUuid: string;
  name: string;
  section: DeckSection;
  quantity: number;
  types: CardType[];
  level?: number;
};

export type Deck = {
  id: string;
  name: string;
  formatId: string;
  cards: DeckCard[];
};

export type DeckValidationIssue = {
  code: string;
  severity: RuleSeverity;
  section?: DeckSection;
  cardUuid?: string;
  message: string;
};

export type FormatRulePack = {
  id: string;
  name: string;
  validate(deck: Deck): DeckValidationIssue[];
};
