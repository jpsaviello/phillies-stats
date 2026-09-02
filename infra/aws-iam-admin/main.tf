data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# The user itself — separate identity from root, with full AdministratorAccess.
# IAM has no concept of "as powerful as root but not root"; AdministratorAccess
# is the closest equivalent (it still can't do a handful of root-only actions
# like closing the account or changing the support plan).
# ---------------------------------------------------------------------------

resource "aws_iam_user" "admin" {
  name = var.user_name
  path = "/"

  tags = var.tags
}

resource "aws_iam_user_policy_attachment" "admin" {
  user       = aws_iam_user.admin.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# ---------------------------------------------------------------------------
# Console access — password reset is forced on first sign-in so the
# Terraform-generated password is never actually used long-term.
# ---------------------------------------------------------------------------

resource "aws_iam_user_login_profile" "admin" {
  user                    = aws_iam_user.admin.name
  password_reset_required = true
  pgp_key                 = var.pgp_key
}

# ---------------------------------------------------------------------------
# Programmatic access (CLI / SDKs / this Terraform config going forward).
# ---------------------------------------------------------------------------

resource "aws_iam_access_key" "admin" {
  user    = aws_iam_user.admin.name
  pgp_key = var.pgp_key
}

# ---------------------------------------------------------------------------
# Require MFA for everything except the handful of actions needed to enroll
# an MFA device and manage your own password in the first place. This is
# AWS's standard "self-managed MFA" pattern. Terraform cannot enroll the MFA
# device itself (that requires an interactive QR/OTP handshake) — do that by
# hand once, per README.md, right after the first apply.
# ---------------------------------------------------------------------------

resource "aws_iam_user_policy" "require_mfa" {
  name   = "RequireMFA"
  user   = aws_iam_user.admin.name
  policy = data.aws_iam_policy_document.require_mfa.json
}

data "aws_iam_policy_document" "require_mfa" {
  # Account-wide read-only info the console's user/security-credentials
  # pages query regardless of which user is signed in.
  statement {
    sid    = "AllowViewAccountInfo"
    effect = "Allow"
    actions = [
      "iam:GetAccountPasswordPolicy",
      "iam:GetAccountSummary",
      "iam:ListVirtualMFADevices",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "AllowManageOwnPasswordAndUserInfo"
    effect = "Allow"
    actions = [
      "iam:ChangePassword",
      "iam:GetUser",
      "iam:GetLoginProfile",
    ]
    resources = ["arn:aws:iam::*:user/$${aws:username}"]
  }

  # These are read/write so the Security Credentials console page is fully
  # usable once MFA is enrolled; only the read (List*) ones are also
  # exempted from the pre-MFA deny below, so browsing works immediately but
  # creating new credentials still waits on MFA.
  statement {
    sid    = "AllowManageOwnAccessKeys"
    effect = "Allow"
    actions = [
      "iam:CreateAccessKey",
      "iam:DeleteAccessKey",
      "iam:GetAccessKeyLastUsed",
      "iam:ListAccessKeys",
      "iam:UpdateAccessKey",
    ]
    resources = ["arn:aws:iam::*:user/$${aws:username}"]
  }

  statement {
    sid    = "AllowManageOwnSigningCertificates"
    effect = "Allow"
    actions = [
      "iam:DeleteSigningCertificate",
      "iam:ListSigningCertificates",
      "iam:UpdateSigningCertificate",
      "iam:UploadSigningCertificate",
    ]
    resources = ["arn:aws:iam::*:user/$${aws:username}"]
  }

  statement {
    sid    = "AllowManageOwnSSHPublicKeys"
    effect = "Allow"
    actions = [
      "iam:DeleteSSHPublicKey",
      "iam:GetSSHPublicKey",
      "iam:ListSSHPublicKeys",
      "iam:UpdateSSHPublicKey",
      "iam:UploadSSHPublicKey",
    ]
    resources = ["arn:aws:iam::*:user/$${aws:username}"]
  }

  statement {
    sid    = "AllowManageOwnGitCredentials"
    effect = "Allow"
    actions = [
      "iam:CreateServiceSpecificCredential",
      "iam:DeleteServiceSpecificCredential",
      "iam:ListServiceSpecificCredentials",
      "iam:ResetServiceSpecificCredential",
      "iam:UpdateServiceSpecificCredential",
    ]
    resources = ["arn:aws:iam::*:user/$${aws:username}"]
  }

  statement {
    sid    = "AllowManageOwnVirtualMFADevice"
    effect = "Allow"
    actions = [
      "iam:CreateVirtualMFADevice",
      "iam:DeleteVirtualMFADevice",
    ]
    resources = ["arn:aws:iam::*:mfa/$${aws:username}"]
  }

  statement {
    sid    = "AllowManageOwnUserMFA"
    effect = "Allow"
    actions = [
      "iam:DeactivateMFADevice",
      "iam:EnableMFADevice",
      "iam:ListMFADevices",
      "iam:ResyncMFADevice",
    ]
    resources = ["arn:aws:iam::*:user/$${aws:username}"]
  }

  # Everything above is granted, but none of it applies without MFA except
  # what's listed here: enough to view your own account/credentials info,
  # change your password, and enroll MFA in the first place. Actions that
  # create/modify credentials (access keys, SSH keys, signing certs, git
  # credentials) stay blocked until an MFA session is present.
  statement {
    sid    = "DenyAllExceptListedIfNoMFA"
    effect = "Deny"
    not_actions = [
      "iam:ChangePassword",
      "iam:CreateVirtualMFADevice",
      "iam:EnableMFADevice",
      "iam:GetAccountPasswordPolicy",
      "iam:GetAccountSummary",
      "iam:GetLoginProfile",
      "iam:GetUser",
      "iam:ListAccessKeys",
      "iam:ListMFADevices",
      "iam:ListServiceSpecificCredentials",
      "iam:ListSigningCertificates",
      "iam:ListSSHPublicKeys",
      "iam:ListVirtualMFADevices",
      "iam:ResyncMFADevice",
      "sts:GetSessionToken",
    ]
    resources = ["*"]

    condition {
      test     = "BoolIfExists"
      variable = "aws:MultiFactorAuthPresent"
      values   = ["false"]
    }
  }
}
