export type EntityId = string;
export type DecimalAmount = string;

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data: T;
  pagination?: Pagination;
}

export interface ApiErrorResponse {
  error: { code: string; message: string; details?: unknown };
  request_id: string;
}
