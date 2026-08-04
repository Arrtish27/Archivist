import { describe, expect, it } from 'vitest';

import { createSqlJsTestDatabase } from '../database/SqlJsTestDatabase';
import { SqliteDeckService } from '../decks/DeckService';
import {
  apotheosisRiteCard,
  creativeShockCard,
  lorraineCard,
} from '../test/catalogFixtures';
import { CatalogRepository } from './CatalogRepository';
import { syncCatalog } from './CatalogSyncService';
import {
  GrandArchiveApiClient,
  GrandArchiveCard,
} from './GrandArchiveApiClient';

describe('CatalogRepository', () => {
  it('searches cards offline by name, type, element, class, and set prefix', async () => {
    const { repository, db } = await createRepository();
    await repository.upsertCards([
      lorraineCard,
      creativeShockCard,
      apotheosisRiteCard,
    ]);

    await expectNames(repository.searchCards({ query: 'creative' }), [
      'Creative Shock',
    ]);
    await expectNames(repository.searchCards({ type: 'champion' }), [
      'Lorraine, Blademaster',
    ]);
    await expectNames(repository.searchCards({ element: 'fire' }), [
      'Creative Shock',
    ]);
    await expectNames(repository.searchCards({ class: 'warrior' }), [
      'Apotheosis Rite',
      'Lorraine, Blademaster',
    ]);
    await expectNames(repository.searchCards({ setPrefix: 'P24' }), [
      'Apotheosis Rite',
    ]);

    await db.close?.();
  });

  it('resolves exact set prefix and collector number offline', async () => {
    const { repository, db } = await createRepository();
    await repository.upsertCards([apotheosisRiteCard]);

    const exact = await repository.resolveEditionBySetCollector('P24', '000');
    const zeroTrimmed = await repository.resolveEditionBySetCollector(
      'p24',
      '0',
    );

    expect(exact?.card.name).toBe('Apotheosis Rite');
    expect(exact?.edition.uuid).toBe('edition-apotheosis-p24-000');
    expect(zeroTrimmed?.edition.uuid).toBe('edition-apotheosis-p24-000');

    await db.close?.();
  });

  it('records failed sync without corrupting existing catalog or deck data', async () => {
    const { repository, db } = await createRepository();
    const deckService = new SqliteDeckService(db, testIdFactory());

    await repository.upsertCards([lorraineCard]);
    const deck = await deckService.createDeck({ name: 'Locals' });
    await deckService.upsertDeckCard({
      cardUuid: lorraineCard.uuid,
      deckId: deck.id,
      quantity: 1,
      section: 'material',
    });

    const apiClient = createFakeApiClient({
      failOnPage: 2,
      pages: [[toApiCard(creativeShockCard, 'Creative Shock Updated')]],
    });

    const result = await syncCatalog({
      apiClient,
      repository,
      options: { pageSize: 1 },
    });

    const savedDeck = await deckService.getDeck(deck.id);
    const state = await repository.getSyncState();
    const partiallySynced = await repository.searchCards({
      query: 'Creative Shock Updated',
    });

    expect(result.status).toBe('failed');
    expect(state.status).toBe('failed');
    expect(state.lastError).toContain('page 2 failed');
    expect(savedDeck?.cards).toHaveLength(1);
    expect(savedDeck?.cards[0]?.name).toBe('Lorraine, Blademaster');
    expect(partiallySynced[0]?.name).toBe('Creative Shock Updated');

    await db.close?.();
  });
});

async function createRepository() {
  const db = await createSqlJsTestDatabase();
  const repository = new CatalogRepository(db);
  await repository.initialize();

  return {
    db,
    repository,
  };
}

async function expectNames(
  cardsPromise: Promise<{ name: string }[]>,
  expectedNames: string[],
) {
  const cards = await cardsPromise;
  expect(cards.map((card) => card.name)).toEqual(expectedNames);
}

function createFakeApiClient({
  failOnPage,
  pages,
}: {
  failOnPage?: number;
  pages: GrandArchiveCard[][];
}) {
  return {
    async fetchAllCards() {
      return {
        cards: [],
        count: pages.flat().length,
      };
    },
    async fetchCardsPage({ page }: { page: number }) {
      if (failOnPage === page) {
        throw new Error(`page ${page} failed`);
      }

      return {
        data: pages[page - 1] ?? [],
        hasMore:
          page < pages.length || Boolean(failOnPage && page < failOnPage),
        page,
        pageSize: 1,
        totalCards: pages.flat().length,
        totalPages: pages.length,
      };
    },
  } as unknown as GrandArchiveApiClient;
}

function toApiCard(card: typeof creativeShockCard, name = card.name) {
  const edition = card.editions[0];

  return {
    classes: card.classes,
    editions: [
      {
        collector_number: edition.collectorNumber,
        image: edition.imagePath,
        last_update: edition.lastUpdate,
        rarity: edition.rarity,
        set: {
          language: edition.language ?? undefined,
          name: edition.setName,
          prefix: edition.setPrefix,
          release_date: edition.releaseDate ?? undefined,
        },
        slug: edition.slug,
        uuid: edition.uuid,
      },
    ],
    elements: card.elements,
    last_update: card.lastUpdate,
    name,
    slug: card.slug,
    subtypes: card.subtypes,
    types: card.types,
    uuid: card.uuid,
  } satisfies GrandArchiveCard;
}

function testIdFactory() {
  let index = 0;

  return (prefix: string) => {
    index += 1;
    return `${prefix}-${index}`;
  };
}
