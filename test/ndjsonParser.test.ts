/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* import {
  getLocalReferences,
  createDatabase,
  insertResourceIntoDB,
  checkReferences,
  populateDB
} from '../src/utils/ndjsonParser';
 */
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import fs from 'fs';

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

describe.skip('test ndjson parser functions', () => {
  test('', () => {});
  /* 
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
 */
});

const mock = new MockAdapter(axios);

describe.skip('populateDB tests', () => {
  test('', () => {});
  /* 
  beforeAll(() => {
    const encounters = fs.readFileSync('./test/fixtures/testFiles/testEncounter.ndjson', 'utf8');
    const patients = fs.readFileSync('./test/fixtures/testFiles/testPatient.ndjson', 'utf8');
    const practitioners = fs.readFileSync('./test/fixtures/testFiles/testPractitioner.ndjson', 'utf8');
    mock.onGet('test_url1').reply(200, encounters);
    mock.onGet('test_url2').reply(200, patients);
    mock.onGet('test_url3').reply(200, practitioners);
  });
  test('PopulateDB correctly populates DB from urls', async () => {
    const locations = [
      {
        url: 'test_url1',
        type: 'Encounter',
        count: 2
      },
      {
        url: 'test_url2',
        type: 'Patient',
        count: 1
      },
      {
        url: 'test_url3',
        type: 'Practitioner',
        count: 1
      }
    ];
    // To be used in sorting the output from the fhir_resource table
    const compareResource = (
      a: { resource_id: string; fhir_type: string; resource_json: string },
      b: { resource_id: string; fhir_type: string; resource_json: string }
    ) => {
      return a.resource_id > b.resource_id ? 1 : -1;
    };

    // To be used in sorting the output from the local_references table
    const compareReference = (
      a: { origin_resource_id: string; reference_id: string },
      b: { origin_resource_id: string; reference_id: string }
    ) => {
      if (parseInt(a.origin_resource_id) > parseInt(b.origin_resource_id)) {
        return 1;
      }
      return a.reference_id > b.reference_id ? 1 : -1;
    };
    const db = await populateDB(locations, ':memory:');
    expect((await db.all('SELECT * FROM fhir_resources')).sort(compareResource)).toEqual(
      EXPECTED_POPULATE_DB_RESOURCES.sort(compareResource)
    );
    expect((await db.all('SELECT * FROM local_references')).sort(compareReference)).toEqual(
      EXPECTED_POPULATE_DB_REFERENCES.sort(compareReference)
    );
  });
 */
});
