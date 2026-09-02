# Setup walkthrough: zero → signed in as your new admin user

Follow this top to bottom. It assumes you have an AWS account but have never
signed in as root via the CLI and don't yet have Terraform installed.

## 0. Install the tools

```bash
brew install terraform gnupg
```

You already have the AWS CLI installed.

## 1. Sign in to the AWS Console as root

There's no CLI bootstrap for root — this part has to happen in a browser,
signed in with the email/password you used when you created the AWS account.

Go to **https://console.aws.amazon.com** → choose **Root user** → enter the
email address tied to the AWS account.

- Never set a root password, or don't remember it? Click **Forgot
  password?** on the sign-in screen — it emails you a reset link.
- Never finished account setup (no payment method / phone verification)?
  The console walks you through that first before letting you in.

## 2. Create a temporary root access key

Once signed in as root:

1. Click your **account name** (top-right) → **Security credentials**
   (sometimes labeled "My Security Credentials").
2. Scroll to **Access keys**.
3. Click **Create access key**.
4. AWS shows a warning that root access keys aren't recommended — check the
   acknowledgment box and continue. This is correct; you're only using this
   key once, to bootstrap the IAM user below, then deleting it in step 8.
5. Copy the **Access Key ID** and **Secret Access Key** now, or download the
   `.csv`. The secret is shown exactly once and can't be retrieved again.

Optional but recommended while you're already on this page: click **Assign
MFA device** and enable MFA on root too. Not required to keep moving, but
easy to knock out now rather than remembering to come back to it.

## 3. Point the CLI at those root credentials

```bash
aws configure --profile root-bootstrap
```

Prompts:
- `AWS Access Key ID` → paste from step 2
- `AWS Secret Access Key` → paste from step 2
- `Default region name` → e.g. `us-east-1`
- `Default output format` → `json`

## 4. Generate a PGP key

This encrypts the generated console password and access key secret before
Terraform ever writes them to state.

```bash
gpg --quick-generate-key "$(whoami) (aws-admin)" default default never
gpg --list-keys   # note the key ID/email you just created
gpg --export "$(whoami)" | base64 | tr -d '\n' > infra/aws-iam-admin/pubkey.b64
```

## 5. Configure and apply

```bash
cd infra/aws-iam-admin

cat > terraform.tfvars <<EOF
user_name = "your-name-here"
pgp_key   = "$(cat pubkey.b64)"
EOF

export AWS_PROFILE=root-bootstrap
terraform init
terraform plan
terraform apply
```

## 6. Retrieve and decrypt your new credentials

```bash
terraform output -raw console_password | base64 --decode | gpg --decrypt
terraform output -raw secret_access_key | base64 --decode | gpg --decrypt
terraform output access_key_id
terraform output console_login_url
```

## 7. Sign in as the new user and enroll MFA

1. Open `console_login_url`, sign in with the decrypted password, set a new
   one when prompted.
2. **IAM console → your user → Security credentials → Assign MFA device** —
   scan the QR with an authenticator app. Terraform can't do this step (it's
   an interactive QR/OTP handshake), and the attached `RequireMFA` policy
   blocks everything else on this user until you do it.

## 8. Switch everything over, and retire the root key

```bash
aws configure --profile personal-admin
# paste the access_key_id / secret_access_key from step 6
```

Use `AWS_PROFILE=personal-admin` for all future `terraform apply` runs
against this config (and everything else) instead of root.

Then, back in the Console as root: **Security credentials → Access keys →
Delete** the key you created in step 2 — it was only ever needed for this
one bootstrap apply.

## Done

You're now signed in as an MFA-protected admin IAM user, root's access key
is gone, and (if you enabled it in step 2) root has MFA too. See `README.md`
for ongoing operations — rotating the access key, state-file security notes,
and why this stays separate from root day-to-day.
