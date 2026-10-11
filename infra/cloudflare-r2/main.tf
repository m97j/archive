resource "cloudflare_r2_bucket" "media" {
  account_id    = var.account_id
  name          = var.bucket_name
  location      = "apac"
  storage_class = "Standard"
}

resource "cloudflare_r2_bucket_cors" "media" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.media.name
  rules = [{
    id = "archive-browser-upload"
    allowed = {
      methods = ["GET", "HEAD", "PUT"]
      origins = var.allowed_origins
      headers = ["content-type"]
    }
    expose_headers  = ["etag"]
    max_age_seconds = 3600
  }]
}

# Keep the temporary public read origin in state until a custom media domain is available.
# Cloudflare documents r2.dev as a development/non-production endpoint, so the application
# consumes it through R2_PUBLIC_BASE_URL and can later change origins without changing upload code.
resource "cloudflare_r2_managed_domain" "media" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.media.name
  enabled     = true
}
