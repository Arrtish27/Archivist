import {
  buildSearchableText,
  normalizeCardType,
  normalizeCollectorNumber,
  normalizeName,
  normalizeSetPrefix,
  uniqueNormalized,
} from './normalization';
import { CatalogCard, CatalogEdition } from './types';
import { GrandArchiveCard, GrandArchiveEdition } from './GrandArchiveApiClient';

export function mapGrandArchiveCard(card: GrandArchiveCard): CatalogCard {
  const editions = getEditions(card).map((edition) =>
    mapGrandArchiveEdition(card.uuid, edition),
  );
  const types = uniqueNormalized(card.types ?? []).map(normalizeCardType);
  const subtypes = uniqueNormalized(card.subtypes ?? []);
  const classes = uniqueNormalized(card.classes ?? []);
  const elements = uniqueNormalized(card.elements ?? []);
  const rawJson = JSON.stringify(card);

  return {
    classes,
    costType: toNullableString(card.cost?.type),
    costValue: toNullableString(card.cost?.value),
    durability: toNullableString(card.durability),
    editions,
    effectRaw: toNullableString(card.effect_raw),
    elements,
    flavor: toNullableString(card.flavor),
    lastUpdate: card.last_update ?? new Date().toISOString(),
    level: toNullableString(card.level),
    life: toNullableString(card.life),
    name: card.name,
    normalizedName: normalizeName(card.name),
    power: toNullableString(card.power),
    rawJson,
    slug: card.slug,
    speed: toNullableString(card.speed),
    subtypes,
    types,
    uuid: card.uuid,
  };
}

export function buildCatalogSearchText(card: CatalogCard) {
  return buildSearchableText([
    card.name,
    card.normalizedName,
    card.slug,
    card.types,
    card.subtypes,
    card.classes,
    card.elements,
    card.editions.map((edition) => edition.setPrefix),
    card.editions.map((edition) => edition.setName),
    card.editions.map((edition) => edition.collectorNumber),
  ]);
}

function mapGrandArchiveEdition(
  cardUuid: string,
  edition: GrandArchiveEdition,
): CatalogEdition {
  const setPrefix = edition.set?.prefix ?? '';
  const collectorNumber = edition.collector_number ?? '';

  return {
    cardUuid,
    collectorNumber,
    imagePath: edition.image ?? null,
    language: edition.language ?? edition.set?.language ?? null,
    lastUpdate: edition.last_update ?? new Date().toISOString(),
    normalizedCollectorNumber: normalizeCollectorNumber(collectorNumber),
    normalizedSetPrefix: normalizeSetPrefix(setPrefix),
    rarity: edition.rarity ?? null,
    rawJson: JSON.stringify(edition),
    releaseDate: edition.release_date ?? edition.set?.release_date ?? null,
    setName: edition.set?.name ?? '',
    setPrefix,
    slug: edition.slug ?? edition.uuid,
    uuid: edition.uuid,
  };
}

function getEditions(card: GrandArchiveCard) {
  const editions = card.result_editions?.length
    ? card.result_editions
    : card.editions;

  return editions ?? [];
}

function toNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}
