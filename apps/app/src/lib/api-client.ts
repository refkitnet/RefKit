export type ApiErrorBody = {
  error: {
    type: string;
    code: string;
    message: string;
  };
};

export class ApiClientError extends Error {
  type: string;
  code: string;
  status: number;

  constructor(status: number, body: ApiErrorBody["error"]) {
    super(body.message);
    this.type = body.type;
    this.code = body.code;
    this.status = status;
  }
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (!body || typeof body !== "object" || !("error" in body)) {
    return false;
  }

  const error = body.error;

  return Boolean(
    error
      && typeof error === "object"
      && "type" in error
      && typeof error.type === "string"
      && "code" in error
      && typeof error.code === "string"
      && "message" in error
      && typeof error.message === "string"
  );
}

function fallbackErrorMessage(response: Response, body: unknown): string {
  const contentType = response.headers.get("Content-Type") ?? "";

  if (
    typeof body === "string"
    && body.trim()
    && !contentType.toLowerCase().includes("text/html")
    && !/^\s*(?:<!doctype\s+html|<html\b)/i.test(body)
  ) {
    return body.trim();
  }

  return response.statusText || "Request failed.";
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });

  const responseText = await response.text();
  let body: unknown;

  if (responseText) {
    try {
      body = JSON.parse(responseText);
    }
    catch {
      body = responseText;
    }
  }

  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      isApiErrorBody(body) ? body.error : {
        type: "internal",
        code: "request_failed",
        message: fallbackErrorMessage(response, body),
      }
    );
  }

  return body as T;
}

export type ListResponse<T> = {
  data: T[];
  has_more: boolean;
};

function withStartingAfter(path: string, cursor: string): string {
  const hashIndex = path.indexOf("#");
  const hash = hashIndex === -1 ? "" : path.slice(hashIndex);
  const pathWithoutHash = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const queryIndex = pathWithoutHash.indexOf("?");
  const pathname = queryIndex === -1
    ? pathWithoutHash
    : pathWithoutHash.slice(0, queryIndex);
  const params = new URLSearchParams(
    queryIndex === -1 ? "" : pathWithoutHash.slice(queryIndex + 1)
  );

  params.set("starting_after", cursor);

  return `${pathname}?${params.toString()}${hash}`;
}

export async function apiFetchAllPages<T extends { id: string }>(
  path: string,
  init?: RequestInit
): Promise<ListResponse<T>> {
  const data: T[] = [];
  let nextPath = path;
  let previousCursor: string | null = null;

  while (true) {
    const page = await apiFetch<ListResponse<T>>(nextPath, init);
    data.push(...page.data);

    if (!page.has_more) {
      return { data, has_more: false };
    }

    const cursor = page.data.at(-1)?.id;

    if (!cursor || cursor === previousCursor) {
      throw new Error("Pagination returned an invalid cursor.");
    }

    previousCursor = cursor;
    nextPath = withStartingAfter(path, cursor);
  }
}
