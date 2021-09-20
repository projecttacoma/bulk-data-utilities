import * as sqlite3 from 'sqlite3';
import * as Walker from 'walk';
import * as FS from 'fs';
import * as Path from 'path';
// wrapper around sqlite3 that is promise-based
import * as sqlite from 'sqlite';

let insertedResources = 0;

/**
 *
 * @param options object containing specified options to use for reading files
 * @param cb
 * @returns
 */
function forEachFile(options: any, cb: any): Promise<void> {
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

    walker.on('errors', (root: any, nodeStatsArray: any, next: any) => {
      reject(new Error('Error: ' + nodeStatsArray.error + root + ' - '));
      next();
    });

    walker.on('end', () => {
      resolve();
    });

    walker.on('file', (root: any, fileStats: any, next: any) => {
      const path = Path.resolve(root, fileStats.name);
      if (options.filter && !options.filter(path)) {
        return next();
      }
      if (options.limit && ++i > options.limit) {
        return next();
      }
      cb(path, fileStats, next);
    });
  });
}

// Create DB
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
 *
 * @param line
 * @param DB
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
  insertedResources += 1; //We need to update this. No longer accurate (insertions for refs table)
}

/**
 *
 * @param db
 */
export async function checkReferences(db: sqlite.Database): Promise<void> {
  const params = {
    $limit: 100,
    $offset: 0
  };

  const getRowSet = async () => await db.all('SELECT * FROM "fhir_resources" LIMIT $limit OFFSET $offset', params);

  //This will need to change for urn:uuid refs
  const checkRow = async (row: { resource_json: string; fhir_type: string; resource_id: string }): Promise<void> => {
    //Chec if this regex is correct. Will all resources be uploaded in this format?
    const references = Array.from(row.resource_json.matchAll(new RegExp(/"reference":"(.*?)\/(.*?)"/gi)), m => [
      m[1],
      m[2]
    ]);
    if (references) {
      references.map(async (ref: string[]) => {
        const [referenceType, referenceId] = ref;

        const foundRef = await db.get('SELECT * FROM "fhir_resources" WHERE resource_id = ?', referenceId);

        if (!foundRef) {
          console.log('reached');
          throw new Error(
            `Unresolved reference from ${row.fhir_type}/${row.resource_id} to ${referenceType}/${referenceId}`
          );
        }
        return await Promise.all(references);
      });
    }
  };

  const checkRowSet: any = async (): Promise<void> => {
    const rowSet = await getRowSet();
    if (rowSet.length) {
      await Promise.all(rowSet.map(checkRow)).catch(e => {
        throw new Error(e);
      });
      params.$offset += rowSet.length;
      await checkRowSet();
    }
  };
  return await checkRowSet();
}

/**
 * Gets all references from fhir object. must be recursive since we
 * don't know what level the reference will occur at and we need them all
 * @param fhirResource
 * @return array of IDs for local references
 */
export function getLocalReferences(fhirResource: any): string[] {
  const targetKey = 'reference';
  const references: string[] = [];
  if (typeof fhirResource !== 'object') {
    return [];
  }
  Object.keys(fhirResource).forEach(key => {
    if (key === targetKey) {
      references.push(fhirResource[key]);
    }
    references.push(...getLocalReferences(fhirResource[key]));
  });

  return references;
}

export async function populateDB(ndjsonDirectory: string, location: string): Promise<sqlite.Database> {
  const DB: sqlite.Database = await createDatabase(location);
  await forEachFile(
    {
      dir: ndjsonDirectory,
      filter: (path: string) => path.endsWith('.ndjson')
    },
    async (path: string, fileStats: { name: any }, next: any): Promise<void> => {
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
