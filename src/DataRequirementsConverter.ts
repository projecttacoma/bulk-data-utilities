import { Calculator } from 'fqm-execution';
import { R4 } from '@ahryman40k/ts-fhir-types';
import fs from 'fs';
import { string } from 'io-ts';

const measureBundle = '../EXM130-7.3.000-bundle.json';

const dr = Calculator.calculateDataRequirements(parseBundle(measureBundle));

function parseBundle(filePath: string): R4.IBundle {
  const contents = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(contents) as R4.IBundle;
}

// def get_data_requirements_queries(data_requirement)
//       # hashes with { endpoint => FHIR Type, params => { queries } }
//       queries = data_requirement
//         .select { |dr| dr&.type }
//         .map do |dr|
//           q = { 'endpoint' => dr.type, 'params' => {} }

//           # prefer specific code filter first before valueSet
//           if dr.codeFilter&.first&.code&.first
//             q['params'][dr.codeFilter.first.path.to_s] = dr.codeFilter.first.code.first.code
//           elsif dr.codeFilter&.first&.valueSet
//             q['params']["#{dr.codeFilter.first.path}:in"] = dr.codeFilter.first.valueSet
//           end

//           q
//         end

//       # TODO: We should be smartly querying for patients based on what the resources reference?
//       queries.unshift('endpoint' => 'Patient', 'params' => {})
//       queries
//     end
interface DRParameter {
  [key: string]: string | undefined;
}
interface DRQuery {
  endpoint: string | undefined;
  params: DRParameter;
}

const getDataRequirementsQueries = (dataRequirements: R4.IDataRequirement[]): DRQuery[] => {
  const queries = dataRequirements
    .filter(dr => dr.type)
    .map(dr => {
      const q: DRQuery = { endpoint: dr.type, params: {} };
      if (dr?.codeFilter?.[0].code?.[0]) {
        const key = dr?.codeFilter?.[0].path ?? 'undefined';
        q.params[key] = dr.codeFilter[0].code[0].code;
      } else if (dr?.codeFilter?.[0].valueSet) {
        const key = `${dr?.codeFilter?.[0].path ?? 'undefined'}:in`;
        q.params[key] = dr.codeFilter[0].valueSet;
      }
      return q;
    });

  return queries;
};

console.log(JSON.stringify(dr.results.dataRequirement, null, 4));
const output = dr.results.dataRequirement && getDataRequirementsQueries(dr.results.dataRequirement);
console.log(JSON.stringify(output, null, 4));
