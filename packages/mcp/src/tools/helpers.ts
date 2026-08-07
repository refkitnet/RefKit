import { ApiRequestError } from "../api.js";

export function textResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function toolError(error: unknown) {
  if (error instanceof ApiRequestError) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: {
                message: error.message,
                code: error.code,
                type: error.type,
                status: error.status,
              },
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  if (error instanceof Error) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: {
                message: error.message,
              },
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            error: {
              message: "Something went wrong.",
            },
          },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}

export async function runTool<T>(fn: () => Promise<T>) {
  try {
    const result = await fn();
    return textResult(result);
  }
  catch (error) {
    return toolError(error);
  }
}
