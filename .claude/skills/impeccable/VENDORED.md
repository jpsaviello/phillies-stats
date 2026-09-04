# Vendored: impeccable

This directory is a **checked-in copy** of the `impeccable` design skill, so it
works for every teammate and in every fresh container with no install step.

- **Upstream:** https://github.com/pbakaus/impeccable (Apache 2.0 — see `LICENSE`
  and `NOTICE.md`, retained here as that license requires)
- **Skill version:** 4.2.0
- **Engine version:** 0.1.0 (`scripts/VERSION`)

## Why it is vendored rather than installed

`npx impeccable install` fetches the skill bundle from a GitHub release asset
that currently **404s** (the CLI at 3.6.1 asks for `skill-v4.2.0/universal.zip`,
which is not published), so an install step in a hook or a README would fail for
everyone. A committed copy has no such dependency.

## The engine binary is NOT in this directory

`scripts/impeccable` is a launcher. On first use it downloads a ~16MB
platform-specific binary to `~/.impeccable/bin/<version>/`, verified against a
`.sha256` sidecar, from:

    https://github.com/pbakaus/impeccable/releases/download/engine-v<version>/impeccable-<os>-<arch>

That is deliberate — the binary is per-platform and far too large for git. It
means a container needs egress to `github.com` (and its release CDN) the first
time a verb runs. If a sandbox has no egress, preinstall the binary on `PATH` or
point `IMPECCABLE_BIN` at it; the launcher checks both before downloading.

Note for this repo's environment: the bundled binary and Node's `fetch` both
ignore `HTTPS_PROXY`. Node-based entry points need `NODE_USE_ENV_PROXY=1`.

## Updating

Re-copy from a fresh upstream checkout (or run `impeccable update`, which
rewrites this directory) and commit the result. Do not hand-edit these files —
local edits are lost on the next update and drift from the version above.

## Linting

`.oxlintrc.json` ignores `.claude/skills/**`; `scripts/live-browser.js` is a
bundled third-party artifact and would otherwise flood `npm run lint`.
