# Historical Azure architecture

This directory preserves the original Bicep modules as an inert portfolio artifact. The design
provisioned:

- an App Service VNet integration subnet, delegated PostgreSQL subnet, and private-endpoint subnet;
- private DNS zones for PostgreSQL, Blob Storage, and Key Vault;
- PostgreSQL Flexible Server 17 with private networking;
- a private Blob container and storage private endpoint;
- Key Vault with RBAC, application secrets, and a private endpoint;
- Azure Container Registry with managed-identity `AcrPull` assignments;
- Linux App Service containers for frontend and backend; and
- backend IP restrictions derived from frontend outbound addresses.

These files are historical source, not a tested deployment module for the new `apps/*` monorepo.
Reactivation should begin by updating API versions, parameterizing former literal resource names,
replacing service-principal JSON with Azure OIDC, and mapping the new Web/API/Worker images.

The matching historical workflows are in `.github/workflow-archive/azure`. Keeping them outside
`.github/workflows` guarantees GitHub cannot execute them accidentally.
