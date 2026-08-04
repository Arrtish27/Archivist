import { openDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';

import {
  AppDatabase,
  emptyParams,
  SqlParameters,
  SqlRunResult,
} from './Database';

export class ExpoSQLiteDatabase implements AppDatabase {
  constructor(private readonly db: SQLiteDatabase) {}

  async execute(
    sql: string,
    params: SqlParameters = emptyParams,
  ): Promise<SqlRunResult> {
    const result = await this.db.runAsync(sql, params);

    return {
      lastInsertRowId: result.lastInsertRowId,
      rowsAffected: result.changes,
    };
  }

  async executeRaw(sql: string) {
    await this.db.execAsync(sql);
  }

  async getFirst<T extends Record<string, unknown>>(
    sql: string,
    params: SqlParameters = emptyParams,
  ) {
    return this.db.getFirstAsync<T>(sql, params);
  }

  async getAll<T extends Record<string, unknown>>(
    sql: string,
    params: SqlParameters = emptyParams,
  ) {
    return this.db.getAllAsync<T>(sql, params);
  }

  async withTransaction<T>(task: () => Promise<T>) {
    let result: T | undefined;

    await this.db.withTransactionAsync(async () => {
      result = await task();
    });

    return result as T;
  }

  async close() {
    await this.db.closeAsync();
  }
}

export async function openAppDatabase(databaseName = 'archivist.db') {
  return new ExpoSQLiteDatabase(await openDatabaseAsync(databaseName));
}
