import * as sqlite3 from 'sqlite3';
import * as Walker from 'walk';
import * as FS from 'fs';
import * as Path from 'path';
import { DBWithPromise } from '../types/DatabaseTypes';
// wrapper around sqlite3 that is promise-based
import { open } from 'sqlite';

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

/**
 * Promisified version of readFile
 * @param {String} path
 * @param {Object} options
 */
async function readFile(path: string, options: string | null = null) {
  return new Promise((resolve, reject) => {
    FS.readFile(path, options, (error, result) => {
      if (error) {
        return reject(error);
      }
      resolve(result);
    });
  });
}

/**
 * Parses the given json string into a JSON object. Internally it uses the
 * JSON.parse() method but adds three things to it:
 * 1. Returns a promise
 * 2. Ensures async result
 * 3. Catches errors and rejects the promise
 * @param json The JSON input string
 * @return Promises an object
 * @todo Investigate if we can drop the try/catch block and rely on the built-in
 *       error catching.
 */

// Create DB
async function createDatabase(location: any): Promise<DBWithPromise> {
  const DB: DBWithPromise = await open({
    filename: './database.db',
    driver: sqlite3.Database
  });

  // delete this eventually if we can fix everything
  /**
   * Calls database methods and returns a promise
   * @param {String} method
   * @param {[*]} args
   */
  DB.promise = (...args: any[]) => {
    const [method, ...params] = args;
    return new Promise((resolve, reject) => {
      DB[method](...params, (error: any, result: any) => {
        if (error) {
          return reject(error);
        }
        resolve(result);
      });
    });
  };

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
async function insertResourceIntoDB(line: any, DB: DBWithPromise): Promise<void> {
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
async function checkReferences(db: DBWithPromise): Promise<void> {
  const params = {
    $limit: 100,
    $offset: 0
  };

  const getRowSet = async () => await db.all('SELECT * FROM "fhir_resources" LIMIT $limit OFFSET $offset', params);

  //This will need to change for urn:uuid refs
  const checkRow = async (row: { resource_json: string; fhir_type: string; resource_id: string }): Promise<void> => {
    const references: string[] | null = row.resource_json.match(/"reference":"(.*?)\/(.*?)"/gi);
    if (references) {
      references.map(async (ref: string) => {
        const [resourceType, resourceId] = ref.split('/');
        const foundRef = await db.get('SELECT * FROM "fhir_resources" WHERE resource_id = ?', resourceId);

        if (!foundRef) {
          throw new Error(
            `Unresolved reference from ${row.fhir_type}/${row.resource_id} to ${resourceType}/${resourceId}`
          );
        }
        await Promise.all(references);
      });
    }
  };

  const checkRowSet: any = async (): Promise<void> => {
    const rowSet = await getRowSet();
    if (rowSet.length) {
      await Promise.all(rowSet.map(checkRow));
      params.$offset += rowSet.length;
      checkRowSet();
    }
  };
}
//   function checkRowSet(statement: any): any {
//     return getRows(statement).then((rowSet: any) => {
//       process.stdout.write('Checking rows ' + params.$offset + ' to ' + (params.$offset + params.$limit));
//       if (rowSet.length) {
//         return Promise.all(rowSet.map(checkRow)).then(() => {
//           params.$offset += rowSet.length;
//           return checkRowSet(statement);
//         });
//       }
//     });
//   }

//   return prepare().then(statement => checkRowSet(statement));
// }

//   function checkRow(row: { resource_json: any; fhir_type: any; resource_id: any }) {
//     let job = Promise.resolve();
//     row.resource_json.replace(/"reference":"(.*?)\/(.*?)"/gi, function (_: any, resourceType: any, resourceId: any) {
//       job = job
//         .then(() =>
//           db.promise(
//             'get',
//             'SELECT * FROM "fhir_resources" WHERE "fhir_type" = ? AND resource_id = ?',
//             resourceType,
//             resourceId
//           )
//         )
//         .then(result => {
//           if (!result) {
//
//           }
//           checkedReferences += 1;
//         });
//     });
//     return job;
//   }

// function checkReferences(db: any) {
//   const params = {
//     $limit: 100,
//     $offset: 0
//   };

//   function prepare() {
//     return new Promise((resolve, reject) => {
//       const statement = db.prepare(
//         'SELECT * FROM "fhir_resources" LIMIT $limit OFFSET $offset',
//         params,
//         (prepareError: any) => {
//           if (prepareError) {
//             return reject(prepareError);
//           }
//           resolve(statement);
//         }
//       );
//     });
//   }

//   function getRows(statement: any) {
//     return new Promise((resolve, reject) => {
//       statement.all(params, (err: any, rows: any) => {
//         if (err) {
//           return reject(err);
//         }
//         resolve(rows);
//       });
//     });
//   }

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

export async function populateDB(ndjsonDirectory: string): Promise<DBWithPromise> {
  const DB: DBWithPromise = await createDatabase('./database.db');
  forEachFile(
    {
      dir: ndjsonDirectory,
      filter: (path: string) => path.endsWith('.ndjson')
    },
    async (path: string, fileStats: { name: any }, next: any): Promise<any> => {
      let lines = '';
      //this is not returning the lines varibale the way we want it. possibly async issues? promise?
      await FS.readFile(path, 'utf8', (err, buf) => (lines = buf));
      console.log(lines);
      if (lines) {
        console.log(`Inserting resources from ${fileStats.name}...`);
        const promises = lines
          .trim()
          .split(/\n/)
          .map(async (line: any) => await insertResourceIntoDB(line, DB));
        await Promise.all(promises);
      }
    }
  );

  await checkReferences(DB);
  console.log('\nValidation complete');
  console.log(`${insertedResources} resources inserted in DB`);
  //console.log(`${checkedReferences} references checked\n`);
  return DB;
}
