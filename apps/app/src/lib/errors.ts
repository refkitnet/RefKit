export type ApiErrorType =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal";

export type ApiErrorBody = {
  error: {
    type: ApiErrorType;
    code: string;
    message: string;
  };
};

export class AppError extends Error {
  type: ApiErrorType;
  code: string;
  status: number;

  constructor(
    type: ApiErrorType,
    code: string,
    message: string,
    status: number
  ) {
    super(message);
    this.type = type;
    this.code = code;
    this.status = status;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        type: this.type,
        code: this.code,
        message: this.message,
      },
    };
  }
}

export function jsonError(error: AppError): Response {
  return Response.json(error.toBody(), { status: error.status });
}

export function jsonOk<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}
