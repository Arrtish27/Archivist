import { describe, expect, it } from 'vitest';

import { CatalogRepository } from '@/data/catalog/CatalogRepository';
import { createSqlJsTestDatabase } from '@/data/database/SqlJsTestDatabase';
import { SqliteDeckService } from '@/data/decks/DeckService';
import { creativeShockCard } from '@/data/test/catalogFixtures';

import { createScannerDeckWorkflow } from './ScannerDeckWorkflow';

describe('ScannerDeckWorkflow', () => {
  it('adds scanner candidates and restores the previous quantity on undo', async () => {
    const db = await createSqlJsTestDatabase();
    const repository = new CatalogRepository(db);
    const deckService = new SqliteDeckService(db, predictableIds());
    const workflow = createScannerDeckWorkflow(deckService);

    await repository.initialize();
    await repository.upsertCards([creativeShockCard]);

    const deck = await deckService.createDeck({ name: 'Scanner Deck' });
    await workflow.addCandidateToDeck({
      candidate: {
        cardName: 'Creative Shock',
        cardUuid: creativeShockCard.uuid,
        confidence: 0.98,
        editionUuid: creativeShockCard.editions[0]?.uuid,
        reason: ['exact_footer'],
      },
      deckId: deck.id,
      quantity: 1,
      section: 'main',
      source: 'scanner_match',
    });

    const secondAdd = await workflow.addCandidateToDeck({
      candidate: {
        cardName: 'Creative Shock',
        cardUuid: creativeShockCard.uuid,
        confidence: 0.98,
        editionUuid: creativeShockCard.editions[0]?.uuid,
        reason: ['exact_footer'],
      },
      deckId: deck.id,
      quantity: 3,
      section: 'main',
      source: 'scanner_confirmation',
    });

    expect(secondAdd.deck.cards[0]).toEqual(
      expect.objectContaining({
        name: 'Creative Shock',
        quantity: 4,
        section: 'main',
      }),
    );

    const restored = await workflow.undoAdd(secondAdd.undo);

    expect(restored.cards[0]).toEqual(
      expect.objectContaining({
        name: 'Creative Shock',
        quantity: 1,
      }),
    );

    await db.close?.();
  });
});

function predictableIds() {
  let index = 0;

  return (prefix: string) => {
    index += 1;
    return `${prefix}-${index}`;
  };
}
