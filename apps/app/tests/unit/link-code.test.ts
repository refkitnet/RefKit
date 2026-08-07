import { beforeEach, describe, expect, it, vi } from "vitest";

const { randomInt } = vi.hoisted(() => ({
  randomInt: vi.fn(),
}));

vi.mock("crypto", () => ({
  randomInt,
}));

import { generateLinkCode } from "@/lib/link-code";

describe("generateLinkCode", () => {
  beforeEach(() => {
    randomInt.mockReset();
  });

  it("selects each character with an unbiased random index", () => {
    for (let index = 0; index < 8; index++) {
      randomInt.mockReturnValueOnce(index);
    }

    expect(generateLinkCode()).toBe("23456789");
    expect(randomInt).toHaveBeenCalledTimes(8);

    for (let call = 1; call <= 8; call++) {
      expect(randomInt).toHaveBeenNthCalledWith(call, 31);
    }
  });
});
