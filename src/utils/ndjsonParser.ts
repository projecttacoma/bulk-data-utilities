/* eslint-disable  @typescript-eslint/no-explicit-any */

import * as sqlite3 from 'sqlite3';
import * as Walker from 'walk';
import * as FS from 'fs';
import * as Path from 'path';
// wrapper around sqlite3 that is promise-based
import * as sqlite from 'sqlite';

// Used to log number of resources inserted into the db
let insertedResources = 0;

/**
 * Parses through each file and calls function on each file
 * @param options object containing specified options to use for reading files
 * @param cb function to be called on each file
 */
function forEachFile(options: any, execute: (path: string, fileStats: any, next: any) => any): Promise<void> {
  options = Object.assign(
    {
      dir: '.',
      filter: null,
      followLinks: false,
      limit: 0
    },
    options
  );

  return new Promise<void>((resolve, reject) => {
    const walker = Walker.walk(options.dir, {
      followLinks: options.followLinks
    });

    let i = 0;

    walker.on('errors', (root: string, nodeStatsArray: any, next: any) => {
      reject(new Error('Error: ' + nodeStatsArray.error + root + ' - '));
      next();
    });

    walker.on('end', () => {
      resolve();
    });

    walker.on('file', (root: string, fileStats: { name: string }, next: any) => {
      const path = Path.resolve(root, fileStats.name);
      if (options.filter && !options.filter(path)) {
        return next();
      }
      if (options.limit && ++i > options.limit) {
        return next();
      }
      execute(path, fileStats, next);
    });
  });
}

/**
 * takes in the desired path to a db and creates the db with appropriate tables
 * in that location
 * @param location the file path to where you want the directory created
 * @returns a Promise which resolves to a sqlite database
 */
export async function createDatabase(location: string): Promise<sqlite.Database> {
  const DB = await sqlite.open({
    filename: location,
    driver: sqlite3.Database
  });

  await DB.run('DROP TABLE IF EXISTS "fhir_resources"');
  await DB.run(
    `CREATE TABLE "fhir_resources"(
            "fhir_type"     Text,
            "resource_id"   Text PRIMARY KEY,
            "resource_json" Text
        );`
  );
  await DB.run('DROP TABLE IF EXISTS "local_references"');
  await DB.run(
    `CREATE TABLE "local_references"(
        "reference_id" Text,
        "origin_resource_id" Text,
        FOREIGN KEY("origin_resource_id") REFERENCES fhir_resources("resource_id"),
        PRIMARY KEY("origin_resource_id", "reference_id")
      );`
  );
  return DB;
}

/**
 * Converts the passed in json string to a valid fhir_resources entry and adds it to fhir_resources,
 * then finds all local references of that resource and adds them to local_references table
 * @param DB the sqlite database to insert the resource into
 * @param line a json string representing a fhir_resource
 * @returns
 */
export async function insertResourceIntoDB(DB: sqlite.Database, line: string): Promise<void> {
  const json = JSON.parse(line);
  const localRefsArray = getLocalReferences(json);
  await DB.run(
    `INSERT INTO "fhir_resources"("resource_id", "fhir_type", "resource_json")
        VALUES (?, ?, ?)`,
    json.id,
    json.resourceType,
    line
  );
  if (localRefsArray.length > 0) {
    await DB.run(
      `INSERT OR IGNORE INTO "local_references"("origin_resource_id", "reference_id")
        VALUES ${Array(localRefsArray.length).fill('(?, ?)').join(', ')};`,
      ...localRefsArray.reduce((acc: string[], e) => {
        acc.push(json.id, e.split(/[\/:]+/).slice(-1)[0]); //Regex splits string on : or /
        return acc;
      }, [])
    );
  }
  insertedResources += 1;
}

/**
 * Traverses the reference graph in the sqlite db and determines if all references are valid
 * @param db a sqlite database we want to check the references of
 */
export async function checkReferences(db: sqlite.Database): Promise<void> {
  const params = {
    $limit: 100,
    $offset: 0
  };

  /**
   * returns an array of size $limit of rows from the db, starting at row: $offset
   */
  const getRowSet = async () => await db.all('SELECT * FROM "fhir_resources" LIMIT $limit OFFSET $offset', params);

  const checkRow = async (row: { resource_json: string; fhir_type: string; resource_id: string }): Promise<any> => {
    //Check if this regex is correct. Will all resources be uploaded in this format?
    const references = Array.from(row.resource_json.matchAll(new RegExp(/"reference":"(.*?)\/(.*?)"/gi)), m => [
      m[1],
      m[2]
    ]);
    references.push(
      ...Array.from(row.resource_json.matchAll(new RegExp(/"reference":"urn:uuid:(.*?)"/gi)), m => ['urn:uuid', m[1]])
    );
    if (references.length > 0) {
      const q = references.map(async (ref: string[]) => {
        const [referenceType, referenceId] = ref;

        const foundRef = await db.get('SELECT * FROM "fhir_resources" WHERE resource_id = ?', referenceId);

        if (!foundRef) {
          throw new Error(
            `Unresolved reference from ${row.fhir_type}/${row.resource_id} to ${referenceType}${
              referenceType === 'urn:uuid' ? ':' : '/'
            }${referenceId}`
          );
        }
        return foundRef;
      });
      return Promise.all(q);
    }
    return [];
  };

  const checkRowSet = async (): Promise<any> => {
    const rowSet = await getRowSet();
    if (rowSet.length) {
      params.$offset += rowSet.length;
      await checkRowSet();
      return Promise.all(rowSet.map(checkRow)).catch(e => {
        throw new Error(e);
      });
    }
  };
  await checkRowSet();
}

/**
 * Gets all references from fhir object. must be recursive since we
 * don't know what level the reference will occur at and we need them all
 * @param entry a json object representing any fhir resource
 * @return array of IDs for local references
 */

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function getLocalReferences(entry: any): string[] {
  const targetKey = 'reference';
  const references: string[] = [];
  if (typeof entry !== 'object') {
    return [];
  }
  Object.keys(entry).forEach(key => {
    if (key === targetKey) {
      references.push(entry[key]);
    }
    references.push(...getLocalReferences(entry[key]));
  });

  return references;
}

/**
 * takes in a directory containing ndjson files and creates and populated a db with fhir_resources
 * and local references based on the contents of the ndjson files
 * @param ndjsonDirectory the directory with ndjson files
 * @param location a file path signifying where to store the created db
 * @returns a promise which resolves to a sqlite3 db
 */
export async function populateDB(ndjsonDirectory: string, location: string): Promise<sqlite.Database> {
  const DB: sqlite.Database = await createDatabase(location);
  await forEachFile(
    {
      dir: ndjsonDirectory,
      filter: (path: string) => path.endsWith('.ndjson')
    },
    async (path: string, fileStats: { name: string }, next: any): Promise<void> => {
      const lines = FS.readFileSync(path, 'utf8');
      if (lines) {
        console.log(`Inserting resources from ${fileStats.name}...`);
        const promises = lines
          .trim()
          .split(/\n/)
          .map(async (line: string) => await insertResourceIntoDB(DB, line));
        await Promise.all(promises);
        next();
      }
    }
  );

  await checkReferences(DB);
  console.log('\nValidation complete');
  console.log(`${insertedResources} resources inserted in DB`);
  return DB;
}
