import { getDataRequirementsQueries } from '../src/RequirementsQuery';

const DATA_REQUIREMENTS_PATIENT = [
  {
    type: 'Patient'
  }
];

const DATA_REQUIREMENTS_PATIENT_OUTPUT = [
  {
    type: 'Patient',
    params: {}
  }
];

describe('RequirementQueryTests', () => {
  test('Patient type request', () => {
    expect(getDataRequirementsQueries(DATA_REQUIREMENTS_PATIENT)).toEqual(DATA_REQUIREMENTS_PATIENT_OUTPUT);
  });
});
