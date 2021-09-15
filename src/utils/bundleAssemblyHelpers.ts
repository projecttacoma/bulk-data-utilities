import * as sqlite3 from 'sqlite3';
import * as ndjsonParser from './ndjsonParser';
import { DBWithPromise } from '../types/DatabaseTypes';
//import fhir4 from 'fhir/r4';
//import { fhir4.Bundle } from '@types/fhir';

/**
 * Uses SQL query to retrieve all the Patient resource ids from the data table in our database
 * @param DB database object
 * @returns
 */
export async function getAllPatientIds(DB: DBWithPromise): Promise<{ resource_id: string }[]> {
  return await DB.promise('all', 'SELECT resource_id FROM "data" WHERE fhir_type = "Patient"');
}
/**
 * Uses SQL query to retrieve all the resources in the data table that reference the
 * given patient
 * @param DB database object
 * @param patientId single patient ID string
 * @returns
 */
export async function getReferencesToPatient(
  DB: DBWithPromise,
  patientId: string
): Promise<{ data_resource_id: string }[]> {
  return await DB.promise('all', 'SELECT data_resource_id FROM "local_references" WHERE reference_id = ?', patientId);
}

/**
 * Uses an SQL query to find all resource ids referenced by the fhir resource with the passed in id
 * @param DB database object
 * @param resourceId id of the resource we want references of
 * @returns
 */
export async function getResourcesReferenced(DB: DBWithPromise, resourceId: string) {
  return await DB.promise('all', 'SELECT reference_id FROM "local_references"  WHERE data_resource_id = ?', resourceId);
}

export async function getRecursiveReferences(DB: DBWithPromise, resourceId: string, explored: Set<string>) {
  if (!explored.has(resourceId)) {
    explored.add(resourceId);
    const refs = await getResourcesReferenced(DB, resourceId);
    const foundRefs: { data_resource_id: string }[] = [];
    const promises = refs.map(async (ref: any) => {
      foundRefs.push(...(await getRecursiveReferences(DB, ref.reference_id, explored)));
    });
    await Promise.all(promises);
    //console.log(`Refs found for resource: ${resourceId}: ${foundRefs}`);
    return [{ data_resource_id: resourceId }, ...foundRefs];
  }
  return [];
}

/**
 * Create transaction bundle from group of resources that reference patient and their
 * subsequent references
 * @param resourceIds
 */
export function createTransactionBundle(resourceIds): fhir4.Bundle {}

// fix up and rename
async function main() {
  const DB = await ndjsonParser.populateDB();
  const patients = await getAllPatientIds(DB);
  const output: any[] = [];
  const explored: Set<string> = new Set();
  const promises = patients.map(async patient => {
    explored.add(patient.resource_id);
    const refs = await getReferencesToPatient(DB, patient.resource_id);
    const innerPromises = refs.map(async ref => {
      const results = await getRecursiveReferences(DB, ref.data_resource_id, explored);
      output.push(...results);
    });
    await Promise.all(innerPromises);
  });
  await Promise.all(promises);
  //console.log(output);
}
main();
