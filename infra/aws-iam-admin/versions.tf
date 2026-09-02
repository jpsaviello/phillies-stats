terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Uses your default AWS CLI credentials/profile (or the AWS_PROFILE / AWS_ACCESS_KEY_ID
# env vars). The very first apply has to run under your ROOT account's credentials (or
# an existing admin principal) since nothing else exists yet to create this user with.
# Once it's created, switch to it (rotate root credentials away, per README.md) for
# everything after, including future changes to this config.
provider "aws" {}
