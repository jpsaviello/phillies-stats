variable "user_name" {
  description = "IAM user name for the personal admin/super user account."
  type        = string
  default     = "admin"
}

variable "tags" {
  description = "Tags applied to the IAM user."
  type        = map(string)
  default = {
    ManagedBy = "terraform"
    Purpose   = "personal-admin-user"
  }
}

variable "pgp_key" {
  description = <<-EOT
    Optional base64-encoded PGP public key (or "keybase:username") used to encrypt
    the generated console password and access key secret before they're written to
    Terraform state and outputs.

    Strongly recommended. Without it, both secrets are stored in PLAINTEXT in the
    Terraform state file (terraform.tfstate). See README.md for setup and decrypt
    instructions.
  EOT
  type        = string
  default     = null
}
