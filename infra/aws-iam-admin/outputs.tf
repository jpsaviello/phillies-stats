output "user_arn" {
  description = "ARN of the created IAM user."
  value       = aws_iam_user.admin.arn
}

output "console_login_url" {
  description = "Account-specific console sign-in URL."
  value       = "https://${data.aws_caller_identity.current.account_id}.signin.aws.amazon.com/console"
}

output "access_key_id" {
  description = "Access key ID for programmatic (CLI/SDK) access. Not secret on its own."
  value       = aws_iam_access_key.admin.id
}

output "secret_access_key" {
  description = <<-EOT
    Secret access key. If pgp_key was set, this is base64-encoded ciphertext —
    decrypt with:
      terraform output -raw secret_access_key | base64 --decode | gpg --decrypt
    If pgp_key was NOT set, this is the raw plaintext secret.
  EOT
  value       = var.pgp_key != null ? aws_iam_access_key.admin.encrypted_secret : aws_iam_access_key.admin.secret
  sensitive   = true
}

output "console_password" {
  description = <<-EOT
    Temporary console password (must be changed on first sign-in). If pgp_key was
    set, this is base64-encoded ciphertext — decrypt with:
      terraform output -raw console_password | base64 --decode | gpg --decrypt
    If pgp_key was NOT set, this is the raw plaintext password.
  EOT
  value       = var.pgp_key != null ? aws_iam_user_login_profile.admin.encrypted_password : aws_iam_user_login_profile.admin.password
  sensitive   = true
}
