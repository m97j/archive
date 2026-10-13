import { describe, expect, it } from "vitest";
import { isReservedPublicationPath } from "./index.js";
describe("management route reservation", () => {
  it.each([
    "/admin",
    "/ko/admin",
    "/en/login",
    "/ko/%61dmin",
    "/ko/%2561dmin",
    "/KO/ADMIN",
    "/ko/auth/callback",
    "/api/upload",
    "/ko/new",
    "/ko/cms",
    "/ko/../admin",
    "/ko/%0aadmin",
    "/ko/%255cadmin",
    "/ko/%ZZ",
  ])("rejects %s", (path) => expect(isReservedPublicationPath(path)).toBe(true));
  it.each([
    "/ko/research/world-model",
    "/en/docs/administering-models",
    "/ko/notes/login-concepts",
    "/ko/research/my-admin",
    "/en/%ED%95%9C%EA%B8%80",
  ])("preserves document path %s", (path) => expect(isReservedPublicationPath(path)).toBe(false));
});
