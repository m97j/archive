# ADR 0002: Direct R2 media delivery with a temporary `r2.dev` origin

- Status: Accepted
- Date: 2026-09-06

## Context

Archive needs public inline images, authenticated owner uploads, low operating cost, and no storage
credential in the browser. The owner does not yet have a custom domain. Vercel and Hugging Face
provide application hostnames, but the owner does not control the `vercel.app` or `hf.space` DNS
zones required to attach those names to an R2 bucket.

Cloudflare can expose the bucket through its managed `r2.dev` hostname without a custom domain.
Cloudflare documents that hostname as a development facility with variable rate limits. Its full
cache and security controls require a custom domain in a DNS zone managed by the same account.

## Decision

- Use `https://pub-d5bba009e2e54e8ea7cd4aff16c9eec4.r2.dev` as the initial public read base.
- Keep R2 S3 credentials only in the protected HF Space.
- Have the API issue a short-lived presigned PUT for one object; upload from the browser directly.
- Render public object URLs directly from R2, without a Vercel rewrite or image proxy.
- Manage the existing `archive-image` bucket, its CORS rule, and the enabled `r2.dev` domain through
  Terraform after importing the bucket.
- Replace the public base with a custom media subdomain after a domain is acquired and added to the
  Cloudflare account.

## Consequences

The initial deployment avoids Vercel bandwidth for media and never exposes an R2 secret. It also
accepts the official `r2.dev` rate limit and reduced production controls. Published Markdown stores
absolute public URLs, so a later origin change requires either preserving the old `r2.dev` domain
or migrating stored URLs. New uploads need only the HF `R2_PUBLIC_BASE_URL` variable changed.

The S3 endpoint is not used for anonymous rendering. Its account-level form is
`https://a604ebdf46c7c0f3945cb5c3b833bad2.r2.cloudflarestorage.com`; the SDK supplies
`archive-image` separately as the bucket.

## Alternatives retained

A small Cloudflare Worker with an R2 binding can later replace the public base with a
`*.workers.dev` URL while keeping the bucket private. It is not selected initially because it adds
another runtime and request quota, and Cloudflare's Cache API does not cache `workers.dev` traffic;
a custom domain or route is still required for that cache. It remains useful for authorization,
path policy, transformations, or custom response headers.

Vercel/HF server-side `GetObject` streaming is reserved for private media. It avoids persistent
disk writes but routes every byte through the application platform, which is unnecessary for
public article images.
