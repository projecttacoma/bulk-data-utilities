import * as ndjsonParser from './ndjsonParser';
import { TransactionBundle } from '../types/TransactionBundle';
import * as sqlite from 'sqlite';
import { BulkDataResponse } from '../types/RequirementsQueryTypes';
import { sqlite3 } from 'sqlite3';

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
 * Uses SQL query to retrieve all the resource ids from the fhir resource
 * table in our database
 * @param DB sqlite database object
 * @returns an array containing resource_id, wrapped in an object, for each resource in
 * the fhir resource table
 */
export async function getAllResourceIds(DB: sqlite.Database): Promise<{ resource_id: string }[]> {
  return DB.all('SELECT resource_id FROM "fhir_resources"');
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
 * Uses SQL query to find all resource ids which correspond to fhir resources that
 * reference the passed in object
 * @param DB sqlite database object
 * @param resourceId id of the resource we want references of
 * @returns an array containing the resourceId, wrapped in an object,
 * for each resource which references the resource with the passed in resourceId
 */
export async function getResourcesThatReference(
  DB: sqlite.Database,
  resourceId: string
): Promise<{ origin_resource_id: string }[]> {
  return DB.all('SELECT origin_resource_id FROM "local_references"  WHERE reference_id = ?', resourceId);
}

/**
 * Recursively searches through the graph of references to pull the ids of all resources
 * related through some chain of references to the resource with the passed in id
 * @param DB sqlite database object
 * @param resourceId the resource id to begin the recursion with
 * @param exploredResources set of all previously processed resources within this recursive call(to avoid repeated effort)
 * @param addedResources set of all resources entered in database to check incoming refs against
 * and eventually use to catch all un-added resources
 * @returns an array of all resource ids referenced (through any chain of references)
 * by the resource with the passed in resource id
 */
export async function getRecursiveReferences(
  DB: sqlite.Database,
  resourceId: string,
  exploredResources: Set<string>,
  addedResources: Set<string>
): Promise<string[]> {
  if (exploredResources.has(resourceId)) {
    return [];
  }
  // We have not yet explored the references of the current resource
  exploredResources.add(resourceId);
  addedResources.add(resourceId);
  // Pulls all direct references
  const outgoingRefs = await getResourcesReferenced(DB, resourceId);
  // Pulls all resource ids of resources which reference the passed in id
  const incomingRefs = await getResourcesThatReference(DB, resourceId);
  const refs = outgoingRefs.map((ref: { reference_id: string }) => ref.reference_id);

  refs.push(
    ...incomingRefs
      //since the incoming refs won't cause reference errors in the transactionBundle upload, its not neccessary to
      //repeat them ever, even across transaction bundles
      .filter((ref: { origin_resource_id: string }) => !addedResources.has(ref.origin_resource_id))
      .map((ref: { origin_resource_id: string }) => ref.origin_resource_id)
  );
  const foundRefs: string[] = [];
  // Call the function recursively on all those references and add their results to the output array
  const promises = refs.map(async (ref: string) => {
    return getRecursiveReferences(DB, ref, exploredResources, addedResources);
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
 *
 * @param DB sqlite db containing all our resources
 * @param addedResources set of all resources which have been added to previous bundles
 * @returns a transaction bundle containing all resources which have not already been added to
 * a previous transaction bundle, and their dependencies.
 */
export async function addDisconnectedResources(
  DB: sqlite.Database,
  addedResources: Set<string>
): Promise<TransactionBundle | void> {
  // Find all resources that have so far not been entered into the bundle and extract the ids
  const cleanUpIds = (await getAllResourceIds(DB)).reduce((acc: string[], res: { resource_id: string }) => {
    if (!addedResources.has(res.resource_id)) {
      acc.push(res.resource_id);
    }
    return acc;
  }, []);
  if (cleanUpIds.length > 0) {
    // Define explored outside this map since all the entries are going to the same bundle anyway
    const explored: Set<string> = new Set();
    const cleanUpPromises = cleanUpIds.map(async id => {
      const a = getRecursiveReferences(DB, id, explored, addedResources);
      return a;
    });
    const results = await Promise.all(cleanUpPromises);
    cleanUpIds.push(...results.flat());
    const cleanUpBundle = await createTransactionBundle(DB, cleanUpIds);
    return cleanUpBundle;
  }
}

/**
 * Wrapper function to populate DB, get all patients and resources
 * that reference them, and create transaction bundle.
 * @param ndjsonDirectory directory to search for ndjson files
 * @param location location name for database
 * @returns TransactionBundle promise that can be uploaded to test
 * server
 */
export async function assembleTransactionBundle(DB: sqlite.Database): Promise<TransactionBundle[]> {
  const bundleArray: TransactionBundle[] = [];
  const addedResources: Set<string> = new Set();
  // get all patient Ids from database
  const patientIds = await getAllPatientIds(DB);
  const patientPromises = patientIds.map(async patientId => {
    // array for resources that reference patient and resources that
    // those resources reference
    let resourceIds: string[] = [];
    // resources that have been explored for references
    let explored: Set<string> = new Set();
    explored.add(patientId.resource_id);
    addedResources.add(patientId.resource_id);
    resourceIds.push(patientId.resource_id);
    // get all direct references to patient, then recursively get
    // rest of the references
    const refsToPatient = await getReferencesToPatient(DB, patientId.resource_id);
    const referencePromises = refsToPatient.map(async ref => {
      const a = getRecursiveReferences(DB, ref.origin_resource_id, explored, addedResources);
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

  const cleanUpBundle = await addDisconnectedResources(DB, addedResources);
  if (cleanUpBundle) {
    bundleArray.push(cleanUpBundle.toJSON());
  }
  return bundleArray;
}
