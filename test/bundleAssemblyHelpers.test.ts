import connect, { sql } from '@databases/sqlite';
import * as bundleAssemblyHelpers from '../src/utils/bundleAssemblyHelpers';
import * as sqlite3 from 'sqlite3';
import { DBWithPromise } from '../src/types/DatabaseTypes';
// wrapper around sqlite3 that is promise-based
import { open } from 'sqlite';

async function setupTestDB() {
  // create in-memory DB
  const db: DBWithPromise = await open({
    filename: ':memory:',
    driver: sqlite3.Database
  });

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
}

const PATIENT_IDS_OUTPUT = [{ resource_id: '1' }, { resource_id: '2' }, { resource_id: '3' }];
const GET_REFS_TO_PATIENT_OUTPUT = [{ origin_resource_id: '1' }];
const GET_RESOURCES_REF_OUTPUT = [{ reference_id: '123' }, { reference_id: '456' }];

describe('Testing functions in bundleAssemblyHelpers.ts', () => {
  test('getAllPatientIds retrieves all patient ids', async () => {
    const db = await setupTestDB();
    await db.all(`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES 
    ('Patient', '1', '{}'),
    ('Patient', '2', '{}'),
    ('Patient', '3', '{}'),
    ('Encounter', '4', '{}')`);
    const actual = await bundleAssemblyHelpers.getAllPatientIds(db);

    expect(actual.sort).toEqual(PATIENT_IDS_OUTPUT.sort());
  });

  test('getReferencesToPatient retrieves all resources that reference given patient ID', async () => {
    const db = await setupTestDB();
    // resources that reference our test patient id of 123
    await db.all(`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES 
    ('Encounter', '1', '{"reference": "Patient/123"})`);
    await db.all(`INSERT INTO "local_references" (origin_resource_id, reference_id) VALUES
    ('1', '123')`);
    const actual = await bundleAssemblyHelpers.getReferencesToPatient(db, '123');
    expect(actual).toEqual(GET_REFS_TO_PATIENT_OUTPUT);
  });

  test('getResourcesReferenced retrieves all resource ids referenced by the given fhir resource', async () => {
    const db = await setupTestDB();
    await db.all(`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES 
    ('Encounter', '1', '{"reference": "Patient/123", "individual": {"reference": "Practitioner/456"}}`);
    await db.all(`INSERT INTO "local_references" (origin_resource_id, reference_id) VALUES
    ('1', '123'),
    ('1', '456')`);
    const actual = await bundleAssemblyHelpers.getResourcesReferenced(db, '1');
    expect(actual).toEqual(GET_RESOURCES_REF_OUTPUT);
  });

  test('getRecursiveReferences retrieves ids of all resources related to the given resource', async () => {
    const db = await setupTestDB();
  });

  test('createTransactionBundle returns transaction bundle of patient resource and all related resources that reference it/each other', async () => {
    const db = await setupTestDB();
  });

  test('AssembleTransactionBundle returns transaction bundle', async () => {
    const db = await setupTestDB();
  });
});
