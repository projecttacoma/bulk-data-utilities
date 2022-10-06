import { retrieveAllBulkData, retrieveBulkDataFromMeasureBundle } from './utils/requirementsQueryBuilder';
import { BulkDataResponse } from './types/requirementsQueryTypes';
import { getStaticManifest } from './utils/exportServerQueryBuilder';

export async function executeBulkImport(
  exportUrl: string,
  exportType?: string,
  mb?: fhir4.Bundle,
  useTypeFilters?: boolean
): Promise<BulkDataResponse[] | null> {
  let bulkDataResponses = null;
  if (exportType === 'static') {
    ({ output: bulkDataResponses } = await getStaticManifest(exportUrl));
  } else {
    if (mb) {
      ({ output: bulkDataResponses } = await retrieveBulkDataFromMeasureBundle(mb, exportUrl, useTypeFilters));
    } else {
      ({ output: bulkDataResponses } = await retrieveAllBulkData(exportUrl));
    }
  }
  if (bulkDataResponses) {
    return bulkDataResponses;
  }

  return null;
}
