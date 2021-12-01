import { retrieveAllBulkData, retrieveBulkDataFromMeasureBundle } from './RequirementsQuery';
import { populateDB } from './utils/ndjsonParser';
import { assembleTransactionBundles } from './utils/bundleAssemblyHelpers';
import { TransactionBundle } from './types/TransactionBundle';

export async function executeBulkImport(
  exportUrl: string,
  location: string,
  mb?: fhir4.Bundle
): Promise<TransactionBundle[] | void> {
  let bulkDataResponses = null;
  if (mb) {
    ({ output: bulkDataResponses } = await retrieveBulkDataFromMeasureBundle(mb, exportUrl));
  } else {
    ({ output: bulkDataResponses } = await retrieveAllBulkData(exportUrl));
  }
  if (bulkDataResponses) {
    const db = await populateDB(bulkDataResponses, location);
    const tbArr = await assembleTransactionBundles(db);
    await db.close();
    return tbArr;
  }
}
