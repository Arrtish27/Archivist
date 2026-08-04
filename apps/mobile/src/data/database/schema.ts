import { AppDatabase } from './Database';
import { setMetadataValue } from './metadata';

export const DATABASE_SCHEMA_VERSION = 1;

const coreSchema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  uuid TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  cost_type TEXT,
  cost_value TEXT,
  level TEXT,
  power TEXT,
  life TEXT,
  durability TEXT,
  speed TEXT,
  effect_raw TEXT,
  flavor TEXT,
  last_update TEXT NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS card_types (
  card_uuid TEXT NOT NULL,
  type TEXT NOT NULL,
  PRIMARY KEY (card_uuid, type),
  FOREIGN KEY (card_uuid) REFERENCES cards(uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS card_subtypes (
  card_uuid TEXT NOT NULL,
  subtype TEXT NOT NULL,
  PRIMARY KEY (card_uuid, subtype),
  FOREIGN KEY (card_uuid) REFERENCES cards(uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS card_classes (
  card_uuid TEXT NOT NULL,
  class TEXT NOT NULL,
  PRIMARY KEY (card_uuid, class),
  FOREIGN KEY (card_uuid) REFERENCES cards(uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS card_elements (
  card_uuid TEXT NOT NULL,
  element TEXT NOT NULL,
  PRIMARY KEY (card_uuid, element),
  FOREIGN KEY (card_uuid) REFERENCES cards(uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS editions (
  uuid TEXT PRIMARY KEY,
  card_uuid TEXT NOT NULL,
  slug TEXT NOT NULL,
  set_prefix TEXT NOT NULL,
  normalized_set_prefix TEXT NOT NULL,
  set_name TEXT NOT NULL,
  collector_number TEXT NOT NULL,
  normalized_collector_number TEXT NOT NULL,
  rarity REAL,
  language TEXT,
  image_path TEXT,
  release_date TEXT,
  last_update TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  FOREIGN KEY (card_uuid) REFERENCES cards(uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS card_search_index (
  card_uuid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  slug TEXT NOT NULL,
  searchable_text TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (card_uuid) REFERENCES cards(uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format_id TEXT NOT NULL DEFAULT 'standard',
  champion_identity_card_uuid TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (champion_identity_card_uuid) REFERENCES cards(uuid) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS deck_cards (
  id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL,
  section TEXT NOT NULL CHECK(section IN ('material', 'main', 'sideboard')),
  card_uuid TEXT NOT NULL,
  edition_uuid TEXT,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  sort_order INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
  FOREIGN KEY (card_uuid) REFERENCES cards(uuid) ON DELETE RESTRICT,
  FOREIGN KEY (edition_uuid) REFERENCES editions(uuid) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS deck_snapshots (
  id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL,
  label TEXT NOT NULL,
  export_text TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cards_normalized_name
ON cards (normalized_name);

CREATE INDEX IF NOT EXISTS idx_card_search_index_text
ON card_search_index (searchable_text);

CREATE INDEX IF NOT EXISTS idx_card_types_type
ON card_types (type);

CREATE INDEX IF NOT EXISTS idx_card_classes_class
ON card_classes (class);

CREATE INDEX IF NOT EXISTS idx_card_elements_element
ON card_elements (element);

CREATE INDEX IF NOT EXISTS idx_editions_set_collector
ON editions (normalized_set_prefix, normalized_collector_number);

CREATE INDEX IF NOT EXISTS idx_editions_card_uuid
ON editions (card_uuid);

CREATE INDEX IF NOT EXISTS idx_decks_archived_at
ON decks (archived_at);

CREATE INDEX IF NOT EXISTS idx_deck_cards_deck_id
ON deck_cards (deck_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_cards_unique_card
ON deck_cards (deck_id, section, card_uuid, IFNULL(edition_uuid, ''));

CREATE INDEX IF NOT EXISTS idx_deck_snapshots_deck_id
ON deck_snapshots (deck_id);
`;

export async function migrateDatabase(db: AppDatabase) {
  await db.executeRaw(coreSchema);

  const ftsEnabled = await ensureSearchFts(db);
  const now = new Date().toISOString();

  await setMetadataValue(
    db,
    'schema.version',
    String(DATABASE_SCHEMA_VERSION),
    now,
  );
  await setMetadataValue(
    db,
    'search.fts_enabled',
    ftsEnabled ? 'true' : 'false',
    now,
  );
  await setMetadataValue(db, 'collection.deferred', 'true', now);
}

async function ensureSearchFts(db: AppDatabase) {
  try {
    await db.executeRaw(`
      CREATE VIRTUAL TABLE IF NOT EXISTS card_search_fts USING fts5(
        card_uuid UNINDEXED,
        name,
        normalized_name,
        slug,
        searchable_text
      );
    `);

    return true;
  } catch {
    return false;
  }
}
