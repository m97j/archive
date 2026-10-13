import { describe, expect, it } from "vitest";
import { sanitizedErrorLog, sanitizedRequestLog } from "../src/app.js";
describe("request log minimization", () => {
  it("omits search queries, authentication headers and peer identity", () => {
    const request = {
      method: "GET",
      url: "/v1/public/contents?q=private-query&token=secret",
      headers: { authorization: "secret" },
      ip: "127.0.0.1",
    };
    expect(sanitizedRequestLog(request)).toEqual({ method: "GET", url: "/v1/public/contents" });
  });
  it("does not serialize exception text or stack traces", () => {
    const error = Object.assign(new Error("private source, password"), { code: "23505" });
    expect(sanitizedErrorLog(error)).toEqual({
      type: "Error",
      message: "Request error",
      stack: "",
      code: "23505",
    });
    expect(sanitizedErrorLog({ code: "credential detail" }).code).toBe("UNSPECIFIED");
  });
});
