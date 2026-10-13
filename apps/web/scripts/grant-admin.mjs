import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main, AdminSetupError } from "../../cms/scripts/grant-admin.mjs";
export {
  grantAdministrator,
  readConfiguration,
  AdminSetupError,
} from "../../cms/scripts/grant-admin.mjs";

// Retain the existing local bootstrap command while keeping Auth tooling with the CMS.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof AdminSetupError ? error.message : "Setup failed; sensitive error details were suppressed."}\n`,
    );
    process.exitCode = 1;
  });
}
