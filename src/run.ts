import { assembleTransactionBundle } from './utils/bundleAssemblyHelpers';

assembleTransactionBundle('test/ndjsonResources/simple', './database.db').then(bundle =>
  console.log(JSON.stringify(bundle, null, 4))
);
