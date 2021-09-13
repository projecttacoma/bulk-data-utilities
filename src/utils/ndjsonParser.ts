import * as sqlite3 from 'sqlite3';
import * as Walker from 'walk';
import * as FS from 'fs';
import * as Path from 'path';

let insertedResources = 0;
let checkedReferences = 0;

interface DBWithPromise extends sqlite3.Database {
  promise?: any;
  [key: string]: any;
}

function forEachFile(options: any, cb: any) {
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

    console.log(walker);

    let i = 0;

    walker.on('errors', (root: any, nodeStatsArray: any, next: any) => {
      reject(new Error('Error: ' + nodeStatsArray.error + root + ' - '));
      next();
    });

    walker.on('end', () => {
      console.log('reached');
      resolve();
    });

    walker.on('file', (root: any, fileStats: any, next: any) => {
      console.log(fileStats);
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
 * @param {String} json The JSON input string
 * @return {Promise<Object>} Promises an object
 * @todo Investigate if we can drop the try/catch block and rely on the built-in
 *       error catching.
 */
async function parseJSON(json: any) {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      let out;
      try {
        out = JSON.parse(json);
      } catch (error) {
        return reject(error);
      }
      resolve(out);
    });
  });
}

function parseNDJSON(ndjson: any, callback: any) {
  return new Promise<void>(resolve => {
    const lines = ndjson.trim().split(/\n/);
    let length = lines.length;
    function tick() {
      if (length--) callback(lines.shift(), tick);
      else resolve();
    }
    tick();
  });
}

// Create DB
function createDatabase(location: any) {
  const DB: DBWithPromise = new sqlite3.Database(location);

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

  return Promise.resolve()
    .then(() => DB.promise('run', 'DROP TABLE IF EXISTS "data"'))
    .then(() =>
      DB.promise(
        'run',
        `CREATE TABLE "data"(
                "fhir_type"     Text,
                "resource_id"   Text PRIMARY KEY,
                "resource_json" Text
            );`
      )
    )
    .then(() => DB);
}

function insertResourceIntoDB(line: any, DB: any) {
  return parseJSON(line)
    .then((json: any) =>
      DB.promise(
        'run',
        `INSERT INTO "data"("resource_id", "fhir_type", "resource_json")
            VALUES (?, ?, ?)`,
        json.id,
        json.resourceType,
        line
      )
    )
    .then(() => {
      insertedResources += 1;
    })
    .catch(e => {
      console.log('==========================');
      console.log(line);
      console.log(e);
      console.log('==========================');
      throw e;
    });
}

function checkReferences(db: any) {
  const params = {
    $limit: 100,
    $offset: 0
  };

  function prepare() {
    return new Promise((resolve, reject) => {
      const statement = db.prepare('SELECT * FROM "data" LIMIT $limit OFFSET $offset', params, (prepareError: any) => {
        if (prepareError) {
          return reject(prepareError);
        }
        resolve(statement);
      });
    });
  }

  function getRows(statement: any) {
    return new Promise((resolve, reject) => {
      statement.all(params, (err: any, rows: any) => {
        if (err) {
          return reject(err);
        }
        resolve(rows);
      });
    });
  }

  function checkRow(row: { resource_json: any; fhir_type: any; resource_id: any }) {
    let job = Promise.resolve();
    row.resource_json.replace(/"reference":"(.*?)\/(.*?)"/gi, function (_: any, resourceType: any, resourceId: any) {
      job = job
        .then(() =>
          db.promise('get', 'SELECT * FROM "data" WHERE "fhir_type" = ? AND resource_id = ?', resourceType, resourceId)
        )
        .then(result => {
          if (!result) {
            throw new Error(
              `Unresolved reference from ${row.fhir_type}/${row.resource_id} to ${resourceType}/${resourceId}`
            );
          }
          checkedReferences += 1;
        });
    });
    return job;
  }

  function checkRowSet(statement: any): any {
    return getRows(statement).then((rowSet: any) => {
      process.stdout.write('Checking rows ' + params.$offset + ' to ' + (params.$offset + params.$limit));
      if (rowSet.length) {
        return Promise.all(rowSet.map(checkRow)).then(() => {
          params.$offset += rowSet.length;
          return checkRowSet(statement);
        });
      }
    });
  }

  return prepare().then(statement => checkRowSet(statement));
}

export function populateDB(): void {
  let DB: sqlite3.Database;
  createDatabase('./database.db')
    .then(db => {
      DB = db;
      return new Promise((resolve, reject) => {
        const job = forEachFile(
          {
            dir: './src/ndjsonDownloads',
            filter: (path: string) => path.endsWith('.ndjson')
          },
          (path: string, fileStats: { name: any }, next: any): any => {
            readFile(path, 'utf8')
              .then((lines: any) => {
                console.log(`Inserting resources from ${fileStats.name}...`);
                return Promise.all(
                  lines
                    .trim()
                    .split(/\n/)
                    .map((line: any) => {
                      return insertResourceIntoDB(line, DB);
                    })
                );
              })
              .then(next);
          }
        );

        resolve(job);
      });
    })
    .then(() => checkReferences(DB))
    .then(() => {
      console.log('\nValidation complete');
      console.log(`${insertedResources} resources inserted in DB`);
      console.log(`${checkedReferences} references checked\n`);
    })
    .catch(e => console.error(e.message || String(e)));
}

populateDB();
