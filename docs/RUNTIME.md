# Meridian / AgentEmpire runtime contract

Status: recovered execution contract for DONEAI-126 / DONEAI-47.

Canonical engineering worker: **Codex — `S-PASS-20260911-002`**. Filesystem paths, branch names, build directories, containers and `/root/...` paths are execution locations only; they are never passport identities.

## Source identity

The historical Meridian engineering work in Linear referred to the same Next.js operator-cockpit source family as **AgentEmpire**. The currently connected canonical repository is:

- Repository: `saifsoub/AgentEmpire`
- Baseline branch: `main`
- Recovery baseline: `5f8edea6563b03b3a1af43b53d3695f9a028fb89`
- Runtime: Next.js App Router + React on Node.js

Historical Codex commits referenced in Linear (`39eb715`, `96e8cca`) are not present in the connected GitHub repository, so their runtime/package contract is being reconstructed transparently on a new review branch rather than represented as already published code.

## Canonical production profile

Meridian is the private control-room UI. The canonical production profile is a hardened Linux **Node profile** (rootless container or systemd-managed Node process) behind the private service fabric.

The control boundary is:

`Meridian UI → Control API → authorization / approval / effect engine → runtime adapter → verification → event ledger`

The read boundary is:

`Meridian UI → Control API → normalized read models`

The UI must not call cloud, network, GitHub, payment, database-admin or other infrastructure-provider administration APIs directly from browser code.

For this baseline, the following are explicitly **not** canonical deployment targets:

- Cloudflare Pages;
- a Worker-backed browser executor;
- Vite static hosting.

Cloudflare may be introduced later only through a separately bounded adapter or public-surface decision.

## Node and package-manager contract

The repository declares:

- Node: `>=22 <23`
- npm: `>=10 <11`

Use the committed lockfile and a clean reproducible install:

```bash
npm ci --no-audit --no-fund
```

Equivalent repository helper:

```bash
npm run install:local
```

## Local boot

```bash
npm run boot:local
```

This starts the existing Next.js dev server on port `7483`.

Direct equivalent:

```bash
npm run dev
```

## Verification contract

Before a release candidate can be treated as runtime-ready, run:

```bash
npm run deploy:verify
```

That command executes TypeScript checking followed by the Next.js production build. It does not run a test suite. Follow the owner's no-tests instruction in `AGENTS.md` and inspect source, saved changes, and actual runtime evidence.

Production boot remains:

```bash
npm run build
npm run start
```

A release candidate is not accepted solely because the build command exits successfully. It must also prove the user and control boundaries expected by the locked Meridian contract: navigation, issue/board rendering, create/update flows, command palette, safe AI fallback, absence of direct browser-side infrastructure administration, server health, telemetry/release identity, and approval/verification behavior for mutating control commands.

## Environment and secret boundary

Repository provider credentials and connector tokens are **server-only by default**. In particular, values such as Anthropic, Groq, Composio, webhook and MCP tokens must never be exposed in client bundles.

Only variables intentionally designed as browser-safe configuration may use the `NEXT_PUBLIC_` prefix. A provider secret must never be renamed with that prefix merely to make browser code work.

The production Meridian control path must expose an explicit Control API base URL and authenticated server-side boundary. Provider unavailability must produce a deterministic degraded/fallback state rather than optimistic success.

## Private exposure

The intended owner/operator surface is private. Tailscale service identity or the approved private service fabric may publish the Node service to authorized operators. Public Funnel/admin exposure is not part of this baseline.

## Deployment boundary for this recovery branch

This recovery branch only restores a reproducible runtime/package contract and validation path. It does **not** authorize:

- production deployment;
- secret binding;
- DNS changes;
- Tailscale policy changes;
- public exposure;
- direct provider administration from the browser;
- bypassing approval policy.

Those remain separately controlled actions.