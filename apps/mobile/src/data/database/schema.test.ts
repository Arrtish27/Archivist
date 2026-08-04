import { describe, expect, it } from 'vitest';

import { createSqlJsTestDatabase } from './SqlJsTestDatabase';
import { migrateDatabase } from './schema';

describe('database schema', () => {
  it('creates Phase 01 tables and keeps collection persistence deferred', async () => {
    const db = await createSqlJsTestDatabase();

    await migrateDatabase(db);

    const tables = await db.getAll<{ name: string }>(
      `
        SELECT name
        FROM sqlite_master
        WHERE type IN ('table', 'view')
        ORDER BY name
      `,
    );
    const tableNames = tables.map((table) => table.name);

    expect(tableNames).toContain('cards');
    expect(tableNames).toContain('editions');
    expect(tableNames).toContain('card_search_index');
    expect(tableNames).toContain('decks');
    expect(tableNames).toContain('deck_cards');
    expect(tableNames).toContain('deck_snapshots');
    expect(tableNames).not.toContain('collection_items');

    const schemaVersion = await db.getFirst<{ value: string }>(
      "SELECT value FROM app_metadata WHERE key = 'schema.version'",
    );
    const collectionDeferred = await db.getFirst<{ value: string }>(
      "SELECT value FROM app_metadata WHERE key = 'collection.deferred'",
    );

    expect(schemaVersion?.value).toBe('1');
    expect(collectionDeferred?.value).toBe('true');

    await db.close?.();
  });
});
