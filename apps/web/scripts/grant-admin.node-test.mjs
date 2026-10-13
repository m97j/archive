import assert from "node:assert/strict";
import test from "node:test";
import * as compatible from "./grant-admin.mjs";
import * as canonical from "../../cms/scripts/grant-admin.mjs";

test("the existing bootstrap command delegates to the CMS implementation without changing behavior", () => {
  assert.equal(compatible.grantAdministrator, canonical.grantAdministrator);
  assert.equal(compatible.readConfiguration, canonical.readConfiguration);
  assert.equal(compatible.AdminSetupError, canonical.AdminSetupError);
});
