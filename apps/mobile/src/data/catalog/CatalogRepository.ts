import { AppDatabase, SqlParameter } from '../database/Database';
import {
  getMetadataMap,
  getMetadataValue,
  setMetadataValue,
} from '../database/metadata';
import { migrateDatabase } from '../database/schema';
import { buildCatalogSearchText } from './mapGrandArchiveCard';
import {
  normalizeCardType,
  normalizeCollectorNumber,
  normalizeCollectorNumberForCompare,
  normalizeFacet,
  normalizeName,
  normalizeSearchText,
  normalizeSetPrefix,
} from './normalization';
import {
  CatalogCard,
  CatalogCardSearchFilters,
  CatalogCardSummary,
  CatalogEdition,
  CatalogEditionMatch,
  CatalogSyncState,
} from './types';

type CardRow = {
  uuid: string;
  slug: string;
  name: string;
  normalized_name: string;
  cost_type: string | null;
  cost_value: string | null;
  level: string | null;
  power: string | null;
  life: string | null;
  durability: string | null;
  speed: string | null;
  effect_raw: string | null;
  flavor: string | null;
  last_update: string;
  raw_json: string;
};

type EditionRow = {
  uuid: string;
  card_uuid: string;
  slug: string;
  set_prefix: string;
  normalized_set_prefix: string;
  set_name: string;
  collector_number: string;
  normalized_collector_number: string;
  rarity: number | null;
  language: string | null;
  image_path: string | null;
  release_date: string | null;
  last_update: string;
  raw_json: string;
};

const syncMetadataKeys = [
  'catalog.status',
  'catalog.last_attempt_at',
  'catalog.last_successful_sync_at',
  'catalog.last_error',
  'catalog.source_card_count',
];

export class CatalogRepository {
  constructor(private readonly db: AppDatabase) {}

  async initialize() {
    await migrateDatabase(this.db);
  }

  async upsertCards(cards: CatalogCard[], syncedAt = new Date().toISOString()) {
    if (cards.length === 0) {
      return;
    }

    await this.db.withTransaction(async () => {
      for (const card of cards) {
        await this.upsertCard(card, syncedAt);
      }
    });
  }

  async searchCards(filters: CatalogCardSearchFilters = {}) {
    const query = normalizeSearchText(filters.query);

    if (query && (await this.isFtsEnabled())) {
      try {
        return await this.searchCardsWithFts(filters, query);
      } catch {
        return this.searchCardsWithLike(filters, query);
      }
    }

    return this.searchCardsWithLike(filters, query);
  }

  async getCardByUuid(uuid: string) {
    const row = await this.db.getFirst<CardRow>(
      'SELECT * FROM cards WHERE uuid = ?',
      [uuid],
    );

    if (!row) {
      return null;
    }

    return (await this.hydrateCards([row]))[0] ?? null;
  }

  async getCardByNormalizedName(normalizedName: string) {
    const row = await this.db.getFirst<CardRow>(
      `
        SELECT *
        FROM cards
        WHERE normalized_name = ?
        ORDER BY name COLLATE NOCASE
        LIMIT 1
      `,
      [normalizeName(normalizedName)],
    );

    if (!row) {
      return null;
    }

    return (await this.hydrateCards([row]))[0] ?? null;
  }

  async findNameCandidates(query: string, limit = 20) {
    return this.searchCards({
      limit,
      query,
    });
  }

  async resolveEditionBySetCollector(
    setPrefix: string,
    collectorNumber: string,
  ): Promise<CatalogEditionMatch | null> {
    const normalizedSetPrefix = normalizeSetPrefix(setPrefix);
    const normalizedCollectorNumber = normalizeCollectorNumber(collectorNumber);
    const collectorCompare =
      normalizeCollectorNumberForCompare(collectorNumber);

    const row = await this.db.getFirst<
      EditionRow & {
        card_slug: string;
        card_name: string;
        card_normalized_name: string;
        card_level: string | null;
        card_last_update: string;
      }
    >(
      `
        SELECT
          e.*,
          c.slug AS card_slug,
          c.name AS card_name,
          c.normalized_name AS card_normalized_name,
          c.level AS card_level,
          c.last_update AS card_last_update
        FROM editions e
        INNER JOIN cards c ON c.uuid = e.card_uuid
        WHERE e.normalized_set_prefix = ?
          AND (
            e.normalized_collector_number = ?
            OR CASE
              WHEN LTRIM(e.normalized_collector_number, '0') = '' THEN '0'
              ELSE LTRIM(e.normalized_collector_number, '0')
            END = ?
          )
        ORDER BY e.collector_number ASC
        LIMIT 1
      `,
      [normalizedSetPrefix, normalizedCollectorNumber, collectorCompare],
    );

    if (!row) {
      return null;
    }

    const relationMap = await this.loadRelationMaps([row.card_uuid]);
    const card: CatalogCardSummary = {
      classes: relationMap.classes.get(row.card_uuid) ?? [],
      elements: relationMap.elements.get(row.card_uuid) ?? [],
      lastUpdate: row.card_last_update,
      level: row.card_level,
      name: row.card_name,
      normalizedName: row.card_normalized_name,
      slug: row.card_slug,
      subtypes: relationMap.subtypes.get(row.card_uuid) ?? [],
      types: relationMap.types.get(row.card_uuid) ?? [],
      uuid: row.card_uuid,
    };

    return {
      card,
      edition: mapEditionRow(row),
    };
  }

  async getSyncState(): Promise<CatalogSyncState> {
    const metadata = await getMetadataMap(this.db, syncMetadataKeys);
    const counts = await this.getCatalogCounts();

    return {
      lastAttemptAt: metadata.get('catalog.last_attempt_at') ?? null,
      lastError: metadata.get('catalog.last_error') ?? null,
      lastSuccessfulSyncAt:
        metadata.get('catalog.last_successful_sync_at') ?? null,
      sourceCardCount: parseNullableNumber(
        metadata.get('catalog.source_card_count'),
      ),
      status:
        (metadata.get('catalog.status') as CatalogSyncState['status']) ??
        'idle',
      syncedCardCount: counts.cards,
      syncedEditionCount: counts.editions,
    };
  }

  async markSyncStarted(sourceCardCount: number | null = null) {
    const now = new Date().toISOString();

    await setMetadataValue(this.db, 'catalog.status', 'syncing', now);
    await setMetadataValue(this.db, 'catalog.last_attempt_at', now, now);
    await setMetadataValue(this.db, 'catalog.last_error', null, now);

    if (sourceCardCount !== null) {
      await setMetadataValue(
        this.db,
        'catalog.source_card_count',
        String(sourceCardCount),
        now,
      );
    }
  }

  async markSyncSucceeded(completedAt = new Date().toISOString()) {
    await setMetadataValue(this.db, 'catalog.status', 'ready', completedAt);
    await setMetadataValue(
      this.db,
      'catalog.last_successful_sync_at',
      completedAt,
      completedAt,
    );
    await setMetadataValue(this.db, 'catalog.last_error', null, completedAt);
  }

  async markSyncFailed(error: string, failedAt = new Date().toISOString()) {
    await setMetadataValue(this.db, 'catalog.status', 'failed', failedAt);
    await setMetadataValue(
      this.db,
      'catalog.last_attempt_at',
      failedAt,
      failedAt,
    );
    await setMetadataValue(this.db, 'catalog.last_error', error, failedAt);
  }

  async getCatalogCounts() {
    const cards = await this.db.getFirst<{ count: number }>(
      'SELECT COUNT(*) AS count FROM cards',
    );
    const editions = await this.db.getFirst<{ count: number }>(
      'SELECT COUNT(*) AS count FROM editions',
    );

    return {
      cards: Number(cards?.count ?? 0),
      editions: Number(editions?.count ?? 0),
    };
  }

  private async upsertCard(card: CatalogCard, syncedAt: string) {
    await this.db.execute(
      `
        INSERT INTO cards (
          uuid,
          slug,
          name,
          normalized_name,
          cost_type,
          cost_value,
          level,
          power,
          life,
          durability,
          speed,
          effect_raw,
          flavor,
          last_update,
          raw_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uuid) DO UPDATE SET
          slug = excluded.slug,
          name = excluded.name,
          normalized_name = excluded.normalized_name,
          cost_type = excluded.cost_type,
          cost_value = excluded.cost_value,
          level = excluded.level,
          power = excluded.power,
          life = excluded.life,
          durability = excluded.durability,
          speed = excluded.speed,
          effect_raw = excluded.effect_raw,
          flavor = excluded.flavor,
          last_update = excluded.last_update,
          raw_json = excluded.raw_json
      `,
      [
        card.uuid,
        card.slug,
        card.name,
        card.normalizedName,
        card.costType,
        card.costValue,
        card.level,
        card.power,
        card.life,
        card.durability,
        card.speed,
        card.effectRaw,
        card.flavor,
        card.lastUpdate,
        card.rawJson,
      ],
    );

    await this.replaceRelations('card_types', 'type', card.uuid, card.types);
    await this.replaceRelations(
      'card_subtypes',
      'subtype',
      card.uuid,
      card.subtypes,
    );
    await this.replaceRelations(
      'card_classes',
      'class',
      card.uuid,
      card.classes,
    );
    await this.replaceRelations(
      'card_elements',
      'element',
      card.uuid,
      card.elements,
    );

    for (const edition of card.editions) {
      await this.upsertEdition(edition);
    }

    await this.upsertSearchIndex(card, syncedAt);
  }

  private async upsertEdition(edition: CatalogEdition) {
    await this.db.execute(
      `
        INSERT INTO editions (
          uuid,
          card_uuid,
          slug,
          set_prefix,
          normalized_set_prefix,
          set_name,
          collector_number,
          normalized_collector_number,
          rarity,
          language,
          image_path,
          release_date,
          last_update,
          raw_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uuid) DO UPDATE SET
          card_uuid = excluded.card_uuid,
          slug = excluded.slug,
          set_prefix = excluded.set_prefix,
          normalized_set_prefix = excluded.normalized_set_prefix,
          set_name = excluded.set_name,
          collector_number = excluded.collector_number,
          normalized_collector_number = excluded.normalized_collector_number,
          rarity = excluded.rarity,
          language = excluded.language,
          image_path = excluded.image_path,
          release_date = excluded.release_date,
          last_update = excluded.last_update,
          raw_json = excluded.raw_json
      `,
      [
        edition.uuid,
        edition.cardUuid,
        edition.slug,
        edition.setPrefix,
        edition.normalizedSetPrefix,
        edition.setName,
        edition.collectorNumber,
        edition.normalizedCollectorNumber,
        edition.rarity,
        edition.language,
        edition.imagePath,
        edition.releaseDate,
        edition.lastUpdate,
        edition.rawJson,
      ],
    );
  }

  private async replaceRelations(
    tableName:
      'card_types' | 'card_subtypes' | 'card_classes' | 'card_elements',
    columnName: 'type' | 'subtype' | 'class' | 'element',
    cardUuid: string,
    values: string[],
  ) {
    await this.db.execute(`DELETE FROM ${tableName} WHERE card_uuid = ?`, [
      cardUuid,
    ]);

    for (const value of values) {
      await this.db.execute(
        `INSERT OR IGNORE INTO ${tableName} (card_uuid, ${columnName}) VALUES (?, ?)`,
        [cardUuid, value],
      );
    }
  }

  private async upsertSearchIndex(card: CatalogCard, syncedAt: string) {
    const searchableText = buildCatalogSearchText(card);

    await this.db.execute(
      `
        INSERT INTO card_search_index (
          card_uuid,
          name,
          normalized_name,
          slug,
          searchable_text,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(card_uuid) DO UPDATE SET
          name = excluded.name,
          normalized_name = excluded.normalized_name,
          slug = excluded.slug,
          searchable_text = excluded.searchable_text,
          updated_at = excluded.updated_at
      `,
      [
        card.uuid,
        card.name,
        card.normalizedName,
        card.slug,
        searchableText,
        syncedAt,
      ],
    );

    if (await this.isFtsEnabled()) {
      await this.db.execute(
        `
          INSERT OR REPLACE INTO card_search_fts (
            card_uuid,
            name,
            normalized_name,
            slug,
            searchable_text
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [card.uuid, card.name, card.normalizedName, card.slug, searchableText],
      );
    }
  }

  private async searchCardsWithFts(
    filters: CatalogCardSearchFilters,
    normalizedQuery: string,
  ) {
    const query = buildFtsQuery(normalizedQuery);

    if (!query) {
      return this.searchCardsWithLike(filters, normalizedQuery);
    }

    const { joins, where, params } = buildSearchClauses(filters);
    const rows = await this.db.getAll<CardRow>(
      `
        SELECT DISTINCT c.*
        FROM card_search_fts
        INNER JOIN cards c ON c.uuid = card_search_fts.card_uuid
        INNER JOIN card_search_index si ON si.card_uuid = c.uuid
        ${joins.join('\n')}
        WHERE card_search_fts MATCH ?
          ${where.length ? `AND ${where.join(' AND ')}` : ''}
        ORDER BY
          CASE
            WHEN c.normalized_name = ? THEN 0
            WHEN c.normalized_name LIKE ? THEN 1
            ELSE 2
          END,
          c.name COLLATE NOCASE
        LIMIT ?
      `,
      [
        query,
        ...params,
        normalizedQuery,
        `${normalizedQuery}%`,
        filters.limit ?? 50,
      ],
    );

    return this.hydrateCards(rows);
  }

  private async searchCardsWithLike(
    filters: CatalogCardSearchFilters,
    normalizedQuery: string,
  ) {
    const { joins, where, params } = buildSearchClauses(filters);
    const queryParams: SqlParameter[] = [...params];

    if (normalizedQuery) {
      where.unshift('si.searchable_text LIKE ?');
      queryParams.unshift(`%${normalizedQuery}%`);
    }

    const rows = await this.db.getAll<CardRow>(
      `
        SELECT DISTINCT c.*
        FROM cards c
        INNER JOIN card_search_index si ON si.card_uuid = c.uuid
        ${joins.join('\n')}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY
          CASE
            WHEN c.normalized_name = ? THEN 0
            WHEN c.normalized_name LIKE ? THEN 1
            ELSE 2
          END,
          c.name COLLATE NOCASE
        LIMIT ?
      `,
      [
        ...queryParams,
        normalizedQuery,
        normalizedQuery ? `${normalizedQuery}%` : '%',
        filters.limit ?? 50,
      ],
    );

    return this.hydrateCards(rows);
  }

  private async hydrateCards(rows: CardRow[]): Promise<CatalogCard[]> {
    if (rows.length === 0) {
      return [];
    }

    const cardUuids = rows.map((row) => row.uuid);
    const relationMaps = await this.loadRelationMaps(cardUuids);
    const editionRows = await this.loadEditions(cardUuids);
    const editionsByCardUuid = new Map<string, CatalogEdition[]>();

    for (const row of editionRows) {
      const editions = editionsByCardUuid.get(row.card_uuid) ?? [];
      editions.push(mapEditionRow(row));
      editionsByCardUuid.set(row.card_uuid, editions);
    }

    return rows.map((row) => ({
      classes: relationMaps.classes.get(row.uuid) ?? [],
      costType: row.cost_type,
      costValue: row.cost_value,
      durability: row.durability,
      editions: editionsByCardUuid.get(row.uuid) ?? [],
      effectRaw: row.effect_raw,
      elements: relationMaps.elements.get(row.uuid) ?? [],
      flavor: row.flavor,
      lastUpdate: row.last_update,
      level: row.level,
      life: row.life,
      name: row.name,
      normalizedName: row.normalized_name,
      power: row.power,
      rawJson: row.raw_json,
      slug: row.slug,
      speed: row.speed,
      subtypes: relationMaps.subtypes.get(row.uuid) ?? [],
      types: relationMaps.types.get(row.uuid) ?? [],
      uuid: row.uuid,
    }));
  }

  private async loadRelationMaps(cardUuids: string[]) {
    return {
      classes: await this.loadRelationMap('card_classes', 'class', cardUuids),
      elements: await this.loadRelationMap(
        'card_elements',
        'element',
        cardUuids,
      ),
      subtypes: await this.loadRelationMap(
        'card_subtypes',
        'subtype',
        cardUuids,
      ),
      types: await this.loadRelationMap('card_types', 'type', cardUuids),
    };
  }

  private async loadRelationMap(
    tableName:
      'card_types' | 'card_subtypes' | 'card_classes' | 'card_elements',
    columnName: 'type' | 'subtype' | 'class' | 'element',
    cardUuids: string[],
  ) {
    const map = new Map<string, string[]>();

    if (cardUuids.length === 0) {
      return map;
    }

    const placeholders = cardUuids.map(() => '?').join(', ');
    const rows = await this.db.getAll<{ card_uuid: string; value: string }>(
      `
        SELECT card_uuid, ${columnName} AS value
        FROM ${tableName}
        WHERE card_uuid IN (${placeholders})
        ORDER BY value ASC
      `,
      cardUuids,
    );

    for (const row of rows) {
      const values = map.get(row.card_uuid) ?? [];
      values.push(row.value);
      map.set(row.card_uuid, values);
    }

    return map;
  }

  private async loadEditions(cardUuids: string[]) {
    if (cardUuids.length === 0) {
      return [];
    }

    const placeholders = cardUuids.map(() => '?').join(', ');

    return this.db.getAll<EditionRow>(
      `
        SELECT *
        FROM editions
        WHERE card_uuid IN (${placeholders})
        ORDER BY set_prefix ASC, collector_number ASC
      `,
      cardUuids,
    );
  }

  private async isFtsEnabled() {
    return (await getMetadataValue(this.db, 'search.fts_enabled')) === 'true';
  }
}

export function mapEditionRow(row: EditionRow): CatalogEdition {
  return {
    cardUuid: row.card_uuid,
    collectorNumber: row.collector_number,
    imagePath: row.image_path,
    language: row.language,
    lastUpdate: row.last_update,
    normalizedCollectorNumber: row.normalized_collector_number,
    normalizedSetPrefix: row.normalized_set_prefix,
    rarity: row.rarity,
    rawJson: row.raw_json,
    releaseDate: row.release_date,
    setName: row.set_name,
    setPrefix: row.set_prefix,
    slug: row.slug,
    uuid: row.uuid,
  };
}

function buildSearchClauses(filters: CatalogCardSearchFilters) {
  const joins: string[] = [];
  const where: string[] = [];
  const params: SqlParameter[] = [];

  if (filters.type) {
    where.push(
      'EXISTS (SELECT 1 FROM card_types ct WHERE ct.card_uuid = c.uuid AND ct.type = ?)',
    );
    params.push(normalizeCardType(filters.type));
  }

  if (filters.element) {
    where.push(
      'EXISTS (SELECT 1 FROM card_elements ce WHERE ce.card_uuid = c.uuid AND ce.element = ?)',
    );
    params.push(normalizeFacet(filters.element));
  }

  if (filters.class) {
    where.push(
      'EXISTS (SELECT 1 FROM card_classes cc WHERE cc.card_uuid = c.uuid AND cc.class = ?)',
    );
    params.push(normalizeFacet(filters.class));
  }

  if (filters.setPrefix) {
    where.push(
      'EXISTS (SELECT 1 FROM editions e WHERE e.card_uuid = c.uuid AND e.normalized_set_prefix = ?)',
    );
    params.push(normalizeSetPrefix(filters.setPrefix));
  }

  return {
    joins,
    params,
    where,
  };
}

function buildFtsQuery(normalizedQuery: string) {
  return normalizedQuery
    .split(/\s+/)
    .map((term) => term.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean)
    .map((term) => `${term}*`)
    .join(' AND ');
}

function parseNullableNumber(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
