import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";
import { parseJsonBody } from "@/lib/api";
import { handleRouteError } from "@/lib/auth-context";

describe("parseJsonBody", () => {
  async function expectInvalidRequestBody(request: Request) {
    let error: unknown;

    try {
      await parseJsonBody(request, z.object({ name: z.string() }));
    }
    catch (caught) {
      error = caught;
    }

    const response = handleRouteError(error);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        type: "invalid_request",
        code: "invalid_request_body",
        message: "Request body must be valid JSON.",
      },
    });
  }

  it.each(["", "{", "not-json"])(
    "maps malformed JSON (%j) to the standard invalid request envelope",
    async (body) => {
      const request = new Request("http://refkit.test/v1/example", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });

      await expectInvalidRequestBody(request);
    }
  );

  it("rejects a JSON body sent with the wrong media type", async () => {
    const request = new Request("http://refkit.test/v1/example", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ name: "RefKit" }),
    });

    await expectInvalidRequestBody(request);
  });

  it("preserves schema validation errors for valid JSON", async () => {
    const request = new Request("http://refkit.test/v1/example", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ name: 42 }),
    });

    await expect(
      parseJsonBody(request, z.object({ name: z.string() }))
    ).rejects.toBeInstanceOf(ZodError);
  });
});
