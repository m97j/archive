import { describe, expect, it } from "vitest";

import { resolveUserAuthorization } from "../src/plugins/auth.js";

describe("user authorization header resolution", () => {
  it("uses the standard header for direct and local API requests", () => {
    expect(resolveUserAuthorization({ authorization: "Bearer user-jwt" })).toBe("Bearer user-jwt");
  });

  it("prefers the forwarded user JWT behind a private upstream gateway", () => {
    expect(
      resolveUserAuthorization({
        authorization: "Bearer hf-gateway-token",
        "x-archive-user-authorization": "Bearer user-jwt",
      }),
    ).toBe("Bearer user-jwt");
  });

  it("ignores ambiguous forwarded header arrays", () => {
    expect(
      resolveUserAuthorization({
        authorization: "Bearer direct-token",
        "x-archive-user-authorization": ["Bearer first", "Bearer second"],
      }),
    ).toBe("Bearer direct-token");
  });
});
