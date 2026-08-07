import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  apiFetch,
  apiFetchAllPages,
} from "@/lib/api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn();

  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("apiFetch", () => {
  it("returns JSON, text, and empty success bodies", async () => {
    mockFetch(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      }),
      new Response("accepted"),
      new Response(null, { status: 204 })
    );

    await expect(apiFetch<{ ok: boolean }>("/json")).resolves.toEqual({
      ok: true,
    });
    await expect(apiFetch<string>("/text")).resolves.toBe("accepted");
    await expect(apiFetch<void>("/empty")).resolves.toBeUndefined();
  });

  it("preserves structured API errors", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          error: {
            type: "invalid_request",
            code: "bad_input",
            message: "Choose a valid value.",
          },
        }),
        { status: 400 }
      )
    );

    const error = await apiFetch("/structured").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 400,
      type: "invalid_request",
      code: "bad_input",
      message: "Choose a valid value.",
    });
  });

  it("uses useful fallbacks for text, HTML, and empty errors", async () => {
    mockFetch(
      new Response("Upstream unavailable", { status: 502 }),
      new Response("<!doctype html><title>Error</title>", {
        status: 503,
        statusText: "Service Unavailable",
      }),
      new Response(null, { status: 500 })
    );

    await expect(apiFetch("/text-error")).rejects.toThrow(
      "Upstream unavailable"
    );
    await expect(apiFetch("/html-error")).rejects.toThrow(
      "Service Unavailable"
    );
    await expect(apiFetch("/empty-error")).rejects.toThrow("Request failed.");
  });
});

describe("apiFetchAllPages", () => {
  it("follows starting_after cursors and combines every page", async () => {
    const fetchMock = mockFetch(
      new Response(
        JSON.stringify({
          data: [{ id: "row_1" }, { id: "row_2" }],
          has_more: true,
        })
      ),
      new Response(
        JSON.stringify({
          data: [{ id: "row_3" }],
          has_more: false,
        })
      )
    );

    await expect(
      apiFetchAllPages<{ id: string }>("/api/v1/rows?limit=100")
    ).resolves.toEqual({
      data: [{ id: "row_1" }, { id: "row_2" }, { id: "row_3" }],
      has_more: false,
    });
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/rows?limit=100",
      "/api/v1/rows?limit=100&starting_after=row_2",
    ]);
  });

  it("rejects an empty or repeated cursor", async () => {
    mockFetch(
      new Response(JSON.stringify({ data: [], has_more: true })),
      new Response(
        JSON.stringify({ data: [{ id: "row_1" }], has_more: true })
      ),
      new Response(
        JSON.stringify({ data: [{ id: "row_1" }], has_more: true })
      )
    );

    await expect(apiFetchAllPages("/empty")).rejects.toThrow(
      "Pagination returned an invalid cursor."
    );
    await expect(apiFetchAllPages("/repeated")).rejects.toThrow(
      "Pagination returned an invalid cursor."
    );
  });
});
