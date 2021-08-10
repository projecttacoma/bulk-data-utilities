export interface DRParameter {
  [key: string]: string | undefined;
}
export interface DRQuery {
  endpoint: string;
  params: DRParameter;
}

export interface APIParams {
  _type: string;
  _typeFilter: string;
}

export interface BulkDataResponse {
  type: string;
  count: number;
  url: string;
}
