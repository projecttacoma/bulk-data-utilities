import { getDataRequirementsQueries, queryBulkDataServer } from '../src/RequirementsQuery';

const DATA_REQUIREMENTS_PATIENT = [
  {
    type: 'Patient'
  }
];

const DATA_REQUIREMENTS_PROCEDURE_W_VALUESET = [
  {
    type: 'Procedure',
    codeFilter: [
      {
        path: 'type',
        valueSet: 'TEST_VALUE_SET'
      }
    ]
  }
];

const DATA_REQUIREMENTS_ENCOUNTER_W_CODE = [
  {
    type: 'Encounter',
    codeFilter: [
      {
        path: 'code',
        valueSet: 'TEST_VALUE_SET'
      }
    ]
  }
];

const DATA_REQUIREMENTS_MULTIPLE = [
  {
    type: 'Procedure',
    codeFilter: [
      {
        path: 'type',
        valueSet: 'TEST_VALUE_SET'
      }
    ]
  },
  {
    type: 'Encounter',
    codeFilter: [
      {
        path: 'code',
        valueSet: 'TEST_VALUE_SET'
      }
    ]
  }
];

const DATA_REQUIREMENTS_ENCOUNTER_IS_CODE = [
  {
    type: 'Encounter',
    codeFilter: [
      {
        path: 'code',
        code: [
          {
            code: 'TEST_CODE'
          }
        ]
      }
    ]
  }
];

const EXPECTED_DATA_REQUIREMENTS_PATIENT = {
  _type: 'Patient',
  _typeFilter: ''
};

const EXPECTED_DATA_REQUIREMENTS_PROCEDURE_W_VALUESET = {
  _type: 'Procedure',
  _typeFilter: 'Procedure%3Ftype%3Ain=TEST_VALUE_SET'
};

const EXPECTED_DATA_REQUIREMENTS_ENCOUNTER_W_CODE = {
  _type: 'Encounter',
  _typeFilter: 'Encounter%3Fcode%3Ain=TEST_VALUE_SET'
};

const EXPECTED_DATA_REQUIREMENTS_MULTIPLE = {
  _type: 'Procedure,Encounter',
  _typeFilter: 'Procedure%3Ftype%3Ain=TEST_VALUE_SET,Encounter%3Fcode%3Ain=TEST_VALUE_SET'
};

const EXPECTED_DATA_REQUIREMENTS_ENCOUNTER_IS_CODE = {
  _type: 'Encounter',
  _typeFilter: 'Encounter%3Fcode=TEST_CODE'
};

const invalidURL = 'not-a-real-url';
const invalidURLError = { output: null, error: 'connect ECONNREFUSED 127.0.0.1:80' };

/*
NOTE: codeFilter code has been commented out in order to test
bulkImport in deqm-test-server. Otherwise, errors arise since
the $export reference server does not support _typeFilter.

If these tests are run with the codeFilter code commented out,
they will fail. To run these tests, first uncomment the
codeFilter code in the getDataRequirementsQueries function.
*/
describe.skip('getDataRequirements Tests', () => {
  test('Patient type request', () => {
    expect(getDataRequirementsQueries(DATA_REQUIREMENTS_PATIENT)).toEqual(EXPECTED_DATA_REQUIREMENTS_PATIENT);
  });
  test('Procedure in valueset request', () => {
    expect(getDataRequirementsQueries(DATA_REQUIREMENTS_PROCEDURE_W_VALUESET)).toEqual(
      EXPECTED_DATA_REQUIREMENTS_PROCEDURE_W_VALUESET
    );
  });
  test('Encounter with code in valueset request', () => {
    expect(getDataRequirementsQueries(DATA_REQUIREMENTS_ENCOUNTER_W_CODE)).toEqual(
      EXPECTED_DATA_REQUIREMENTS_ENCOUNTER_W_CODE
    );
  });
  test('Multiple requirements', () => {
    expect(getDataRequirementsQueries(DATA_REQUIREMENTS_MULTIPLE)).toEqual(EXPECTED_DATA_REQUIREMENTS_MULTIPLE);
  });
  test('Encounter with code equals', () => {
    expect(getDataRequirementsQueries(DATA_REQUIREMENTS_ENCOUNTER_IS_CODE)).toEqual(
      EXPECTED_DATA_REQUIREMENTS_ENCOUNTER_IS_CODE
    );
  });
});
describe('queryBulkServer Tests', () => {
  test('Throw error if invalid export URL given to queryBulkDataServer', async () => {
    const results = await queryBulkDataServer(invalidURL);
    expect(results).toEqual(invalidURLError);
  });
});
