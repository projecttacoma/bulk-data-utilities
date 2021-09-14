import { Database } from 'sqlite3';

export interface DBWithPromise extends Database {
  promise?: any;
  [key: string]: any;
}
