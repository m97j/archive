output "bucket_name" {
  value = cloudflare_r2_bucket.media.name
}

output "s3_endpoint" {
  value = "https://${var.account_id}.r2.cloudflarestorage.com"
}

output "public_base_url" {
  value = "https://${cloudflare_r2_managed_domain.media.domain}"
}

output "application_environment" {
  sensitive = true
  value = {
    R2_ACCOUNT_ID      = var.account_id
    R2_BUCKET_NAME     = cloudflare_r2_bucket.media.name
    R2_PUBLIC_BASE_URL = "https://${cloudflare_r2_managed_domain.media.domain}"
  }
}
