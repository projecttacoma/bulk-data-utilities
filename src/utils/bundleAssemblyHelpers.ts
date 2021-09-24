import * as ndjsonParser from './ndjsonParser';
import { TransactionBundle } from '../types/TransactionBundle';
import * as sqlite from 'sqlite';

/**
 * Uses SQL query to retrieve all the Patient resource ids from the fhir resource
 * table in our database
 * @param DB sqlite database object
 * @returns an array containing resource_id, wrapped in an object, for each patient in
 * the fhir resource table
 */
export async function getAllPatientIds(DB: sqlite.Database): Promise<{ resource_id: string }[]> {
  return DB.all('SELECT resource_id FROM "fhir_resources" WHERE fhir_type = "Patient"');
}

/**
 * Uses SQL query to retrieve all the resources in the fhir resource table that
 * reference a given patient
 * @param DB sqlite database object
 * @param patientId single patient ID string
 * @returns an array of all resource_ids wrapped in objects for resources that
 * reference the passed in patientId
 */
export async function getReferencesToPatient(
  DB: sqlite.Database,
  patientId: string
): Promise<{ origin_resource_id: string }[]> {
  return DB.all('SELECT origin_resource_id FROM "local_references" WHERE reference_id = ?', patientId);
}

/**
 * Uses SQL query to find all resource ids referenced by the fhir resource table with the passed
 * in resource id
 * @param DB sqlite database object
 * @param resourceId id of the resource we want references of
 * @returns an array containing the resourceId, wrapped in an object,
 * for each resource referenced by the resource with the passed in resourceId
 */
export async function getResourcesReferenced(
  DB: sqlite.Database,
  resourceId: string
): Promise<{ reference_id: string }[]> {
  return DB.all('SELECT reference_id FROM "local_references"  WHERE origin_resource_id = ?', resourceId);
}

/**
 * Recursively searches through the graph of references to pull the ids of all resources
 * related through some chain of references to the resource with the passed in id
 * @param DB sqlite database object
 * @param resourceId the resource id to begin the recursion with
 * @param explored set of all previously processed resources (to avoid repeated effort)
 * @returns an array of all resource ids referenced (through any chain of references)
 * by the resource with the passed in resource id
 */
export async function getRecursiveReferences(
  DB: sqlite.Database,
  resourceId: string,
  explored: Set<string>
): Promise<string[]> {
  if (explored.has(resourceId)) {
    return [];
  }
  // We have not yet explored the references of the current resource
  explored.add(resourceId);
  // Pulls all direct references
  const refs = await getResourcesReferenced(DB, resourceId);
  const foundRefs: string[] = [];
  // Call the function recursively on all those references and add their results to the ouput array
  const promises = refs.map(async (ref: { reference_id: string }) => {
    return getRecursiveReferences(DB, ref.reference_id, explored);
  });
  const newRefs = await Promise.all(promises);
  foundRefs.push(...newRefs.flat());
  // If the resource has no unexplored references, this will just return the passed in resourceId in an array
  return [resourceId, ...foundRefs];
}

/**
 * Create transaction bundle that contains all resources that reference patient, and their
 * subsequent references
 * @param DB sqlite database object
 * @param resourceIds - Ids for resources that reference patient and resources that
 * those resources reference
 * @returns transaction bundle object
 */
export async function createTransactionBundle(DB: sqlite.Database, resourceIds: string[]): Promise<TransactionBundle> {
  const tb = new TransactionBundle();
  // get data for each resource from the database
  const resourceJSONs: { resource_json: string }[] = await DB.all(
    `SELECT resource_json FROM "fhir_resources" WHERE resource_id IN (${Array(resourceIds.length)
      .fill('?')
      .join(', ')})`,
    ...resourceIds
  );
  resourceJSONs.forEach(resource => {
    tb.addEntryFromResource(JSON.parse(resource.resource_json));
  });
  return tb;
}

/**
 * Wrapper function to populate DB, get all patients and resources
 * that reference them, and create transaction bundle.
 * @param ndjsonDirectory directory to search for ndjson files
 * @param location location name for database
 * @returns TransactionBundle promise that can be uploaded to test
 * server
 */
export async function assembleTransactionBundle(
  ndjsonDirectory: string,
  location: string
): Promise<TransactionBundle[]> {
  const DB = await ndjsonParser.populateDB(ndjsonDirectory, location);
  // get all patient Ids from database
  const patientIds = await getAllPatientIds(DB);
  const bundleArray: TransactionBundle[] = [];
  const patientPromises = patientIds.map(async patientId => {
    // array for resources that reference patient and resources that
    // those resources reference
    let resourceIds: string[] = [];
    // resources that have been explored for references
    let explored: Set<string> = new Set();
    explored.add(patientId.resource_id);
    resourceIds.push(patientId.resource_id);
    // get all direct references to patient, then recursively get
    // rest of the references
    const refs = await getReferencesToPatient(DB, patientId.resource_id);
    const referencePromises = refs.map(async ref => {
      const a = getRecursiveReferences(DB, ref.origin_resource_id, explored);
      return a;
    });
    const results = await Promise.all(referencePromises);
    resourceIds.push(...results.flat());
    // create txn bundle of resources that ref patient and their
    // referenced resources
    const bundle = await createTransactionBundle(DB, resourceIds);
    bundleArray.push(bundle.toJSON());
    resourceIds = [];
    explored = new Set();
  });
  await Promise.all(patientPromises);

  return bundleArray;
}
