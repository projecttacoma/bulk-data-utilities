// TO-DO: Determine if we still need this file???

import axios from 'axios';

const HEADERS = {
  'Content-Type': 'application/fhir+ndjson'
};
/**
 *
 * @param serverOutput
 */
export function retrieveNDJSON(serverOutput: { type: string; count: number; url: string }[]): void {
  const requestsArray = serverOutput.map(async entry => {
    console.log(entry.url);
    return axios['get'](entry.url, {
      headers: HEADERS
    });
  });
  Promise.all(requestsArray).then(results => console.log(results));
}
