import { AppDatabase } from './Database';

export async function getMetadataValue(db: AppDatabase, key: string) {
  const row = await db.getFirst<{ value: string }>(
    'SELECT value FROM app_metadata WHERE key = ?',
    [key],
  );

  return row?.value ?? null;
}

export async function setMetadataValue(
  db: AppDatabase,
  key: string,
  value: string | null,
  updatedAt = new Date().toISOString(),
) {
  await db.execute(
    `
      INSERT INTO app_metadata (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
    [key, value, updatedAt],
  );
}

export async function getMetadataMap(db: AppDatabase, keys: string[]) {
  if (keys.length === 0) {
    return new Map<string, string | null>();
  }

  const placeholders = keys.map(() => '?').join(', ');
  const rows = await db.getAll<{ key: string; value: string | null }>(
    `SELECT key, value FROM app_metadata WHERE key IN (${placeholders})`,
    keys,
  );

  return new Map(rows.map((row) => [row.key, row.value]));
}
