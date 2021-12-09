# Bulk Data Utilities 

A library to handle  bulk import requests and interact with the [DEQM-Test-Server](https://github.com/projecttacoma/deqm-test-server) This library is used to help implement bulk import via a  ping and pull approach which is described [here] (https://github.com/smart-on-fhir/bulk-import/blob/master/import-pnp.md)

## Usage 
###  Installation
In order to install this library as a dependency for a project  to use in bulk data development: 

```npm install --save https://github.com/projecttacoma/bulk-data-utilities```

### Usage

```import { BulkImportWrappers } from 'bulk-data-utilities';```

```await BulkImportWrappers.executeBulkImport(exportUrl, location, mb);```

## Local Development
### Prerequisites

- [Node.js >=11.15.0](https://nodejs.org/en/)
- [Git](https://git-scm.com/)


### Local Installation

Clone the source code:

```bash
git clone https://github.com/projecttacoma/bulk-data-utilities.git
```

Install dependencies:

```bash
npm install
```

### Testing

Unit tests can be running using the following `npm` command:

```bash
npm run test
```


## License

Copyright 2021 The MITRE Corporation

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

```bash
http://www.apache.org/licenses/LICENSE-2.0
```

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
