import { CatalogCard } from '../catalog/types';
import {
  normalizeCollectorNumber,
  normalizeName,
  normalizeSetPrefix,
} from '../catalog/normalization';

type FixtureCardInput = {
  uuid: string;
  slug: string;
  name: string;
  types: string[];
  subtypes?: string[];
  classes?: string[];
  elements?: string[];
  level?: string | null;
  setPrefix: string;
  setName: string;
  collectorNumber: string;
  editionUuid: string;
};

export function makeFixtureCard(input: FixtureCardInput): CatalogCard {
  const edition = {
    cardUuid: input.uuid,
    collectorNumber: input.collectorNumber,
    imagePath: `/cards/images/${input.editionUuid}.jpg`,
    language: 'EN',
    lastUpdate: '2026-01-01T00:00:00.000Z',
    normalizedCollectorNumber: normalizeCollectorNumber(input.collectorNumber),
    normalizedSetPrefix: normalizeSetPrefix(input.setPrefix),
    rarity: 1,
    rawJson: JSON.stringify({
      collector_number: input.collectorNumber,
      uuid: input.editionUuid,
    }),
    releaseDate: '2026-01-01T00:00:00.000Z',
    setName: input.setName,
    setPrefix: input.setPrefix,
    slug: `${input.slug}-${input.setPrefix.toLowerCase()}`,
    uuid: input.editionUuid,
  };

  return {
    classes: input.classes ?? [],
    costType: null,
    costValue: null,
    durability: null,
    editions: [edition],
    effectRaw: null,
    elements: input.elements ?? [],
    flavor: null,
    lastUpdate: '2026-01-01T00:00:00.000Z',
    level: input.level ?? null,
    life: null,
    name: input.name,
    normalizedName: normalizeName(input.name),
    power: null,
    rawJson: JSON.stringify({
      name: input.name,
      uuid: input.uuid,
    }),
    slug: input.slug,
    speed: null,
    subtypes: input.subtypes ?? [],
    types: input.types,
    uuid: input.uuid,
  };
}

export const lorraineCard = makeFixtureCard({
  classes: ['WARRIOR'],
  collectorNumber: '001',
  editionUuid: 'edition-lorraine-doa-001',
  elements: ['NORM'],
  level: '0',
  name: 'Lorraine, Blademaster',
  setName: 'Dawn of Ashes',
  setPrefix: 'DOA',
  slug: 'lorraine-blademaster',
  subtypes: ['HUMAN'],
  types: ['champion'],
  uuid: 'card-lorraine',
});

export const creativeShockCard = makeFixtureCard({
  classes: ['MAGE'],
  collectorNumber: '102',
  editionUuid: 'edition-creative-shock-doa-102',
  elements: ['FIRE'],
  name: 'Creative Shock',
  setName: 'Dawn of Ashes',
  setPrefix: 'DOA',
  slug: 'creative-shock',
  subtypes: ['SPELL'],
  types: ['action'],
  uuid: 'card-creative-shock',
});

export const apotheosisRiteCard = makeFixtureCard({
  classes: ['WARRIOR'],
  collectorNumber: '000',
  editionUuid: 'edition-apotheosis-p24-000',
  elements: ['NORM'],
  name: 'Apotheosis Rite',
  setName: 'Promotional 2024',
  setPrefix: 'P24',
  slug: 'apotheosis-rite',
  subtypes: ['RING'],
  types: ['regalia', 'item'],
  uuid: 'card-apotheosis-rite',
});
