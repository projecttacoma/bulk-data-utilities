//import { Database } from 'sqlite3';
import { Database } from 'sqlite';

export interface DBWithPromise extends Database {
  promise?: any;
  [key: string]: any;
}
