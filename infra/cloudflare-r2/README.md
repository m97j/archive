# Cloudflare R2 media

This Terraform module manages the public-document image bucket, its browser upload CORS rule, and
the temporary Cloudflare-managed `r2.dev` public origin. The API produces five-minute presigned PUT
URLs, so R2 write credentials stay in the private HF Space. Published Markdown stores only the
final public object URL.

The existing deployment identifiers are:

- Account ID: `a604ebdf46c7c0f3945cb5c3b833bad2` (identifier, not a credential)
- Bucket: `archive-image`
- Public base URL: `https://pub-d5bba009e2e54e8ea7cd4aff16c9eec4.r2.dev`
- S3 SDK endpoint: `https://a604ebdf46c7c0f3945cb5c3b833bad2.r2.cloudflarestorage.com`

The bucket already exists, so import it before the first apply instead of trying to recreate it:

```bash
terraform init
terraform import cloudflare_r2_bucket.media \
  'a604ebdf46c7c0f3945cb5c3b833bad2/archive-image/default'
terraform plan
```

Cloudflare Provider 5.24 uses `<account_id>/<bucket_name>/<jurisdiction>` as the bucket import ID.
The CORS and managed-domain resources do not support import; the first apply adopts the desired
configuration through Cloudflare's APIs. Review the plan before applying.

Apply with `TF_VAR_cloudflare_api_token`; do not commit a real `terraform.tfvars`. The checked-in
`r2.dev` origin is intentionally the initial public media origin. Cloudflare documents it as a
development endpoint with rate limits and without the custom-domain cache and security controls.
After buying a domain and managing its DNS zone in the same Cloudflare account, attach a subdomain
such as `media.mj.world` and replace `R2_PUBLIC_BASE_URL` in the HF Space. Vercel and HF platform
subdomains cannot serve as this custom domain because their DNS zones are not owned by this account.

Do not proxy public images through a Next.js rewrite. Readers can request the public R2 object URL
directly, which avoids consuming Vercel bandwidth. The S3 endpoint is authenticated and is not a
public image base URL; the API uses it only to sign object operations.

## No-domain alternatives

A Worker with an R2 binding can expose the private bucket at a `*.workers.dev` URL. This is a valid
alternative when the `r2.dev` non-production designation is unacceptable: the Worker can validate
requests, set response headers, transform paths, and stream `env.BUCKET.get(key).body`. Point
`R2_PUBLIC_BASE_URL` at that Worker and disable the bucket's public `r2.dev` access; the upload
ticket flow does not otherwise change.

This is not equivalent to a cached R2 custom domain. Cloudflare's Cache API has no effect on
`*.workers.dev`; it requires a custom domain or route. Every image request also invokes the Worker
and counts against the Workers plan quota. For this low-traffic public portfolio, the direct
`r2.dev` origin is the simplest initial path, while a Worker is preferable only when private-bucket
access control or response transformation is needed before a domain is purchased.

Server-side S3 `GetObject` streaming through Vercel or HF is a third option, mainly for private
media that requires application authorization. It does not consume persistent server disk, but it
adds an application hop and consumes that platform's function and data-transfer allowances. Do not
use it for intentionally public article images.

Create a separate R2 S3 API token scoped to this bucket and save its access key ID and secret as
`R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in the HF Space. This S3 credential is distinct from
the Cloudflare management API token used by Terraform.

Configure a durable remote Terraform backend before adding a GitHub Actions apply job or allowing
more than one operator to apply this module. An ephemeral Actions runner must not own the only copy
of production state. Until then, run the first apply from one controlled local environment and
back up its state securely.
