import * as bundleAssemblyHelpers from '../src/utils/bundleAssemblyHelpers';
import * as sqlite3 from 'sqlite3';
// wrapper around sqlite3 that is promise-based
import * as sqlite from 'sqlite';
import testTransactionBundle from './fixtures/testFiles/testTransactionBundle.json';
import testTransactionBundleArray from './fixtures/ndjsonResources/simple/simpleOutputBundle.json';
import disconnectedBundle from './fixtures/ndjsonDisconnected/disconnectedBundle.json';

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

    // insert resource of interest into db
    await db.all(`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES
    ('Encounter', '1', '{"reference": "Patient/123", "individual": {"reference": "Practitioner/456"}}')`);
    // insert all resources related to the given resource
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
    // insert resource of interest into db
    await db.all(`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES
    ('Encounter', '1', '{"reference": "Patient/123", "individual": {"reference": "Practitioner/456"}}')`);
    // insert all resources related to the given resource
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
    expect(actual).toEqual(testTransactionBundle);
  });

  test('assembleTransactionBundle returns transaction bundle of patient resource and all related resources that reference it/each other', async () => {
    const actual = await bundleAssemblyHelpers.assembleTransactionBundle('test/fixtures/testFiles', ':memory:');
    expect(actual).toEqual([testTransactionBundle]);
  });

  test('assembleTransactionBundle returns array of transaction bundles when we have multiple patients', async () => {
    const actual = await bundleAssemblyHelpers.assembleTransactionBundle(
      'test/fixtures/ndjsonResources/simple',
      ':memory:'
    );
    expect(actual).toEqual(testTransactionBundleArray);
  });
  test('assembleTransactionBundle correctly executes cleanupBundle and incoming refs', async () => {
    const actual = await bundleAssemblyHelpers.assembleTransactionBundle(
      'test/fixtures/ndjsonDisconnected',
      ':memory:'
    );
    expect(actual).toEqual(disconnectedBundle);
  });
});
