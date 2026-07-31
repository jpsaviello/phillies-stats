# LaunchDarkly Feature Flags

This project uses LaunchDarkly for feature flag management.

## SDK context (this repo)
- SDK: React (Web) SDK (`launchdarkly-react-client-sdk`), client-side only
- Initialization: `src/main.tsx`
- Key env var: `VITE_LAUNCHDARKLY_CLIENT_SIDE_ID` (never hardcode secrets in source)

## Agent: use LaunchDarkly skills (required)

Ensure the **LaunchDarkly** agent skills below are installed (`launchdarkly@launchdarkly-ai-tooling` plugin from [github.com/launchdarkly/ai-tooling](https://github.com/launchdarkly/ai-tooling), or equivalent copies on disk). For any substantive flag work, **open that skill's `SKILL.md` and follow it** — do not improvise from generic flag advice alone.

| Skill | When to use it |
|-------|------------------|
| `launchdarkly-flag-create` | User wants a new flag, code wiring, feature toggle, or experiment setup. |
| `launchdarkly-flag-discovery` | User wants flag inventory, debt/stale-flag audit, health, or removal readiness. |
| `launchdarkly-flag-targeting` | User wants who sees a flag, rollouts, targeting rules, or environment promotion. |
| `launchdarkly-flag-cleanup` | User wants a flag removed from code safely, archive/cleanup workflows, or MCP-driven removal. |

**Invocation:** Match the user's request to the skill `description` in each skill's frontmatter, or use the editor's slash / plugin command for that skill if configured.

**Tools:** When a skill lists LaunchDarkly MCP tools as required, use MCP; do not skip validation steps.

## Conventions (summary)
- Prefer boolean flags unless multivariate is required; use descriptive kebab-case keys (e.g. `enable-checkout-v2`).
- Always pass a fallback when evaluating flags; use a meaningful evaluation context (user key, org, etc.). This app has no auth, so it currently uses a single anonymous context (`{ kind: 'user', key: 'anonymous', anonymous: true }`).
- Server-side SDK keys (`sdk-...`) stay secret. Client-side IDs may appear in browser code — this project only has a client-side SDK installed, so never write a `sdk-...` value into `VITE_LAUNCHDARKLY_CLIENT_SIDE_ID`.
- Do not evaluate flags in tight loops without caching.
- Archive or remove flag code when a flag is fully rolled out and the team agrees — use `launchdarkly-flag-cleanup` (and `launchdarkly-flag-discovery` first if assessing candidates).
- Toggling a flag in the **production** environment is a shared/external-state change — confirm with the user before doing it via MCP rather than doing it silently.
