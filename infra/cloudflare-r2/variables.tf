variable "cloudflare_api_token" {
  description = "Cloudflare API token with Workers R2 Storage Write permission."
  type        = string
  sensitive   = true
}

variable "account_id" {
  description = "Cloudflare account identifier."
  type        = string
}

variable "bucket_name" {
  description = "Globally unique R2 bucket name."
  type        = string
  default     = "archive-image"
}

variable "allowed_origins" {
  description = "Browser origins allowed to upload using a presigned PUT URL."
  type        = list(string)
  default = [
    "http://localhost:3001",
    "https://m97j-archive-core.hf.space",
  ]
}
