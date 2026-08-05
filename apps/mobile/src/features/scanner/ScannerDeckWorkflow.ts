import { CatalogCard } from '@/data/catalog/types';
import { DeckService } from '@/data/decks/DeckService';
import { ScanCandidate } from '@/domain/card-resolution/types';
import { Deck, DeckCard, DeckSection } from '@/domain/validation/types';

export type ScannerDeckAddSource =
  'manual_search' | 'scanner_confirmation' | 'scanner_match';

export type ScannerDeckAddInput = {
  cardName?: string;
  cardUuid: string;
  deckId: string;
  editionUuid?: string | null;
  quantity: number;
  section: DeckSection;
  source: ScannerDeckAddSource;
};

export type ScannerDeckUndo = {
  cardUuid: string;
  createdDeckCardId?: string;
  deckId: string;
  editionUuid?: string | null;
  previousDeckCardId?: string;
  previousQuantity: number;
  section: DeckSection;
};

export type ScannerDeckAddResult = {
  cardName?: string;
  deck: Deck;
  id: string;
  quantity: number;
  section: DeckSection;
  source: ScannerDeckAddSource;
  undo: ScannerDeckUndo;
};

export type ScannerDeckWorkflow = {
  addCandidateToDeck(input: {
    candidate: ScanCandidate;
    deckId: string;
    quantity: number;
    section: DeckSection;
    source: ScannerDeckAddSource;
  }): Promise<ScannerDeckAddResult>;
  addCatalogCardToDeck(input: {
    card: CatalogCard;
    deckId: string;
    quantity: number;
    section: DeckSection;
  }): Promise<ScannerDeckAddResult>;
  undoAdd(undo: ScannerDeckUndo): Promise<Deck>;
};

export function createScannerDeckWorkflow(
  decks: DeckService,
): ScannerDeckWorkflow {
  return {
    addCandidateToDeck(input) {
      return addDeckCard(decks, {
        cardName: input.candidate.cardName,
        cardUuid: input.candidate.cardUuid,
        deckId: input.deckId,
        editionUuid: input.candidate.editionUuid ?? null,
        quantity: input.quantity,
        section: input.section,
        source: input.source,
      });
    },
    addCatalogCardToDeck(input) {
      return addDeckCard(decks, {
        cardName: input.card.name,
        cardUuid: input.card.uuid,
        deckId: input.deckId,
        editionUuid: input.card.editions[0]?.uuid ?? null,
        quantity: input.quantity,
        section: input.section,
        source: 'manual_search',
      });
    },
    undoAdd(input) {
      return undoDeckAdd(decks, input);
    },
  };
}

async function addDeckCard(
  decks: DeckService,
  input: ScannerDeckAddInput,
): Promise<ScannerDeckAddResult> {
  const deckBefore = await decks.getDeck(input.deckId);

  if (!deckBefore) {
    throw new Error(`Deck not found: ${input.deckId}`);
  }

  const previousCard = findMatchingDeckCard(deckBefore, input);
  const previousQuantity = previousCard?.quantity ?? 0;
  const nextQuantity = previousQuantity + input.quantity;
  const deck = await decks.upsertDeckCard({
    cardUuid: input.cardUuid,
    deckId: input.deckId,
    editionUuid: input.editionUuid ?? null,
    quantity: nextQuantity,
    section: input.section,
  });
  const savedCard = findMatchingDeckCard(deck, input);

  return {
    cardName: input.cardName ?? savedCard?.name,
    deck,
    id: `scan_add_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2)}`,
    quantity: input.quantity,
    section: input.section,
    source: input.source,
    undo: {
      cardUuid: input.cardUuid,
      createdDeckCardId: previousCard ? undefined : savedCard?.id,
      deckId: input.deckId,
      editionUuid: input.editionUuid ?? null,
      previousDeckCardId: previousCard?.id,
      previousQuantity,
      section: input.section,
    },
  };
}

async function undoDeckAdd(decks: DeckService, undo: ScannerDeckUndo) {
  if (undo.previousDeckCardId && undo.previousQuantity > 0) {
    return decks.upsertDeckCard({
      cardUuid: undo.cardUuid,
      deckId: undo.deckId,
      editionUuid: undo.editionUuid ?? null,
      quantity: undo.previousQuantity,
      section: undo.section,
    });
  }

  if (undo.createdDeckCardId) {
    await decks.removeDeckCard(undo.createdDeckCardId);
  } else {
    const deck = await decks.getDeck(undo.deckId);
    const currentCard = deck ? findMatchingDeckCard(deck, undo) : null;

    if (currentCard?.id) {
      await decks.removeDeckCard(currentCard.id);
    }
  }

  const deck = await decks.getDeck(undo.deckId);

  if (!deck) {
    throw new Error(`Deck not found: ${undo.deckId}`);
  }

  return deck;
}

function findMatchingDeckCard(
  deck: Deck,
  input: {
    cardUuid: string;
    editionUuid?: string | null;
    section: DeckSection;
  },
): DeckCard | null {
  return (
    deck.cards.find(
      (card) =>
        card.cardUuid === input.cardUuid &&
        card.section === input.section &&
        (card.editionUuid ?? null) === (input.editionUuid ?? null),
    ) ?? null
  );
}
