import axios from 'axios';
import { BulkDataResponse } from '../types/requirementsQueryTypes';

export async function retrieveNDJSONFromLocation(locationInfo: BulkDataResponse): Promise<string> {
  const data = (await axios.get(locationInfo.url)).data;
  // If there is only one resource here, it comes out an object, not a string,
  // so I force it to string here
  if (typeof data === 'object') {
    return JSON.stringify(data);
  }
  return data;
}
