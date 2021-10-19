import { retrieveBulkDataFromMeasureBundle } from './RequirementsQuery';
import { populateDB } from './utils/ndjsonParser';
import { assembleTransactionBundles } from './utils/bundleAssemblyHelpers';
import { TransactionBundle } from './types/TransactionBundle';

export async function executeBulkImport(
  mb: fhir4.Bundle,
  exportUrl: string,
  location: string
): Promise<TransactionBundle[] | void> {
  const { output: bulkDataResponses } = await retrieveBulkDataFromMeasureBundle(mb, exportUrl);
  if (bulkDataResponses) {
    const db = await populateDB(bulkDataResponses, location);
    const tbArr = await assembleTransactionBundles(db);
    await db.close();
    return tbArr;
  }
}
