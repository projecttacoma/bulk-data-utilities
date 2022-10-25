export interface DRQuery {
  endpoint: string;
  params: Record<string, string>;
}

export interface APIParams {
  _type: string;
  _typeFilter?: string;
}

export interface BulkDataResponse {
  type: string;
  count: number;
  url: string;
}
