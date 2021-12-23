import axios from 'axios';
import { BulkDataResponse } from '../types/requirementsQueryTypes';

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
  } catch (e) {
    throw new Error(`Failed reaching out to bulk export server with message: ${e.message}`);
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
  let results;
  try {
    results = await axios.get(url, { headers });
    while (results.status === 202) {
      await sleep(1000);
      results = await axios.get(url, { headers });
    }
  } catch (e) {
    throw new Error(`Failed reaching out to bulk export server with message: ${e.message}`);
  }
  if (results && results.status === 200) {
    return { output: results.data.output };
  } else if (results) {
    throw new Error(`Unexpected response from bulk export server status: ${results.status}`);
  } else {
    throw new Error('An unknown ocurred while retrieving data from bulk export server');
  }
}
