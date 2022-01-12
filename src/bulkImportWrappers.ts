import { retrieveAllBulkData, retrieveBulkDataFromMeasureBundle } from './utils/requirementsQueryBuilder';
import { BulkDataResponse } from './types/requirementsQueryTypes';

export async function executeBulkImport(
  exportUrl: string,
  mb?: fhir4.Bundle,
  useTypeFilters?: boolean
): Promise<BulkDataResponse[] | null> {
  let bulkDataResponses = null;
  if (mb) {
    ({ output: bulkDataResponses } = await retrieveBulkDataFromMeasureBundle(mb, exportUrl, useTypeFilters));
  } else {
    ({ output: bulkDataResponses } = await retrieveAllBulkData(exportUrl));
  }
  if (bulkDataResponses) {
    return bulkDataResponses;
  }

  return null;
}
