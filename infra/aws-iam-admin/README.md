# Personal AWS admin user

Creates one IAM user with `AdministratorAccess`, a console password, and an
access key — a day-to-day identity separate from the AWS root account, which
you should stop using for anything after this.

Not part of the phillies-stats app or its deploy pipeline — this is one-off
AWS account bootstrapping, kept in its own directory/state on purpose.

## Why not use root day-to-day?

Root can't be permission-scoped, its credentials can't be restricted or
easily rotated per-use, and losing them is a much bigger incident than
losing an IAM user's. AWS's own guidance is to lock root away (enable MFA on
it too, store the password somewhere safe) and do everything else as an IAM
identity. `AdministratorAccess` is as close to root as an IAM user gets — it
just can't do a handful of root-only things (closing the account, changing
the support plan, a few billing settings).

## First-time setup

See **[SETUP.md](./SETUP.md)** for the full walkthrough — installing
Terraform/GPG, signing in as root for the first time, creating a temporary
root access key, generating a PGP key, applying, decrypting the outputs,
enrolling MFA, and retiring the root key afterward.

## State is sensitive — treat it accordingly

Even PGP-encrypted, this state file is worth protecting like a credential
store: it names the user, its ARN, and (encrypted) secrets. Don't commit
`terraform.tfstate*` or `terraform.tfvars` — both are gitignored at the repo
root. For anything beyond solo/local use, move to a remote backend with
encryption at rest (S3 + SSE + a DynamoDB lock table, or Terraform
Cloud/HCP) rather than relying on local state.

If you ever skip `pgp_key`, the password and access key secret are stored
in **plaintext** in `terraform.tfstate`. Only do that if you understand and
accept that, and delete/rotate immediately after retrieving the values.

## Rotating the access key

```bash
terraform taint aws_iam_access_key.admin
terraform apply
```

This invalidates the old key and issues a new one in the same operation.
