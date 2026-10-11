// Test-only child process: no database driver or network requests.
import { readFileSync } from "node:fs";

if (process.argv[2] === "--check-dependency") {
  process.stdout.write("Test fixture available.\n");
} else {
  JSON.parse(readFileSync(0, "utf8"));
  switch (process.env.ARCHIVE_DB_TEST_OUTPUT) {
    case "success":
      process.stdout.write(
        "SUCCESS: password accepted; read-only query completed (user=postgres, database=postgres).\n",
      );
      break;
    case "auth-failure":
      process.stderr.write(
        "AUTH_FAILED: credentials rejected; verify username/password (or pooler state after rotation).\n",
      );
      process.exitCode = 2;
      break;
    case "tls-failure":
      process.stderr.write(
        "TLS_ERROR: use the trusted Supabase root certificate via -CertificatePath; password correctness is unknown.\n",
      );
      process.exitCode = 2;
      break;
    default:
      process.stderr.write("Unexpected raw diagnostic containing synthetic-test-password\n");
      process.exitCode = 2;
  }
}
