import { retrieveBulkDataFromMeasureBundle } from './RequirementsQuery';
import { populateDB } from './utils/ndjsonParser';
import { assembleTransactionBundles } from './utils/bundleAssemblyHelpers';

async function executeBulkImport(mb: fhir4.Bundle, location: string) {
  const bulkDataResponses = await retrieveBulkDataFromMeasureBundle(mb);
  const db = await populateDB(bulkDataResponses, location);
  return await assembleTransactionBundles(db);
}
