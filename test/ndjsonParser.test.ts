import {
  getLocalReferences,
  createDatabase,
  insertResourceIntoDB,
  checkReferences,
  populateDB
} from '../src/utils/ndjsonParser';

const OBJECT_WITH_NESTED_REFERENCE = {
  resourceType: 'Patient',
  reference: 'reference1',
  subject: {
    reference: 'reference2'
  }
};

const OBJECT_WITH_DOUBLE_NESTED_REF = {
  resourceType: 'Encounter',
  participant: {
    individual: {
      reference: 'reference1'
    }
  }
};

const OBJECT_WITHOUT_REFERENCES = {
  resourceType: 'Encounter',
  id: 'test_id',
  code: {
    valueSet: 'test_set',
    status: 'active'
  }
};
const EXPECTED_RESOURCE_COL_NAMES = ['fhir_type', 'resource_id', 'resource_json'];
const EXPECTED_REFERENCE_COL_NAMES = ['origin_resource_id', 'reference_id'];

const MINIMAL_PATIENT = '{"resourceType":"Patient", "id":"P1" }';
const EXPECTED_INSERTION_OUTPUT = { fhir_type: 'Patient', resource_id: 'P1', resource_json: MINIMAL_PATIENT };

const MINIMAL_PRACTITIONER = '{"resourceType":"Practitioner", "id":"PR1" }';
const ENCOUNTER_WITH_REF_TO_MINIMAL_PATIENT = '{"resourceType":"Encounter", "id":"E1", "reference":"Patient/P1" }';
const ENCOUNTER_WITH_ILLEGAL_REF = '{"resourceType":"Encounter", "id":"E2", "reference":"Patient/P2" }';
const ENCOUNTER_WITH_NESTED_LEGAL_REFS =
  '{"resourceType":"Encounter", "id":"E3", "individual": {"reference":"Patient/P1" }, "reference":"Practitioner/PR1"}';
const ENCOUNTER_WITH_NESTED_ILLEGAL_REFS =
  '{"resourceType":"Encounter", "id":"E4", "individual": {"reference":"Patient/P1" }, "reference":"Practitioner/PR2"}';

const EXPECTED_POPULATE_DB_RESOURCES = [
  {
    fhir_type: 'Encounter',
    resource_id: '1',
    resource_json:
      '{"resourceType":"Encounter","id":"1","subject":{"reference":"Patient/2"},"participant":[{"individual":{"reference":"Practitioner/3"}}]}'
  },
  {
    fhir_type: 'Encounter',
    resource_id: '4',
    resource_json: '{"resourceType":"Encounter","id":"4","reference":"Encounter/1"}'
  },
  {
    fhir_type: 'Patient',
    resource_id: '2',
    resource_json: '{"resourceType":"Patient","id":"2"}'
  },

  {
    fhir_type: 'Practitioner',
    resource_id: '3',
    resource_json: '{"resourceType":"Practitioner","id":"3"}'
  }
];

const EXPECTED_POPULATE_DB_REFERENCES = [
  { origin_resource_id: '1', reference_id: '2' },
  { origin_resource_id: '1', reference_id: '3' },
  { origin_resource_id: '4', reference_id: '1' }
];

describe('test ndjson parser functions', () => {
  test('pull references at multiple levels', () => {
    expect(getLocalReferences(OBJECT_WITH_NESTED_REFERENCE).sort()).toEqual(['reference1', 'reference2']);
  });
  test('pull double nested reference', () => {
    expect(getLocalReferences(OBJECT_WITH_DOUBLE_NESTED_REF)).toEqual(['reference1']);
  });
  test('pull from object without reference key', () => {
    expect(getLocalReferences(OBJECT_WITHOUT_REFERENCES)).toEqual([]);
  });
  test('create database returns database with correct schema', async () => {
    const db = await createDatabase(':memory:');
    let resourceCols = await db.all('SELECT name from PRAGMA_TABLE_INFO("fhir_resources")');
    let referenceCols = await db.all('SELECT name from PRAGMA_TABLE_INFO("local_references")');

    resourceCols = resourceCols.map(colNameObject => colNameObject.name);
    referenceCols = referenceCols.map(colNameObject => colNameObject.name);

    expect(resourceCols.sort()).toEqual(EXPECTED_RESOURCE_COL_NAMES.sort());
    expect(referenceCols.sort()).toEqual(EXPECTED_REFERENCE_COL_NAMES.sort());
  });

  test('Insertion into database creates a selectable entry with the same data', async () => {
    const db = await createDatabase(':memory:'); // should we be sharing a db here? how big of a cost is it to create all these?
    await insertResourceIntoDB(db, MINIMAL_PATIENT);
    const output = await db.get('SELECT * FROM "fhir_resources" WHERE resource_id = "P1";');
    expect(output).toEqual(EXPECTED_INSERTION_OUTPUT);
  });

  test('checkReferences succeeds on legal references', async () => {
    expect.assertions(1);
    const db = await createDatabase(':memory:');
    await insertResourceIntoDB(db, MINIMAL_PATIENT);
    await insertResourceIntoDB(db, ENCOUNTER_WITH_REF_TO_MINIMAL_PATIENT);
    await expect(checkReferences(db)).resolves.toBeUndefined();
  });

  test('checkReferences fails on simple illegal reference', async () => {
    const db = await createDatabase(':memory:');
    expect.assertions(1);
    await insertResourceIntoDB(db, MINIMAL_PATIENT);
    await insertResourceIntoDB(db, ENCOUNTER_WITH_ILLEGAL_REF);
    await expect(checkReferences(db)).rejects.toThrow('Error: Unresolved reference from Encounter/E2 to Patient/P2');
  });

  test('checkReferences fails on nested illegal reference', async () => {
    const db = await createDatabase(':memory:');
    expect.assertions(1);
    await insertResourceIntoDB(db, MINIMAL_PATIENT);
    await insertResourceIntoDB(db, ENCOUNTER_WITH_NESTED_ILLEGAL_REFS);
    await expect(checkReferences(db)).rejects.toThrow(
      'Error: Unresolved reference from Encounter/E4 to Practitioner/PR2'
    );
  });

  test('checkReferences passes on nested legal reference', async () => {
    const db = await createDatabase(':memory:');
    expect.assertions(1);
    await insertResourceIntoDB(db, MINIMAL_PATIENT);
    await insertResourceIntoDB(db, MINIMAL_PRACTITIONER);
    await insertResourceIntoDB(db, ENCOUNTER_WITH_NESTED_LEGAL_REFS);
    await expect(checkReferences(db)).resolves.toBeUndefined();
  });

  test('checkReferences passes with multiple resources with legal references', async () => {
    const db = await createDatabase(':memory:');
    expect.assertions(1);
    await insertResourceIntoDB(db, MINIMAL_PATIENT);
    await insertResourceIntoDB(db, MINIMAL_PRACTITIONER);
    await insertResourceIntoDB(db, ENCOUNTER_WITH_NESTED_LEGAL_REFS);
    await insertResourceIntoDB(db, ENCOUNTER_WITH_REF_TO_MINIMAL_PATIENT);
    await expect(checkReferences(db)).resolves.toBeUndefined();
  });

  test('checkReferences fails with resource with legal references and resource with illegal references', async () => {
    const db = await createDatabase(':memory:');
    expect.assertions(1);
    await insertResourceIntoDB(db, MINIMAL_PATIENT);
    await insertResourceIntoDB(db, MINIMAL_PRACTITIONER);
    await insertResourceIntoDB(db, ENCOUNTER_WITH_NESTED_ILLEGAL_REFS);
    await insertResourceIntoDB(db, ENCOUNTER_WITH_REF_TO_MINIMAL_PATIENT);
    await expect(checkReferences(db)).rejects.toThrow(
      'Error: Unresolved reference from Encounter/E4 to Practitioner/PR2'
    );
  });

  test('populateDB creates database with correct info', async () => {
    const db = await populateDB('test/fixtures/testFiles', ':memory:');
    const fhirResources = await db.all('SELECT * FROM "fhir_resources";');
    const references = await db.all('SELECT * FROM "local_references";');
    expect(fhirResources).toEqual(EXPECTED_POPULATE_DB_RESOURCES);
    expect(references).toEqual(EXPECTED_POPULATE_DB_REFERENCES);
  });
});
