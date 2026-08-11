declare module 'sql.js' {
  export type SqlValue = string | number | null | Uint8Array;
  export type BindParams = Record<string, SqlValue> | SqlValue[];

  export interface Statement {
    bind(values?: BindParams): void;
    step(): boolean;
    getAsObject(): Record<string, SqlValue>;
    free(): void;
  }

  export interface Database {
    run(sql: string, params?: BindParams): void;
    exec(sql: string): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
  }

  export interface SqlJsStatic {
    Database: new (data?: Buffer | Uint8Array) => Database;
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}
