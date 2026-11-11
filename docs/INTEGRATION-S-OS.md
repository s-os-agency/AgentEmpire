# Integrating AgentEmpire with S-OS

This doc describes the **target** wiring between the cockpit and the kernel. Empire runs standalone today; use this when you are ready for governed execution.

---

## Prerequisites

1. [n8n](https://github.com/saifsoub/n8n) stack running
2. [S-OS](https://github.com/saifsoub/S-OS) workflows imported and their configured endpoints verified through permitted source and operational evidence, without running test suites
3. Operator key generated (`S_AGENTOS_OPERATOR_KEY`)

---

## Environment (AgentEmpire)

Add to `.env.local` (never commit):

```bash
S_AGENTOS_WEBHOOK_URL=https://YOUR_DOMAIN/webhook/s-agentos-command
S_AGENTOS_OPERATOR_KEY=<openssl rand -base64 32>
S_AGENTOS_DEFAULT_RUN_MODE=dry_run
```

---

## Command envelope (minimal)

```json
{
  "action": "execute_task",
  "objective": "Refresh weekly briefing from Monday pipeline",
  "requested_by": "agentempire",
  "run_mode": "dry_run",
  "approval_status": "not_required",
  "context": {
    "source": "agentempire",
    "agent_id": "general-operator"
  }
}
```

Headers:

```http
Content-Type: application/json
X-AgentOS-Key: <S_AGENTOS_OPERATOR_KEY>
```

---

## Graduation path

| Stage | `run_mode` | `approval_status` | Effect |
|-------|------------|-------------------|--------|
| Dev | `dry_run` | `not_required` | Logged, no external side effects |
| Review | `draft` | `pending` | Plan only |
| Production | `live` | `approved` | Downstream n8n + integrations execute |

Sensitive Empire tools (`email.draft`, calendar, publish) should stay **`dry_run`** until operator approves in UI, then send `live` + `approved` to S-OS.

---

## Suggested implementation hook

Add a server route (e.g. `app/api/agentos/route.ts`) that:

1. Validates operator session (when auth exists)
2. Builds envelope from form/agent context
3. `fetch(S_AGENTOS_WEBHOOK_URL, { method: 'POST', headers, body })`
4. Returns kernel response to UI

Reference schema: `S-OS/schemas/command.schema.json`  
OpenAPI: `S-OS/openapi/s-agentos-kernel-v0.2.0.openapi.yaml`

---

## Human-only (unchanged)

- Placing phone calls
- **Sending** emails
- Signing contracts

Empire may draft; kernel + operator approve; n8n executes.
