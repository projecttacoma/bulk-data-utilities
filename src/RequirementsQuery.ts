import { Calculator } from 'fqm-execution';
import { URLSearchParams } from 'url';
import { DRQuery, APIParams, BulkDataResponse } from './types/RequirementsQueryTypes';
import { queryBulkDataServer } from './exportServerQueries';

/**
 * extracts the data requirements and formats
 * @param dataRequirements: An array of data requirements as returned from fqm-execution
 * @returns APIParams: An object containing the _type and _typeFilter strings to be appended to the URL as parameters
 */
export const getDataRequirementsQueries = (dataRequirements: fhir4.DataRequirement[]): APIParams => {
  const queries: DRQuery[] = [];

  // converts dataRequirements output into a format easily parsed into URL params
  dataRequirements.forEach(dr => {
    if (dr.type) {
      const q: DRQuery = { endpoint: dr.type, params: {} };
      queries.push(q);
    }
  });
  //take only the unique fhir types
  const uniqTypes = queries.reduce((acc: string[], e) => {
    if (!acc.includes(e.endpoint)) {
      acc.push(e.endpoint);
    }
    return acc;
  }, []);
  const formattedTypes = uniqTypes.join(',');
  const formattedTypeFilter = queries.reduce((acc: string[], e) => {
    //if the params object is empty, we dont want to add any params
    if (Object.keys(e.params).length > 0) {
      acc.push(`${e.endpoint}%3F${new URLSearchParams(e.params).toString()}`);
    }
    return acc;
  }, []);
  const typeFilterString = formattedTypeFilter.join(',');

  return { _type: formattedTypes, _typeFilter: typeFilterString };
};

/**
 * Parses a measure bundle object and queries a bulk data server for the data requirements
 * @param measureBundle: measure bundle object
 * @param exportURL: export server URL string
 */

export async function retrieveBulkDataFromMeasureBundle(
  measureBundle: fhir4.Bundle,
  exportURL: string
): Promise<{ output?: BulkDataResponse[] | null; error?: string }> {
  const dr = Calculator.calculateDataRequirements(measureBundle);
  if (!dr.results.dataRequirement) {
    dr.results.dataRequirement = [];
  }
  return await retrieveBulkDataFromRequirements(dr.results.dataRequirement, exportURL);
}

/**
 * takes in data requirements and creates a URL to query bulk data server, then queries it
 * @param requirements: dataRequirements as output from fqm-execution
 * @param exportURL: export server URL string
 */

async function retrieveBulkDataFromRequirements(
  requirements: fhir4.DataRequirement[],
  exportURL: string
): Promise<{ output?: BulkDataResponse[] | null; error?: string }> {
  const params = getDataRequirementsQueries(requirements);
  const url = `${exportURL}/$export?_type=${params._type}&_typeFilter=${params._typeFilter}`;
  return await queryBulkDataServer(url);
}

/**
 * Formats a request for all data on the given server and executes it
 * @param {string} exportURL The url of the desired export server
 * @returns An object containing an array of bulkDataResponses
 */
export async function retrieveAllBulkData(
  exportURL: string
): Promise<{ output?: BulkDataResponse[] | null; error?: string }> {
  const url = `${exportURL}/$export`;
  return await queryBulkDataServer(url);
}
