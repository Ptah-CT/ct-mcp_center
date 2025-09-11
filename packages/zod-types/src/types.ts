export interface BaseResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}

export type ApiResponse<T = any> = BaseResponse & {
  data?: T;
};
