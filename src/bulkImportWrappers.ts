import { retrieveAllBulkData, retrieveBulkDataFromMeasureBundle } from './utils/requirementsQueryBuilder';
import { BulkDataResponse } from './types/requirementsQueryTypes';

export async function executeBulkImport(exportUrl: string, mb?: fhir4.Bundle): Promise<BulkDataResponse[] | undefined> {
  let bulkDataResponses = null;
  if (mb) {
    ({ output: bulkDataResponses } = await retrieveBulkDataFromMeasureBundle(mb, exportUrl));
  } else {
    ({ output: bulkDataResponses } = await retrieveAllBulkData(exportUrl));
  }
  if (bulkDataResponses) {
    return bulkDataResponses;
  }
}
