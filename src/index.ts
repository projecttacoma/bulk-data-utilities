import { assembleTransactionBundle } from './utils/bundleAssemblyHelpers';

assembleTransactionBundle('src/ndjsonResources/simple', './database.db').then(bundle =>
  console.log(JSON.stringify(bundle, null, 4))
);
