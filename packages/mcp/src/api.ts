export type ApiErrorBody = {
  error: {
    type: string;
    code: string;
    message: string;
  };
};

export class ApiRequestError extends Error {
  code: string;
  type: string;
  status: number;

  constructor(body: ApiErrorBody["error"], status: number) {
    super(body.message);
    this.code = body.code;
    this.type = body.type;
    this.status = status;
  }
}

export type ListResponse<T> = {
  data: T[];
  has_more: boolean;
};

export type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
  apiUrl: string;
  query?: Record<string, string | number | undefined | null>;
  raw?: boolean;
  headers?: Record<string, string>;
};

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions
): Promise<T> {
  const url = new URL(path, `${options.apiUrl}/`);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = { ...options.headers };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body:
      options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (options.raw) {
    if (!response.ok) {
      let message = `Request failed with status ${response.status}.`;

      try {
        const body = (await response.json()) as ApiErrorBody;

        if (body.error?.message) {
          message = body.error.message;
        }
      }
      catch {
        // Keep default message.
      }

      throw new ApiRequestError(
        {
          type: "invalid_request",
          code: "request_failed",
          message,
        },
        response.status
      );
    }

    return (await response.text()) as T;
  }

  let body: unknown = null;

  try {
    body = await response.json();
  }
  catch {
    body = null;
  }

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;

    if (errorBody?.error) {
      throw new ApiRequestError(errorBody.error, response.status);
    }

    throw new ApiRequestError(
      {
        type: "invalid_request",
        code: "request_failed",
        message: `Request failed with status ${response.status}.`,
      },
      response.status
    );
  }

  return body as T;
}
