import { getLocalReferences } from '../src/utils/ndjsonParser';

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
});
