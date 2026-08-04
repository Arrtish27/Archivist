import initSqlJs, { Database as SqlJsDatabaseStatic } from 'sql.js';

import {
  AppDatabase,
  emptyParams,
  SqlParameter,
  SqlParameters,
  SqlRunResult,
} from './Database';

export class SqlJsTestDatabase implements AppDatabase {
  constructor(private readonly db: SqlJsDatabaseStatic) {}

  async execute(
    sql: string,
    params: SqlParameters = emptyParams,
  ): Promise<SqlRunResult> {
    this.db.run(sql, toMutableParams(params));

    return {
      rowsAffected: this.db.getRowsModified(),
    };
  }

  async executeRaw(sql: string) {
    this.db.run(sql);
  }

  async getFirst<T extends Record<string, unknown>>(
    sql: string,
    params: SqlParameters = emptyParams,
  ) {
    const rows = await this.getAll<T>(sql, params);

    return rows[0] ?? null;
  }

  async getAll<T extends Record<string, unknown>>(
    sql: string,
    params: SqlParameters = emptyParams,
  ) {
    const statement = this.db.prepare(sql, toMutableParams(params));
    const rows: T[] = [];

    try {
      while (statement.step()) {
        rows.push(statement.getAsObject() as T);
      }
    } finally {
      statement.free();
    }

    return rows;
  }

  async withTransaction<T>(task: () => Promise<T>) {
    await this.executeRaw('BEGIN');

    try {
      const result = await task();
      await this.executeRaw('COMMIT');

      return result;
    } catch (error) {
      await this.executeRaw('ROLLBACK');
      throw error;
    }
  }

  async close() {
    this.db.close();
  }
}

export async function createSqlJsTestDatabase() {
  const SQL = await initSqlJs({
    locateFile: (file) => `../../node_modules/sql.js/dist/${file}`,
  });

  const db = new SQL.Database();
  return new SqlJsTestDatabase(db);
}

function toMutableParams(params: SqlParameters) {
  if (Array.isArray(params)) {
    return [...params] as SqlParameter[];
  }

  return params;
}
