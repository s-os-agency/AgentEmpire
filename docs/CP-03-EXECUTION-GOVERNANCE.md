# CP-03 execution governance boundary

Status: repository implementation on the OUTS-80 draft branch. This document does not authorize merge, deployment, credential binding, or production cutover.

## Modes

`POST /api/agents/run` accepts `executionMode` and defaults any missing or invalid value to `inspect`.

- `inspect` — read-only preview. It resolves the agent without seeding the store, does not match or mutate tasks, does not call providers, does not create approvals, and does not write run logs.
- `internal` — permits repository-owned `native` and `manual` providers only. Composio, MCP, and webhook providers are blocked.
- `external` — permits the existing provider routing only after the server verifies `x-control-plane-approval-token` against `CONTROL_PLANE_APPROVAL_TOKEN`. Missing server configuration or a mismatched token returns HTTP 403 before dispatch.

The approval token is server-only. It must never be returned in API responses, committed to the repository, or exposed to client-side code.

## Why this boundary exists

The prior route called `routeAgentExecution` immediately, while configured webhook and MCP providers could dispatch remote calls. That contradicted the control-plane requirement that dry-run/inspection be the default and that sensitive execution remain owner-gated.

This change establishes the first enforceable CP-03 safety layer without connecting a live runtime or expanding permissions. It is deliberately narrower than full CP-03: typed command/run/approval contracts, the S-OS adapter, retries/timeouts, correlation IDs, freshness metadata, and malformed/partial-response tests remain open.

## Acceptance evidence for this increment

Repository unit tests verify that missing/invalid mode resolves to `inspect`, that `inspect` permits no provider, that `internal` permits only `native` and `manual`, and that remote providers become eligible only in `external` mode. Typecheck/build evidence must additionally prove that the API gate compiles with the server-only token check. A later adapter/API integration test must exercise HTTP 403 and zero-side-effect behavior before CP-03 is considered complete.

Production cutover remains a separate owner gate after the full CP-03 through CP-10 acceptance path is complete.


## Remote transport increment — 10 November 2026

Webhook and MCP calls now have a 20-second request/body deadline, per-call correlation and idempotency headers, no automatic retries, redacted transport/HTTP/JSON errors, and explicit accepted/unverified results. Uncertain requests stop provider fallback for that capability, so a timeout cannot silently trigger a second provider effect. The request and optional receipt identifiers are retained in the existing run message.

The remote adapter response contract is an object with receipt: { id, status, agentId, capability, correlationId }, plus optional output. Receipt IDs are bounded safe strings. The agent, capability and correlation ID must match the submitted request. Only status=completed with a successful final response counts as executed. HTTP 202 and accepted/running receipts remain accepted. Missing, malformed or mismatched receipts remain unverified. HTTP success alone never closes a task.

MCP uses tools/call with params.name=capability and params.arguments=request, checks the JSON-RPC response ID and reads a receipt from result.structuredContent or result. Upstreams with a different tool naming/receipt scheme need their actual adapter; no connected upstream or live model execution is claimed by this source change. Output is read only from the explicit output field; raw response/error bodies and authentication tokens are not returned.

This increment does not add a persistent replay ledger, completed-result polling, a production S-OS binding or production publication. Existing inspect/internal/external access rules remain unchanged. Typechecking is used for this change; no software suites are added or run.

A task whose selected capabilities are all completed or accepted remains IN_PROGRESS until final completion; unknown or failed effects remain BLOCKED. Status transitions clear obsolete completion timestamps, blocked reasons and approval flags so a previous state does not misrepresent the current result.


## Durable remote replay reservations — 10 November 2026

Webhook and MCP dispatch reserve an operation in the existing application's DATA_DIR/remote-executions before any network send. Exclusive file creation arbitrates concurrent callers on a shared POSIX directory; the reservation is synced before dispatch. Final provider results are atomically replaced and synced. Tokens, endpoints and raw request inputs are not stored in this ledger; explicit provider output can contain private work and remains in permission-restricted runtime storage.

The optional Idempotency-Key header on POST /api/agents/run scopes each selected remote capability to one intentional operation. Reuse the same key for retries. Without the header, the agent, capability and sorted input fingerprint form a deterministic retry identity, including after the matched task becomes DONE. A deliberate new operation with identical inputs requires a different explicit key. Reusing an explicit key with different inputs or a changed provider returns unverified and sends nothing.

Stored final, accepted and uncertain results are replayed with replayed=true and their original correlation ID; they never produce another network send. An interrupted reservation, partial/corrupt record or unavailable durable store also prevents dispatch and returns unverified. There is no lease-expiry takeover or automatic resend of uncertain work. Preserve reservations until an authentic upstream receipt resolves the effect. The existing inspect/internal/external permissions and owner token remain unchanged; input errors are rejected before provider work, and unexpected server errors no longer expose exception text.

Deployment must mount DATA_DIR on durable storage shared by all replicas. An ephemeral/serverless filesystem or unshared per-replica directories cannot provide cross-restart or cross-replica replay protection. This source change does not configure that storage, deploy the app, poll an upstream result or connect S-OS/model runtimes. Provider-specific receipt reconciliation and an actual supported executor binding remain outstanding. Do not remove reservations or choose a fresh key merely to bypass an unresolved effect.
