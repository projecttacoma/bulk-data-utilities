import * as ndjsonParser from './ndjsonParser';
import { DBWithPromise } from '../types/DatabaseTypes';
import { TransactionBundle } from '../types/TransactionBundle';

/**
 * Uses SQL query to retrieve all the Patient resource ids from the data table in our database
 * @param DB database object
 * @returns an array containing resource_id, wrapped in an object, for each patient
 */
export async function getAllPatientIds(DB: DBWithPromise): Promise<{ resource_id: string }[]> {
  return await DB.promise('all', 'SELECT resource_id FROM "fhir_resources" WHERE fhir_type = "Patient"');
}

/**
 * Uses SQL query to retrieve all the resources in the data table that reference the
 * given patient
 * @param DB database object
 * @param patientId single patient ID string
 * @returns an array of all resource_ids wrapped in objects for resources that reference the passed in patientId
 */
export async function getReferencesToPatient(
  DB: DBWithPromise,
  patientId: string
): Promise<{ origin_resource_id: string }[]> {
  return await DB.promise('all', 'SELECT origin_resource_id FROM "local_references" WHERE reference_id = ?', patientId);
}

/**
 * Uses an SQL query to find all resource ids referenced by the fhir resource with the passed in id
 * @param DB database object
 * @param resourceId id of the resource we want references of
 * @returns an array containing the resourceId, wrapped in an object,
 * for each resource referenced by the resource with the passed in resourceId
 */
export async function getResourcesReferenced(
  DB: DBWithPromise,
  resourceId: string
): Promise<{ reference_id: string }[]> {
  return await DB.promise(
    'all',
    'SELECT reference_id FROM "local_references"  WHERE origin_resource_id = ?',
    resourceId
  );
}

/**
 * Recursively searches through the graph of references to pull the ids of all resources
 * related through some chain of references to the resource with the passed in id
 * @param DB database object
 * @param resourceId the resource id to begin the recursion with
 * @param explored set of all previously processed resources to avoid repeated effort
 * @returns an array of all resource ids referenced (through any chain of references)
 * by the resource with the passed in resource id
 */
export async function getRecursiveReferences(
  DB: DBWithPromise,
  resourceId: string,
  explored: Set<string>
): Promise<string[]> {
  if (explored.has(resourceId)) {
    return [];
  }
  //We have not yet explored the references of the current resource
  explored.add(resourceId);
  //Pulls all direct references
  const refs = await getResourcesReferenced(DB, resourceId);
  const foundRefs: string[] = [];
  //Call the function recursively on all those references and add their results to the ouput array
  const promises = refs.map(async (ref: any) => {
    foundRefs.push(...(await getRecursiveReferences(DB, ref.reference_id, explored)));
  });
  await Promise.all(promises);
  //If the resource has no unexplored references, this will just return the passed in resourceId in an array
  return [resourceId, ...foundRefs];
}

/**
 * Create transaction bundle from group of resources that reference patient and their
 * subsequent references
 * @param resourceIds - Ids for resources that reference patient and resources that
 * those resources reference
 */
export async function createTransactionBundle(DB: DBWithPromise, resourceIds: string[]): Promise<TransactionBundle> {
  const tb = new TransactionBundle();
  // get data for each resource from the database
  const resourceJSONs = await DB.promise(
    'all',
    `SELECT resource_json FROM "fhir_resources" WHERE resource_id IN (${Array(resourceIds.length)
      .fill('?')
      .join(', ')})`,
    ...resourceIds
  );
  resourceJSONs.forEach((resource: any) => {
    tb.addEntryFromResource(JSON.parse(resource.resource_json));
  });
  return tb;
}

/**
 * Wrapper function to populate DB, get all patients and resources
 * that reference them, and create transaction bundle.
 * @returns TransactionBundle promise that can be uploaded to test
 * server
 */
async function AssembleTransactionBundle(ndjsonDirectory: string): Promise<TransactionBundle> {
  const DB = await ndjsonParser.populateDB(ndjsonDirectory);
  // get all patient Ids from database
  const patientIds = await getAllPatientIds(DB);
  // array for resources that reference patient and resources that
  // those resources reference
  const resourceIds: string[] = [];
  // resources that have been explored for references
  const explored: Set<string> = new Set();
  const patientPromises = patientIds.map(async patientId => {
    explored.add(patientId.resource_id);
    resourceIds.push(patientId.resource_id);
    // get all direct references to patient, then recursively get
    // rest of the references
    const refs = await getReferencesToPatient(DB, patientId.resource_id);
    const referencePromises = refs.map(async ref => {
      const results = await getRecursiveReferences(DB, ref.origin_resource_id, explored);
      resourceIds.push(...results);
    });
    await Promise.all(referencePromises);
  });
  await Promise.all(patientPromises);
  // create txn bundle of resources that ref patient and their
  // referenced resources
  return createTransactionBundle(DB, resourceIds);
}
AssembleTransactionBundle();
