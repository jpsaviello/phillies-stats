# LaunchDarkly Setup

This project uses [LaunchDarkly](https://launchdarkly.com) for feature flag management.

## SDK Details

- **SDK**: React (Web) SDK (`launchdarkly-react-client-sdk`)
- **SDK Type**: client-side (evaluated in the browser)
- **Key Type**: Client-side ID
- **Installed via**: `npm install launchdarkly-react-client-sdk`
- **Initialization file**: `src/main.tsx`

Only the frontend is integrated. The `server/` Hono backend does not use LaunchDarkly — this pass was scoped to client-side only.

## Configuration

The client-side ID is configured via the `VITE_LAUNCHDARKLY_CLIENT_SIDE_ID` environment variable, read at build time (`import.meta.env.VITE_LAUNCHDARKLY_CLIENT_SIDE_ID` in `src/main.tsx`).

A LaunchDarkly **client-side ID is not a secret** — it's designed to ship inside the public JS bundle, unlike this repo's `ODDS_API_KEY` / `ANTHROPIC_API_KEY`, which are real secrets read at runtime by the backend. That's why it's handled differently here: baked into the bundle at build time in every deploy target, no k8s Secret, no `optional: true` runtime wiring.

**Do not hardcode** the client-side ID directly in source — always read it via the env var.

| Environment | Where the value lives | How it gets there |
|---|---|---|
| Local dev (`npm run dev`) | `.env.local` (repo root, already gitignored via `.env*`) | Vite auto-loads `.env.local` |
| Local k8s cluster (`pipeline.sh`) | `.env.local` (repo root) | `pipeline.sh` reads it and passes `--build-arg VITE_LAUNCHDARKLY_CLIENT_SIDE_ID=...` to `docker build`; `Dockerfile`'s build stage declares `ARG`/`ENV` for it before `RUN npm run build` |
| Vercel (production, tracks `develop`) | Vercel dashboard → Project Settings → Environment Variables | Vercel injects dashboard env vars into `process.env` during its build, and Vite auto-inlines any `VITE_`-prefixed one — **you still need to add this var in the Vercel dashboard yourself**, it was not set as part of this onboarding session |

Currently using the **Production** LaunchDarkly environment's client-side ID (`6a6bb40190fd280b9e23959c`) in all three places above, by explicit choice during onboarding — there's no separate "staging" split for the frontend yet.

## Where to Find Things

| What | Where |
|------|-------|
| Feature flags dashboard | https://app.launchdarkly.com/projects/default/flags |
| Project settings | https://app.launchdarkly.com/settings/projects/default |
| Environments (SDK keys / client-side IDs) | https://app.launchdarkly.com/projects/default/settings/environments |
| API access tokens | https://app.launchdarkly.com/settings/authorization |
| SDK documentation | https://launchdarkly.com/docs/sdk/client-side/react/react-web |
| LaunchDarkly docs | https://launchdarkly.com/docs |

Project key: **`default`** (the only project in this account, named "John's Account"). Environments: `test` and `production`.

## How Feature Flags Work in This Project

1. `src/main.tsx` wraps the whole app in an `LDProvider`, built via `asyncWithLDProvider` so the tree only mounts once the client is ready (avoids a flash of the wrong flag state). The evaluation context is an anonymous user (`{ kind: 'user', key: 'anonymous', anonymous: true }`) — this app has no login, so every visitor evaluates the same way.
2. Any component under `<App />` can call `useFlags()` from `launchdarkly-react-client-sdk` to read current flag values.
3. **Flag keys are camelCased automatically.** The React SDK's `useFlags()` transforms kebab-case keys from the dashboard into camelCase in code — a flag created as `my-first-flag` is read as `myFirstFlag`. This project does not override that behavior (`reactOptions.useCamelCaseFlagKeys` is left at its default `true`).
4. Changes made in the dashboard reach the browser via a streaming connection (`clientstream.launchdarkly.com`) — no redeploy needed, though a very old open tab may need a refresh to pick up context/provider-level changes.

### Example: Evaluating a Flag

```tsx
import { useFlags } from 'launchdarkly-react-client-sdk'

function MyComponent() {
  const { myFirstFlag } = useFlags() // dashboard key: "my-first-flag"

  if (!myFirstFlag) return null

  return <div>Feature is on!</div>
}
```

See `src/components/LaunchDarklyDemoBanner.tsx` for a real, working example wired up during onboarding — it's mounted in `src/App.tsx` right after `<Header />` and is safe to delete once you no longer need it as a reference.

## The First Flag

- **Key**: `my-first-flag` ("My First Flag") — boolean, marked temporary, currently **OFF** by default in both environments.
- Gates the banner in `src/components/LaunchDarklyDemoBanner.tsx`.
- Toggle it here: https://app.launchdarkly.com/projects/default/flags/my-first-flag

## Next Steps

### Feature Flag Best Practices
- **Use flags for every new feature**: Wrap new features in flags so you can release and roll back independently of deployments.
- **Clean up temporary flags**: `my-first-flag` was created as temporary — archive it once you're done using it as a reference (or turn it into a real flag).
- **Use descriptive flag keys**: e.g., `enable-checkout-v2` instead of `flag-1`.
- **Watch out for the credential type mix-up**: this project only ever wants a **client-side ID** for `VITE_LAUNCHDARKLY_CLIENT_SIDE_ID` — never a value starting with `sdk-` (that's a server-side SDK key, and this frontend has no server-side SDK installed).

### Advanced Capabilities
- **[Percentage Rollouts](https://launchdarkly.com/docs/home/targeting-flags/rollouts)** — Gradually roll out features to a percentage of users.
- **[Targeting Rules](https://launchdarkly.com/docs/home/targeting-flags/targeting-rules)** — Target specific users, segments, or contexts.
- **[Experimentation](https://launchdarkly.com/docs/home/about-experimentation)** — Run A/B tests and measure the impact of flag variations.
- **[configs](https://launchdarkly.com/docs/home/ai-configs)** — Manage AI model configurations and prompts with feature flags.
- **[Guarded Rollouts](https://launchdarkly.com/docs/home/guarded-rollouts)** — Automatically roll back flag changes based on metric guardrails.
- **[Observability](https://launchdarkly.com/docs/home/observability)** — Monitor flag evaluations and SDK performance with built-in telemetry.

### Agent Integration (MCP Server)

The hosted LaunchDarkly MCP server is already configured in this repo (`.mcp.json`, OAuth-based, no stored tokens) and was used throughout this onboarding session — to fetch the correct client-side ID, create `my-first-flag`, and check project/environment info. With it, an agent can:

- **Create and manage flags** — create a new feature flag, and it handles the API calls.
- **Toggle flags on/off** — turn features on or off across environments without leaving the editor (note: toggling flags in **production** may require explicit confirmation depending on your agent's safety settings — that happened during this session and the user toggled `my-first-flag` on manually instead).
- **Set up targeting rules** — configure percentage rollouts, user targeting, and segment-based rules through natural language.
- **Clean up stale flags** — find temporary flags that are fully rolled out and ready to archive.

This repo also has the companion flag-management skills installed (`launchdarkly-flag-create`, `launchdarkly-flag-discovery`, `launchdarkly-flag-targeting`, `launchdarkly-flag-cleanup` from [github.com/launchdarkly/ai-tooling](https://github.com/launchdarkly/ai-tooling)) — use those for day-to-day flag work going forward.

### Useful CLI Commands

If you have `ldcli` installed:

| Command | Description |
|---------|-------------|
| `ldcli flags list --project default` | List all feature flags |
| `ldcli flags toggle-on --project default --environment production --flag my-first-flag` | Turn a flag on |
| `ldcli flags create --project default --data '{"name": "My Flag", "key": "my-flag", "kind": "boolean"}'` | Create a new flag |
| `ldcli environments list --project default` | List environments and SDK keys |
