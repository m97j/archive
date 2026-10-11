# Historical Azure GitHub Actions

`infra.yml` and `deploy.yml` are preserved snapshots of the original automated Azure provisioning
and container delivery pipeline. GitHub only discovers workflow files located directly under
`.github/workflows`, so files in this directory are documentation and cannot run accidentally.

The snapshots demonstrate ordered Bicep deployment, secret-backed Azure login, ACR image builds,
App Service updates, and backend access restriction based on frontend outbound IPs. They still
reference the former `frontend/` and `backend/` trees and literal Azure resource names; simply
moving them back would therefore be unsafe. Follow `infra/legacy/azure/README.md` before any
reactivation.
