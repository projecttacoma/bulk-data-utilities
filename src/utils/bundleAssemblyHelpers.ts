import * as sqlite3 from 'sqlite3';
import * as ndjsonParser from './ndjsonParser';
import { DBWithPromise } from '../types/DatabaseTypes';

export function getAllPatientIds(DB: DBWithPromise) {
  const patientIds = DB.promise('run', 'SELECT resource_id FROM "data" WHERE fhir_type = "Patient"').then(
    (patientIds: any) => console.log(patientIds)
  );
  return patientIds;
}

const DB = ndjsonParser.populateDB();
if (DB) {
  getAllPatientIds(DB);
}
