import { describe, expect, it } from 'vitest';

import { creativeShockCard, lorraineCard } from '../test/catalogFixtures';
import { createSqlJsTestDatabase } from '../database/SqlJsTestDatabase';
import { createCatalogService } from './CatalogService';
import { CatalogRepository } from './CatalogRepository';
import {
  GrandArchiveApiClient,
  GrandArchiveCard,
} from './GrandArchiveApiClient';

describe('CatalogService', () => {
  it('queries Grand Archive first for manual search, caches API cards, and keeps API freshness', async () => {
    const { db, repository } = await createRepository();
    await repository.upsertCards([creativeShockCard]);

    const service = createCatalogService({
      apiClient: createSearchApiClient([
        toApiCard(creativeShockCard, 'Creative Shock Updated'),
      ]),
      repository,
    });

    const cards = await service.searchCards({
      limit: 8,
      query: 'Creative Shock',
    });
    const cachedCard = await repository.getCardByUuid(creativeShockCard.uuid);

    expect(cards[0]?.name).toBe('Creative Shock Updated');
    expect(cachedCard?.name).toBe('Creative Shock Updated');

    await db.close?.();
  });

  it('falls back to local SQLite search when Grand Archive lookup fails', async () => {
    const { db, repository } = await createRepository();
    await repository.upsertCards([lorraineCard]);

    const service = createCatalogService({
      apiClient: createFailingSearchApiClient(),
      repository,
    });

    const cards = await service.searchCards({
      limit: 8,
      query: 'Lorraine',
    });

    expect(cards.map((card) => card.name)).toEqual(['Lorraine, Blademaster']);

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

function createSearchApiClient(cards: GrandArchiveCard[]) {
  return {
    async searchCardsByName() {
      return cards;
    },
  } as unknown as GrandArchiveApiClient;
}

function createFailingSearchApiClient() {
  return {
    async searchCardsByName() {
      throw new Error('offline');
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
