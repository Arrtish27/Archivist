export type SqlParameter = string | number | null | Uint8Array;

export type SqlParameters = SqlParameter[] | Record<string, SqlParameter>;

export type SqlRunResult = {
  rowsAffected: number;
  lastInsertRowId?: number;
};

export type AppDatabase = {
  execute(sql: string, params?: SqlParameters): Promise<SqlRunResult>;
  executeRaw(sql: string): Promise<void>;
  getFirst<T extends Record<string, unknown>>(
    sql: string,
    params?: SqlParameters,
  ): Promise<T | null>;
  getAll<T extends Record<string, unknown>>(
    sql: string,
    params?: SqlParameters,
  ): Promise<T[]>;
  withTransaction<T>(task: () => Promise<T>): Promise<T>;
  close?(): Promise<void>;
};

export const emptyParams: SqlParameter[] = [];
