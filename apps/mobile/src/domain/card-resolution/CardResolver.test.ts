import { describe, expect, it } from 'vitest';

import { CatalogRepository } from '@/data/catalog/CatalogRepository';
import { createSqlJsTestDatabase } from '@/data/database/SqlJsTestDatabase';
import {
  apotheosisRiteCard,
  creativeShockCard,
} from '@/data/test/catalogFixtures';

import { OfflineCardResolver, parseEditionFooter } from './CardResolver';

describe('OfflineCardResolver', () => {
  it('resolves exact footer matches without requiring confirmation', async () => {
    const { resolver, db } = await createResolver();

    const candidates = await resolver.resolveText({
      footerText: 'P24-000 EN',
      nameText: 'blurry rite',
    });

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        cardName: 'Apotheosis Rite',
        collectorNumber: '000',
        confidence: 0.98,
        editionUuid: 'edition-apotheosis-p24-000',
        requiresConfirmation: false,
        setPrefix: 'P24',
      }),
    );

    await db.close?.();
  });

  it('returns confirmation candidates for exact and fuzzy name matches', async () => {
    const { resolver, db } = await createResolver();

    const exact = await resolver.resolveText({ nameText: 'Creative Shock' });
    const fuzzy = await resolver.resolveText({ nameText: 'Creativ Shok' });

    expect(exact[0]).toEqual(
      expect.objectContaining({
        cardName: 'Creative Shock',
        confidence: 0.9,
        requiresConfirmation: true,
      }),
    );
    expect(fuzzy[0]).toEqual(
      expect.objectContaining({
        cardName: 'Creative Shock',
        requiresConfirmation: true,
      }),
    );

    await db.close?.();
  });
});

describe('parseEditionFooter', () => {
  it('parses OCR-prone collector numbers independently from set prefixes', () => {
    expect(parseEditionFooter({ footerText: 'P24 OOO' })).toEqual({
      collectorNumber: '000',
      setPrefix: 'P24',
    });
  });
});

async function createResolver() {
  const db = await createSqlJsTestDatabase();
  const repository = new CatalogRepository(db);
  await repository.initialize();
  await repository.upsertCards([apotheosisRiteCard, creativeShockCard]);

  return {
    db,
    resolver: new OfflineCardResolver(repository),
  };
}
