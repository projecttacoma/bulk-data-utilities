import axios from 'axios';
import { probeServer, queryBulkDataServer } from '../src/utils/exportServerQueryBuilder';
const INVALID_URL = 'not-a-real-url';
const EXAMPLE_URL = 'http://www.example.com/4_0_1/$export';
const INVALID_URL_ERROR = 'connect ECONNREFUSED 127.0.0.1:80';
const EXPECTED_INVALID_URL_RESPONSE = `Failed reaching out to bulk export server with message: ${INVALID_URL_ERROR}`;
const ERROR_STATUS = { status: 500 };
const EXPECTED_STATUS_ERROR_RESPONSE = `Unexpected response from bulk export server status: ${ERROR_STATUS.status}`;
const EXPECTED_UNKNOWN_ERROR_RESPONSE = 'An unknown ocurred while retrieving data from bulk export server';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('queryBulkServer Tests', () => {
  test('Throw error if invalid export URL given to queryBulkDataServer', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error(INVALID_URL_ERROR));
    try {
      await queryBulkDataServer(INVALID_URL);
      fail('Error was not thrown');
    } catch (e) {
      expect(e.message).toEqual(EXPECTED_INVALID_URL_RESPONSE);
    }
  });
  test('Throw error if invalid export URL given to probeServer', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error(INVALID_URL_ERROR));
    try {
      await probeServer(INVALID_URL);
      fail('Error was not thrown');
    } catch (e) {
      expect(e.message).toEqual(EXPECTED_INVALID_URL_RESPONSE);
    }
  });
  test('Throw error if probeServer returns code outside of 200 or 202', async () => {
    mockedAxios.get.mockResolvedValueOnce(ERROR_STATUS);
    try {
      await probeServer(EXAMPLE_URL);
      fail('Error was not thrown');
    } catch (e) {
      expect(e.message).toEqual(EXPECTED_STATUS_ERROR_RESPONSE);
    }
  });
  test('Throw error if probeServer noes not receive results', async () => {
    mockedAxios.get.mockResolvedValueOnce(undefined);
    try {
      await probeServer(EXAMPLE_URL);
      fail('Error was not thrown');
    } catch (e) {
      expect(e.message).toEqual(EXPECTED_UNKNOWN_ERROR_RESPONSE);
    }
  });
});
