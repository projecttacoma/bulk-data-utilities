import connect, { sql } from '@databases/sqlite';
import * as bundleAssemblyHelpers from '../src/utils/bundleAssemblyHelpers';

async function setupTestDB() {
  const db = connect(); // in memory db;
  await db.query(sql`CREATE TABLE "fhir_resources"(
        "fhir_type"     Text,
        "resource_id"   Text PRIMARY KEY,
        "resource_json" Text
    );`);
  await db.query(sql`CREATE TABLE "local_references"(
        "reference_id" Text,
        "origin_resource_id" Text,
        FOREIGN KEY("origin_resource_id") REFERENCES fhir_resources("resource_id"),
        PRIMARY KEY("origin_resource_id", "reference_id")
    );`);
  return db;
  //console.log(await db.query(sql`PRAGMA table_info("local_references");`));
}

const PATIENT_IDS_OUTPUT = [
  {resource_id: '1'},
  {resource_id: '2'},
  {resource_id: '3'},
]

describe('Testing functions in bundleAssemblyHelpers.ts', () => {
  test('getAllPatientIds retrieves all patient ids', async () => {
    const db = await setupTestDB();
    const testPatients = ['Patient', '1', '{}', 'Patient', '2', '{}','Patient', '3', '{}', 'Encounter', '4', '{}'];
    await db.query(sql`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES 
    ('Patient', '1', '{}'),
    ('Patient', '2', '{}'),
    ('Patient', '3', '{}'),
    ('Encounter', '4', '{}')`);
    const actual = await bundleAssemblyHelpers.getAllPatientIds(db);

    expect(actual.sort).toEqual(PATIENT_IDS_OUTPUT.sort());
  });

  test('getReferencesToPatient retrieves all resources that reference given patient ID', async () => {
    const db = await setupTestDB();
    const testId = '123';
    // resources that reference testId
    await db.query(sql`INSERT INTO "fhir_resources" (fhir_type, resource_id, resource_json) VALUES (?,?,?)`,
    'Encounter', '1', '{"reference": '
    ('Encounter', '1', '{"reference": "Patient/123"}')
    
    //return await DB.promise('all', 'SELECT origin_resource_id FROM "local_references" WHERE reference_id = ?', patientId);
  });

  test('getResourcesReferenced retrieves all resource ids referenced by the given fhir resource', async () => {
    const db = await setupTestDB();
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
