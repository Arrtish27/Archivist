import { describe, expect, it } from 'vitest';

import { CatalogRepository } from '../catalog/CatalogRepository';
import { createSqlJsTestDatabase } from '../database/SqlJsTestDatabase';
import {
  apotheosisRiteCard,
  creativeShockCard,
  lorraineCard,
} from '../test/catalogFixtures';
import { SqliteDeckService } from './DeckService';

describe('SqliteDeckService', () => {
  it('persists deck sections, quantities, and immutable snapshots', async () => {
    const db = await createSqlJsTestDatabase();
    const repository = new CatalogRepository(db);
    const deckService = new SqliteDeckService(db, predictableIds());

    await repository.initialize();
    await repository.upsertCards([
      lorraineCard,
      creativeShockCard,
      apotheosisRiteCard,
    ]);

    const deck = await deckService.createDeck({ name: 'Tournament Deck' });
    await deckService.upsertDeckCard({
      cardUuid: lorraineCard.uuid,
      deckId: deck.id,
      editionUuid: lorraineCard.editions[0]?.uuid,
      quantity: 1,
      section: 'material',
    });
    await deckService.upsertDeckCard({
      cardUuid: creativeShockCard.uuid,
      deckId: deck.id,
      quantity: 4,
      section: 'main',
    });
    await deckService.upsertDeckCard({
      cardUuid: apotheosisRiteCard.uuid,
      deckId: deck.id,
      quantity: 1,
      section: 'sideboard',
    });

    const snapshot = await deckService.createSnapshot({
      deckId: deck.id,
      exportText: 'snapshot export',
      label: 'Locals',
    });

    await deckService.upsertDeckCard({
      cardUuid: creativeShockCard.uuid,
      deckId: deck.id,
      quantity: 2,
      section: 'main',
    });

    const current = await deckService.getDeck(deck.id);
    const savedSnapshot = await deckService.getSnapshot(snapshot.id);

    expect(current?.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Lorraine, Blademaster',
          quantity: 1,
          section: 'material',
        }),
        expect.objectContaining({
          name: 'Creative Shock',
          quantity: 2,
          section: 'main',
        }),
        expect.objectContaining({
          name: 'Apotheosis Rite',
          quantity: 1,
          section: 'sideboard',
        }),
      ]),
    );
    expect(savedSnapshot?.deck.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Creative Shock',
          quantity: 4,
          section: 'main',
        }),
      ]),
    );
    expect(savedSnapshot?.exportText).toBe('snapshot export');

    await db.close?.();
  });

  it('duplicates and archives decks without mutating the source deck', async () => {
    const db = await createSqlJsTestDatabase();
    const repository = new CatalogRepository(db);
    const deckService = new SqliteDeckService(db, predictableIds());

    await repository.initialize();
    await repository.upsertCards([creativeShockCard]);

    const source = await deckService.createDeck({ name: 'Source' });
    await deckService.upsertDeckCard({
      cardUuid: creativeShockCard.uuid,
      deckId: source.id,
      quantity: 4,
      section: 'main',
    });

    const duplicate = await deckService.duplicateDeck(source.id, 'Copy');
    await deckService.archiveDeck(source.id);

    const activeDecks = await deckService.listDecks();
    const allDecks = await deckService.listDecks({ includeArchived: true });

    expect(duplicate.name).toBe('Copy');
    expect(duplicate.cards[0]?.quantity).toBe(4);
    expect(activeDecks.map((deck) => deck.name)).toEqual(['Copy']);
    expect(allDecks.map((deck) => deck.name).sort()).toEqual([
      'Copy',
      'Source',
    ]);

    await db.close?.();
  });

  it('merges moved cards and restores tournament snapshots', async () => {
    const db = await createSqlJsTestDatabase();
    const repository = new CatalogRepository(db);
    const deckService = new SqliteDeckService(db, predictableIds());

    await repository.initialize();
    await repository.upsertCards([creativeShockCard, apotheosisRiteCard]);

    const deck = await deckService.createDeck({ name: 'Snapshot Deck' });
    await deckService.upsertDeckCard({
      cardUuid: creativeShockCard.uuid,
      deckId: deck.id,
      quantity: 2,
      section: 'main',
    });
    await deckService.upsertDeckCard({
      cardUuid: apotheosisRiteCard.uuid,
      deckId: deck.id,
      quantity: 1,
      section: 'sideboard',
    });

    const snapshot = await deckService.createSnapshot({
      deckId: deck.id,
      exportText: 'saved list',
      label: 'Locals',
    });

    await deckService.upsertDeckCard({
      cardUuid: creativeShockCard.uuid,
      deckId: deck.id,
      quantity: 1,
      section: 'sideboard',
    });

    const deckWithSideCard = await deckService.getDeck(deck.id);
    const sideCard = deckWithSideCard?.cards.find(
      (card) =>
        card.cardUuid === creativeShockCard.uuid &&
        card.section === 'sideboard',
    );

    expect(sideCard?.id).toBeTruthy();
    await deckService.moveDeckCard(sideCard?.id ?? '', 'main');

    const movedDeck = await deckService.getDeck(deck.id);
    expect(
      movedDeck?.cards.find(
        (card) =>
          card.cardUuid === creativeShockCard.uuid && card.section === 'main',
      )?.quantity,
    ).toBe(3);
    expect(
      movedDeck?.cards.find(
        (card) =>
          card.cardUuid === creativeShockCard.uuid &&
          card.section === 'sideboard',
      ),
    ).toBeUndefined();

    const restoredDeck = await deckService.restoreSnapshot(snapshot.id);

    expect(
      restoredDeck.cards.find(
        (card) =>
          card.cardUuid === creativeShockCard.uuid && card.section === 'main',
      )?.quantity,
    ).toBe(2);
    expect(restoredDeck.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardUuid: apotheosisRiteCard.uuid,
          quantity: 1,
          section: 'sideboard',
        }),
      ]),
    );
    expect(
      restoredDeck.cards.find(
        (card) =>
          card.cardUuid === creativeShockCard.uuid &&
          card.section === 'sideboard',
      ),
    ).toBeUndefined();

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
