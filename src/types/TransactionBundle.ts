class TransactionBundle implements fhir4.Bundle {
  resourceType: 'Bundle';
  entry: fhir4.BundleEntry[];
  identifier?: fhir4.Identifier | undefined;
  link?: fhir4.BundleLink[] | undefined;
  signature?: fhir4.Signature | undefined;
  timestamp?: string | undefined;
  _timestamp?: fhir4.Element | undefined;
  total?: number | undefined;
  type: 'transaction';
  _type?: fhir4.Element | undefined;
  id?: string | undefined;
  _id?: fhir4.Element | undefined;
  implicitRules?: string | undefined;
  _implicitRules?: fhir4.Element | undefined;
  language?: string | undefined;
  _language?: fhir4.Element | undefined;
  meta?: fhir4.Meta | undefined;

  constructor() {
    this.resourceType = 'Bundle';
    this.type = 'transaction';
    this.entry = [];
  }

  addEntryFromResource(resource: any) {
    const request: fhir4.BundleEntryRequest = { method: 'POST', url: resource.resourceType };

    const newEntry: fhir4.BundleEntry = {
      resource,
      request
    };
    this.entry = [...this.entry, newEntry];
  }

  //Add this - step 6
  toJSON() {}
}
