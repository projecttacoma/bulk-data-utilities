import { Calculator } from 'fqm-execution';
import fs from 'fs';
import { URLSearchParams } from 'url';
import { DRQuery, APIParams, BulkDataResponse } from './types/RequirementsQueryTypes';
import { queryBulkDataServer } from './exportServerQueries';

/**
 * Temporary Solution: this line gets rid of the self signed cert
 * errors that come up in the bulk data import reference server
 *
 * TODO: Remove this once we make changes to the reference
 * server
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const exampleMeasureBundle = '../connectathon/fhir401/bundles/measure/EXM130-7.3.000/EXM130-7.3.000-bundle.json'; //REPLACE WITH PATH TO DESIRED MEASURE BUNDLE

// Retrieved from https://bulk-data.smarthealthit.org/ under FHIR Server URL
export const API_URL =
  'https://bulk-data.smarthealthit.org/eyJlcnIiOiIiLCJwYWdlIjoxMDAwMCwiZHVyIjoxMCwidGx0IjoxNSwibSI6MSwic3R1IjozLCJkZWwiOjB9/fhir';

const EXAMPLE_REQUIREMENTS = [
  {
    type: 'Encounter',
    codeFilter: []
  },
  {
    type: 'Procedure',
    codeFilter: []
  },
  {
    type: 'Patient',
    codeFilter: []
  }
];

/**
 * Function taken directly from fqm-execution. parses measure bundle into
 * appropriate format for dataRequirements function
 * @param filePath: path to measure bundle on local machine
 * @returns fhir4.Bundle: a MeasureBundle as a JSON object parsed from the passed file
 */
function parseBundle(filePath: string): fhir4.Bundle {
  const contents = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(contents) as fhir4.Bundle;
}

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

      /*
      NOTE: codeFilter code has been commented out in order to test
      bulkImport in deqm-test-server. Otherwise, errors arise since
      the $export reference server does not support _typeFilter
      */
      // if (dr?.codeFilter?.[0]?.code?.[0]) {
      //   const key = dr?.codeFilter?.[0].path;
      //   key && (q.params[key] = dr.codeFilter[0].code[0].code);
      // } else if (dr?.codeFilter?.[0]?.valueSet) {
      //   const key = `${dr?.codeFilter?.[0].path}:in`;
      //   key && (q.params[key] = dr.codeFilter[0].valueSet);
      // }
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
 * Parses a measure bundle based on the local path and queries a bulk data server for the data requirements
 * @param measureBundle: path to a local measure bundle
 * @param exportURL: export server URL string
 */
async function retrieveBulkDataFromMeasureBundlePath(measureBundle: string, exportURL: string) {
  const dr = Calculator.calculateDataRequirements(parseBundle(measureBundle));
  if (!dr.results.dataRequirement) {
    dr.results.dataRequirement = [];
  }
  return await retrieveBulkDataFromRequirements(dr.results.dataRequirement, exportURL);
}

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
  const url = `${exportURL}/$export?_type=Encounter,Condition,Location,Patient`;
  return await queryBulkDataServer(url);
}

//retrieveBulkDataFromMeasureBundlePath(exampleMeasureBundle, API_URL); //UNCOMMENT TO RUN API REQUEST WITH DESIRED MEASUREBUNDLE FILE (Will almost certainly cause an error)
//retrieveBulkDataFromRequirements(EXAMPLE_REQUIREMENTS, API_URL); //UNCOMMENT TO RUN API REQUEST WITH EXAMPLE DATA REQUIREMENTS
