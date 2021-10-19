import * as bundleAssemblyHelpers from '../src/utils/bundleAssemblyHelpers';
import * as sqlite3 from 'sqlite3';
// wrapper around sqlite3 that is promise-based
import * as sqlite from 'sqlite';
import testTransactionBundle from './fixtures/testFiles/testTransactionBundle.json';
import { populateDB } from '../src/utils/ndjsonParser';
import fs from 'fs';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import { BulkDataResponse } from '../src/types/RequirementsQueryTypes';
import { TransactionBundle } from '../src/types/TransactionBundle';

async function setupTestDB() {
  // create in-memory DB
  const db: sqlite.Database = await sqlite.open({
    filename: ':memory:',
    driver: sqlite3.Database
  });

  // create test tables in-memory
  try {
    await db.all(`CREATE TABLE "fhir_resources"(
          "fhir_type"     Text,
          "resource_id"   Text PRIMARY KEY,
          "resource_json" Text
      );`);
    await db.all(`CREATE TABLE "local_references"(
          "reference_id" Text,
          "origin_resource_id" Text,
          FOREIGN KEY("origin_resource_id") REFERENCES fhir_resources("resource_id"),
          PRIMARY KEY("origin_resource_id", "reference_id")
      );`);

    return db;
  } catch {
    throw new Error();
  }
}

let db: sqlite.Database;

beforeEach(async () => {
  db = await setupTestDB();
  return db;
});

afterEach(async () => {
  db.close();
});

const PATIENT_IDS_OUTPUT = [{ resource_id: '1' }, { resource_id: '2' }, { resource_id: '3' }];
const GET_REFS_TO_PATIENT_OUTPUT = [{ origin_resource_id: '1' }];
const GET_RESOURCES_REF_OUTPUT = [{ reference_id: '123' }, { reference_id: '456' }];

describe('Testing functions in bundleAssemblyHelpers.ts', () => {
  test('getAllPatientIds retrieves all patient ids', async () => {
    await db.all(`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES
    ('Patient', '1', '{}'),
    ('Patient', '2', '{}'),
    ('Patient', '3', '{}'),
    ('Encounter', '4', '{}')`);
    const actual = await bundleAssemblyHelpers.getAllPatientIds(db);
    expect(actual.sort()).toEqual(PATIENT_IDS_OUTPUT.sort());
  });

  test('getAllPatientIds returns empty array when no patients present', async () => {
    const actual = await bundleAssemblyHelpers.getAllPatientIds(db);
    expect(actual).toEqual([]);
  });

  test('getReferencesToPatient retrieves all resources that reference given patient ID', async () => {
    // Resource that references test patient w/ id 123
    await db.all(`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES
    ('Encounter', '1', '{"reference": "Patient/123", "individual": {"reference": "Patient/456"}}')`);
    // Encounter which does not reference the patient w/ id 123
    await db.all(`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES
    ('Encounter', '2', '{"reference": "Patient/456"}')`);
    await db.all(`INSERT INTO "local_references" (origin_resource_id, reference_id) VALUES
    ('1', '123')`);
    await db.all(`INSERT INTO "local_references" (origin_resource_id, reference_id) VALUES
    ('2', '456')`);
    const actual = await bundleAssemblyHelpers.getReferencesToPatient(db, '123');
    expect(actual).toEqual(GET_REFS_TO_PATIENT_OUTPUT);
  });

  test('getResourcesReferenced retrieves all resource ids referenced by the given fhir resource', async () => {
    // Resource that has references
    await db.all(`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES
    ('Encounter', '1', '{"reference": "Patient/123", "individual": {"reference": "Practitioner/456"}}')`);
    // References for the resource that we want to retrieve
    await db.all(`INSERT INTO "local_references" (origin_resource_id, reference_id) VALUES
    ('1', '123'),
    ('1', '456')`);
    const actual = await bundleAssemblyHelpers.getResourcesReferenced(db, '1');
    expect(actual).toEqual(GET_RESOURCES_REF_OUTPUT);
  });

  test('getRecursiveReferences retrieves ids of all resources related to the given resource', async () => {
    const explored: Set<string> = new Set();
    const enteredResources: Set<string> = new Set();

    /* 
      Adding a reference network for theoretically an encounter with id: 1 which references a patient
      with id: 123 and a practitioner with id: 456
      insert all resources related to the given resource 
    */
    await db.all(`INSERT INTO "local_references" (origin_resource_id, reference_id) VALUES
    ('1', '123'),
    ('1', '456')`);
    const resourceId = '1';
    // add patient id
    const patientId = '123';
    explored.add(patientId);
    enteredResources.add(patientId);

    const actual = await bundleAssemblyHelpers.getRecursiveReferences(db, resourceId, explored, enteredResources);
    expect(actual).toEqual(['1', '456']);
  });

  test('getRecursiveReferences retrieves ids of all 2-way refs related to the given resource', async () => {
    const explored: Set<string> = new Set();
    const enteredResources: Set<string> = new Set();
    /* 
      Adding a reference network for theoretically an encounter with id: 1 which references a patient
      with id: 123 and a practitioner with id: 456. Also, an observation with id: 2 which references the
      practitioner with id: 456
      insert all resources related to the given resource
    */
    await db.all(`INSERT INTO "local_references" (origin_resource_id, reference_id) VALUES
    ('1', '123'),
    ('1', '456'),
    ('2', '456')
    `);
    const resourceId = '1';
    // add patient id
    const patientId = '123';
    explored.add(patientId);
    enteredResources.add(patientId);

    const actual = await bundleAssemblyHelpers.getRecursiveReferences(db, resourceId, explored, enteredResources);
    expect(actual.sort()).toEqual(['1', '2', '456'].sort());
  });

  test('createTransactionBundle returns a transaction bundle with all appropriate data', async () => {
    await db.all(`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES
    ('Encounter', '1', '{"resourceType":"Encounter","id":"1","subject":{"reference":"Patient/2"},"participant":[{"individual":{"reference":"Practitioner/3"}}]}')`);
    await db.all(`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES
    ('Patient', '2', '{"resourceType":"Patient","id":"2"}')`);
    await db.all(`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES
    ('Practitioner', '3', '{"resourceType":"Practitioner","id":"3"}')`);
    await db.all(`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES
    ('Encounter', '4', '{"resourceType":"Encounter","id":"4","reference":"Encounter/1"}')`);

    const resourceIds = ['1', '2', '3', '4'];
    const actual = await bundleAssemblyHelpers.createTransactionBundle(db, resourceIds);
    expect(actual).toEqual(testTransactionBundle[0]);
  });
});

const mock = new MockAdapter(axios);

// Simple function used to sort the entries array of a transaction bundle
const compareEntries = (a: any, b: any) => (a.resource.id > b.resource.id ? 1 : -1);

// Simple function to sort an array of transaction bundles
const compareTBs = (a: any, b: any) => {
  if (a.entry.length !== b.entry.length) {
    return a.entry.length - b.entry.length;
  }
  // If they have the same length, sort the one with the higher first entry id.
  // Since the entry array will already be sorted at this point this should always
  // produce the same results.
  return a.entry.reduce((acc: number, aTBEntry: any, index: number) => {
    if (acc === 0) {
      acc = aTBEntry.resource.id > b.entry[index].resource.id ? 1 : -1;
    }
    return acc;
  }, 0);
};

// Wrapper for sorting the tb array
const sortTBArr = (tbArr: TransactionBundle[]) => {
  tbArr.forEach(tb => tb.entry.sort(compareEntries));
  tbArr.sort(compareTBs);
};

describe('assembleTransactionBundleTests', () => {
  // Given a directory, populates BulkDataResponse, mocks out axios requests, and pulls expected output transqction bundle
  const init = (dir: string, bulkDataResponses: BulkDataResponse[], tbExpected: TransactionBundle[]) => {
    const files = fs.readdirSync(dir);
    let tbExpectedFile = '';
    const ndjsonFnames = files.filter((fname: string) => {
      if (fname.slice(-5) === '.json') {
        tbExpectedFile = fname;
      }
      return fname.slice(-7) === '.ndjson';
    });

    ndjsonFnames.forEach((fname: string, i: number) => {
      const resources = fs.readFileSync(`${dir}/${fname}`, 'utf8');
      mock.onGet(`test_url_${i}`).reply(200, resources);
      bulkDataResponses.push({
        url: `test_url_${i}`,
        type: 'EXAMPLE',
        count: -1
      });
    });

    const tbString = fs.readFileSync(`${dir}/${tbExpectedFile}`, 'utf8');
    tbExpected.push(...JSON.parse(tbString));
    sortTBArr(tbExpected);
  };
  describe('test examples in fixtures/testFiles', () => {
    const exampleBulkDataResponses: BulkDataResponse[] = [];
    const tbExpected: TransactionBundle[] = [];
    beforeEach(() => init('./test/fixtures/testFiles', exampleBulkDataResponses, tbExpected));
    test('assembleTransactionBundle returns transaction bundle of patient resource and all related resources that reference it/each other', async () => {
      const DB = await populateDB(exampleBulkDataResponses, ':memory:');
      const actual = await bundleAssemblyHelpers.assembleTransactionBundles(DB);
      sortTBArr(actual);
      expect(actual).toEqual(tbExpected);
    });
  });

  describe('test examples in fixtures/ndjsonResources/simple', () => {
    const exampleBulkDataResponses: BulkDataResponse[] = [];
    const tbExpected: TransactionBundle[] = [];
    beforeEach(() => init('./test/fixtures/ndjsonResources/simple', exampleBulkDataResponses, tbExpected));
    test('assembleTransactionBundle returns array of transaction bundles when we have multiple patients', async () => {
      const DB = await populateDB(exampleBulkDataResponses, ':memory:');
      const actual = await bundleAssemblyHelpers.assembleTransactionBundles(DB);
      sortTBArr(actual);
      expect(actual).toEqual(tbExpected);
    });
  });

  describe('test examples in fixtures/ndjsonDisconnected', () => {
    const exampleBulkDataResponses: BulkDataResponse[] = [];
    const tbExpected: TransactionBundle[] = [];
    beforeEach(() => init('./test/fixtures/ndjsonDisconnected', exampleBulkDataResponses, tbExpected));
    test('assembleTransactionBundle correctly executes cleanupBundle and incoming refs', async () => {
      const DB = await populateDB(exampleBulkDataResponses, ':memory:');
      const actual = await bundleAssemblyHelpers.assembleTransactionBundles(DB);
      sortTBArr(actual);
      expect(actual).toEqual(tbExpected);
    });
  });
});
