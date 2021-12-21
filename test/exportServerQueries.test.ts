import { queryBulkDataServer } from '../src/utils/exportServerQueryBuilder';
const invalidURL = 'not-a-real-url';
const invalidURLError = { output: null, error: 'connect ECONNREFUSED 127.0.0.1:80' };

describe('queryBulkServer Tests', () => {
  test('Throw error if invalid export URL given to queryBulkDataServer', async () => {
    const results = await queryBulkDataServer(invalidURL);
    expect(results).toEqual(invalidURLError);
  });
});
