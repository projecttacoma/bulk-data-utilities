import fs from 'fs';
import path from 'path';

const p = path.resolve(path.join(__dirname, './resources.json'));
const resources = JSON.parse(fs.readFileSync(p, 'utf8')) as fhir4.FhirResource[];

const obj: { [resourceType: string]: string } = {};

resources.forEach(r => {
  if (obj[r.resourceType]) {
    obj[r.resourceType] += `${JSON.stringify(r)}\n`;
  } else {
    obj[r.resourceType] = `${JSON.stringify(r)}\n`;
  }
});

Object.entries(obj).forEach(([resourceType, ndjson]) => {
  fs.writeFileSync(`test/fixtures/convertedResources/${resourceType}.ndjson`, ndjson, 'utf8');
});
