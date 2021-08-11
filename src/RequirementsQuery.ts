import { Calculator } from 'fqm-execution';
import { R4 } from '@ahryman40k/ts-fhir-types';
import fs from 'fs';
import axios from 'axios';
import { URLSearchParams } from 'url';
import { DRQuery, APIParams, BulkDataResponse } from './types/RequirementsQueryTypes';

const headers = {
  Accept: 'application/fhir+json',
  Prefer: 'respond-async'
};
const exampleMeasureBundle = '../EXM130-7.3.000-bundle.json'; //REPLACE WITH PATH TO DESIRED MEASURE BUNDLE
const API_URL =
  'https://bulk-data.smarthealthit.org/eyJlcnIiOiIiLCJwYWdlIjoxMDAwMCwiZHVyIjoxMCwidGx0IjoxNSwibSI6MSwic3R1IjozLCJkZWwiOjB9/fhir';

/**
 * Function taken directly from fqm-execution. parses measure bundle into
 * appropriate format for dataRequrements function
 * @param filePath: path to measure bundloe on local machine
 * @returns
 */
function parseBundle(filePath: string): R4.IBundle {
  const contents = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(contents) as R4.IBundle;
}

/**
 * extracts the data requirements and fomrats
 * @param dataRequirements: An array of data requirements as returned from fqm-execution
 * @returns
 */
export const getDataRequirementsQueries = (dataRequirements: R4.IDataRequirement[]): APIParams => {
  const queries: DRQuery[] = [];

  //converts dataRequirements output into a format easily parsed into URL params
  dataRequirements.forEach(dr => {
    if (dr.type) {
      const q: DRQuery = { endpoint: dr.type, params: {} };
      if (dr?.codeFilter?.[0].code?.[0]) {
        const key = dr?.codeFilter?.[0].path;
        key && (q.params[key] = dr.codeFilter[0].code[0].code);
      } else if (dr?.codeFilter?.[0].valueSet) {
        const key = `${dr?.codeFilter?.[0].path}:in`;
        key && (q.params[key] = dr.codeFilter[0].valueSet);
      }
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
  let formattedTypeFilter = queries.reduce((acc, e) => {
    //if the params object is empty, we dont want to add any params
    if (Object.keys(e.params).length > 0) {
      acc = acc.concat(e.endpoint, '%3F', new URLSearchParams(e.params).toString(), ',');
    }
    return acc;
  }, '');
  //get rid of that last pesky comma
  formattedTypeFilter = formattedTypeFilter.substring(0, formattedTypeFilter.length - 1);

  return { _type: formattedTypes, _typeFilter: formattedTypeFilter };
};

/**
 * sends initial request to bulk data export server and calls recurring poll function
 * to check on progress
 * @param url: A bulk data export FHIR server url with params
 */
async function queryBulkDataServer(url: string): Promise<void> {
  await axios
    .get(url, { headers })
    .then(resp => {
      probeServer(resp.headers['content-location']);
    })
    .catch(e => console.error(JSON.stringify(e.response.data, null, 4)));
}

/**
 * Repeatedly checks the passed url (every second) until the request either fails or succeeds
 * @param url: A content-location url retrieved by queryBulkDataServer which will
 * eventually contain the output data when processing completes
 */
async function probeServer(url: string): Promise<BulkDataResponse | void> {
  const results = await axios.get(url, { headers });
  if (results.status === 202) {
    setTimeout(() => probeServer(url), 1000);
  } else if (results.status === 200) {
    console.log(results.data.output);
  } else if (results.status === 500) {
    console.error(results.data);
  }
}

/**
 * parses a measure bundle based on the local path and queries a bulk data server for the data requirements
 * @param measureBundle: path to a local measure bundle
 */
async function retrieveBulkDataFromMeasureBundle(measureBundle: string) {
  const dr = Calculator.calculateDataRequirements(parseBundle(measureBundle));
  console.log(JSON.stringify(dr, null, 4));
  if (!dr.results.dataRequirement) {
    dr.results.dataRequirement = [];
  }
  const params = getDataRequirementsQueries(dr.results.dataRequirement);
  const url = API_URL.concat('/$export?_type=Patient'); //, params._type, '&_typeFilter=', params._typeFilter);
  console.log(url);
  console.log(JSON.stringify(params, null, 4));
  queryBulkDataServer(url);
}

//retrieveBulkDataFromMeasureBundle(exampleMeasureBundle); //UNCOMMENT TO RUN API REQUEST WITH DESIRED MEASUREBUNDLE
