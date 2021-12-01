import axios, { AxiosError } from 'axios';
import { BulkDataResponse } from './types/RequirementsQueryTypes';

const headers = {
  Accept: 'application/fhir+json',
  Prefer: 'respond-async'
};

/**
 * sends initial request to bulk data export server and calls recurring poll function
 * to check on progress
 * @param url: A bulk data export FHIR server url with params
 */
export async function queryBulkDataServer(url: string): Promise<{ output: BulkDataResponse[] | null; error?: string }> {
  try {
    const resp = await axios.get(url, { headers });
    return await probeServer(resp.headers['content-location']);
  } catch (err) {
    return { output: null, error: (err as AxiosError).message };
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Repeatedly checks the passed url (every second) until the request either fails or succeeds
 * @param url: A content-location url retrieved by queryBulkDataServer which will
 * eventually contain the output data when processing completes
 */

export async function probeServer(url: string): Promise<{ output: BulkDataResponse[] }> {
  let results = await axios.get(url, { headers });
  while (results.status === 202) {
    await sleep(1000);
    results = await axios.get(url, { headers });
  }
  if (results.status === 500) {
    throw new Error('Received 500 status: Internal Server Error');
  }
  return { output: results.data.output };
}
