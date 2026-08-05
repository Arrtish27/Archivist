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
  | 'domain'
  | (string & {});

export type DeckCard = {
  id?: string;
  cardUuid: string;
  editionUuid?: string | null;
  name: string;
  section: DeckSection;
  quantity: number;
  types: CardType[];
  subtypes?: string[];
  classes?: string[];
  elements?: string[];
  level?: number;
  costType?: string | null;
  costValue?: string | null;
  power?: string | null;
  life?: string | null;
  durability?: string | null;
  speed?: string | null;
  effectRaw?: string | null;
  flavor?: string | null;
  editionSetPrefix?: string | null;
  editionCollectorNumber?: string | null;
  editionImagePath?: string | null;
  createdAt?: string;
  updatedAt?: string;
  sortOrder?: number | null;
};

export type Deck = {
  id: string;
  name: string;
  formatId: string;
  cards: DeckCard[];
  championIdentityCardUuid?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
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
