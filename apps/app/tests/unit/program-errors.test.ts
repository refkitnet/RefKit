import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { rethrowProgramCreateError } from "@/services/programs";

describe("rethrowProgramCreateError", () => {
  it("maps a unique violation on error.cause to program_slug_taken", () => {
    const drizzleError = {
      query: 'insert into "programs" ...',
      cause: {
        code: "23505",
        detail: 'Key (slug)=(demo) already exists.',
      },
    };

    expect(() => rethrowProgramCreateError(drizzleError)).toThrow(
      expect.objectContaining({
        code: "program_slug_taken",
        message: "Program slug is already in use.",
        status: 409,
      } satisfies Partial<AppError>)
    );
  });

  it("rethrows unrelated errors", () => {
    const error = new Error("boom");

    expect(() => rethrowProgramCreateError(error)).toThrow(error);
  });
});
