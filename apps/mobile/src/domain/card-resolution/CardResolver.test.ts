import { describe, expect, it } from 'vitest';

import { CatalogRepository } from '@/data/catalog/CatalogRepository';
import { createSqlJsTestDatabase } from '@/data/database/SqlJsTestDatabase';
import {
  apotheosisRiteCard,
  creativeShockCard,
  guoJiaCard,
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

  it('uses OCR candidate fragments when the first title line is polluted', async () => {
    const { resolver, db } = await createResolver();

    const candidates = await resolver.resolveText({
      footerText:
        "On Enter: You may put three quest counters on Guo Jia If you don't, recover 3. 25",
      nameCandidates: ["ja, Heaven's Favored", "Heaven's Favored", 'Guo Jia'],
      nameText: "Lv.3o ja, Heaven's Favored",
    });

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        cardName: "Guo Jia, Heaven's Favored",
        cardUuid: guoJiaCard.uuid,
        requiresConfirmation: true,
      }),
    );
    expect(candidates[0]?.reason).toEqual(
      expect.arrayContaining(['search_fallback']),
    );

    await db.close?.();
  });

  it('queries Grand Archive autocomplete and caches mapped API cards', async () => {
    const db = await createSqlJsTestDatabase();
    const repository = new CatalogRepository(db);
    await repository.initialize();

    const resolver = new OfflineCardResolver(repository, {
      apiClient: {
        fetchAutocomplete: async (name: string) =>
          name.includes('Heaven')
            ? [
                {
                  classes: ['Tamer'],
                  elements: ['Wind'],
                  editions: [
                    {
                      collector_number: '007',
                      image: '/cards/images/guo-jia.jpg',
                      set: {
                        name: 'Alchemical Revolution',
                        prefix: 'ALC',
                      },
                      uuid: 'edition-guo-jia-api-007',
                    },
                  ],
                  level: 3,
                  name: "Guo Jia, Heaven's Favored",
                  slug: 'guo-jia-heavens-favored',
                  subtypes: ['Human'],
                  types: ['Champion'],
                  uuid: 'card-guo-jia-api',
                },
              ]
            : [],
      },
    });

    const candidates = await resolver.resolveText({
      nameCandidates: ["Heaven's Favored"],
      nameText: "Lv.3o ja, Heaven's Favored",
    });
    const cachedCard = await repository.getCardByUuid('card-guo-jia-api');

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        cardName: "Guo Jia, Heaven's Favored",
        cardUuid: 'card-guo-jia-api',
        collectorNumber: '007',
        editionUuid: 'edition-guo-jia-api-007',
      }),
    );
    expect(candidates[0]?.reason).toEqual(
      expect.arrayContaining(['grand_archive_query', 'grand_archive_result']),
    );
    expect(cachedCard?.name).toBe("Guo Jia, Heaven's Favored");

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
  await repository.upsertCards([
    apotheosisRiteCard,
    creativeShockCard,
    guoJiaCard,
  ]);

  return {
    db,
    resolver: new OfflineCardResolver(repository),
  };
}
