# Incident response playbooks

## Purpose

Practical response guides for outages and service faults, with bounded mitigations, clear human/agent communication and evidence of recovery. This addresses [SRV-20](https://linear.app/seifs88/issue/SRV-20/document-human-agent-collaboration). It is guidance, not an installed monitor, kill switch, backup service or proof of operational acceptance.

## When to Use

Use when a service is unavailable, slow, returning incorrect results, unable to reach a provider, or an agent is producing unexpected effects. Use the existing incident/work item; search for one before opening another. Record the affected service, environment, release, first observation and user impact.

## Core Concepts

- **Incident lead:** coordinates recovery and records decisions. The responding worker can investigate immediately within existing authority; a missing administrative field does not block useful work.
- **Responder:** gathers evidence, performs authorized mitigations and verifies their effects.
- **Communicator:** maintains one concise update thread. One person or agent may hold multiple roles; identify them in the record.
- **Severity:** prioritize active data/security harm and total outages, then degraded essential operations, then isolated faults. These are triage defaults, not owner-approved SLA targets.
- **Containment:** limits further impact. **Recovery:** restores the affected user operation. **Resolution:** records evidence, remaining risk and follow-up.
- **Observed / inferred / unknown:** label each diagnosis accordingly. A provider response or successful build alone does not demonstrate the user's outcome.

## Standard Tools and Commands

Use an already-authorized terminal on the affected host and the actual configured service URL. The commands below are read-only examples; they were not run on a production system as part of writing this guide.

```bash
# One bounded HTTP request; set incident_url to the actual approved endpoint.
# Do not put credentials or tokens in this URL.
curl --silent --show-error --max-time 10 --output /dev/null \
  --write-out 'HTTP %{http_code}; seconds %{time_total}\n' "$incident_url"

# Local process/resource inspection; redact private arguments before sharing.
date -u
uptime
df -h
ps -eo pid,comm,%cpu,%mem --sort=-%cpu
```

For a verified systemd deployment, substitute the actual service unit:

```bash
systemctl status "$incident_unit" --no-pager
journalctl -u "$incident_unit" --since "15 minutes ago" --no-pager
```

For a verified container deployment, inspect the specific container with the available runtime's status/log commands. Do not assume a unit name, container name, public URL, health route, deployment credential or stop API exists.

Repository inspection: `git rev-parse HEAD`, `git status --short`, and a scoped `git diff` identify the code and pending changes. Follow [RUNTIME.md](RUNTIME.md) for the repository runtime contract. Its deployment profile is a documented contract, not evidence of the affected host's configuration.

## Procedures and Workflows

### Common response flow

1. Capture the failing user operation, time/timezone, environment and scope. Preserve a redacted error, request/run ID and deployed release identity where available.
2. Identify an existing incident, active responder and recent changes. Keep one timeline; do not start parallel repairs to the same target.
3. Inspect the narrowest relevant service, logs and dependencies. Record what is known before selecting a mitigation.
4. Choose one reversible mitigation within existing authorization. Record the target, reason, expected observation and rollback. Obtain additional authorization only if the action actually exceeds scope.
5. Perform that action once, observe the result and stop if impact increases. Do not combine speculative fixes or blindly replay a mutating request.
6. Verify the original user operation and affected dependencies. Record the observation interval and actual results; do not substitute an arbitrary universal recovery threshold.
7. Publish an evidence-linked recovery update, retain unresolved risks and hand off an exact next action.

### A. Complete outage

- Compare the observed HTTP result with host/service status. A timeout, DNS failure, TLS failure and application error are different observations.
- If the host is reachable, inspect process state, recent logs, disk/resource pressure and the last deployed release. Preserve diagnostics before restarting.
- If one recent deployment is implicated, an authorized responder may revert to the last **verified** release using the deployment's existing rollback procedure. Record the release before and after.
- Restart only the affected service when authorized and supported by evidence. Do not use repeated restarts to hide a crash loop; inspect the first failure.
- Verify the previously failing user operation and persistence of any relevant state. If no safe rollback or deployment access exists, continue diagnosis and hand off the exact missing access/action.

### B. Degraded or faulty service

- Capture the specific operation, latency/error and affected cohort. Compare an unaffected path to distinguish global from local impact.
- Inspect recent changes and resource pressure. If a known optional component is implicated, disable or isolate it only through an existing authorized control; do not invent a feature flag.
- For wrong/stale results, trace the request to the relevant stored record and provider response. Preserve the original record; do not rewrite it to make the incident disappear.
- Verify both the faulty operation and an adjacent essential operation after mitigation. If recovery is partial, report partial recovery.

### C. External provider or connector failure

- Record provider, redacted response, timestamp and connector configuration state without exposing secrets.
- Distinguish missing configuration, expired authorization, quota/rate limiting and upstream outage. Do not rotate keys, broaden permissions or spend money without the relevant authority.
- Honor provider retry guidance. Before retrying a mutating request, determine whether the first attempt took effect using its receipt/idempotency mechanism. If outcome is unknown, reconcile first.
- Use an already-approved alternate provider only when it preserves the requested result, privacy and scope. Otherwise retain an explicit blocked/degraded result.
- Verify the end-to-end operation and its stored/external receipt. A queue entry or manual fallback is pending work, not executed work.

### D. Unexpected agent effects

- Identify the run, tool, affected records, inputs and existing authority. Preserve the audit trail.
- If authorized, pause the specific run/schedule through a verified control. If no control is available, state that limitation and escalate the exact containment action; do not claim a kill switch was used.
- Reconcile each external effect before replaying or reversing it. Preserve unrelated work and all existing history.
- Resume only within existing authority after the cause and bounded correction are understood. Keep delivery separate from demonstrated conformity.

### E. Data integrity or suspected security harm

- Prioritize containment: stop affected writes through an available authorized control and preserve redacted evidence.
- Restrict access to sensitive diagnostics. Never paste secrets or personal records into public issues.
- Establish the last known valid state and affected scope before any restore or bulk correction. Do not assume a backup is recoverable because a file exists.
- Prepare the exact restore/reversal, target records and rollback before seeking any genuinely required additional authorization.
- Verify affected records and user operations after recovery; record any unreconciled loss or uncertain exposure. Do not assert security resolution from disappearance of an error.

## Troubleshooting

| Observation | First checks | Bounded correction | Evidence of recovery |
| --- | --- | --- | --- |
| No HTTP response | DNS/TLS/network result; host and process state | Existing authorized service rollback/restart after diagnosis | Same endpoint plus original user operation succeeds; release/time recorded |
| HTTP 5xx | Request ID, server logs, recent change, dependency state | Correct/revert implicated component | Original operation succeeds with relevant stored result |
| HTTP 401/403 | Intended account, expired authorization, actual permissions | Restore only approved access through authorized owner/control | Same scoped operation succeeds; no permission expansion inferred |
| HTTP 429 | Quota and provider retry guidance | Bounded retry after safe reconciliation | Provider receipt and requested outcome |
| Slow responses | Timing, CPU/memory/disk, affected versus unaffected paths | Isolate implicated optional load through existing control | Measured before/after timings and observation window |
| “Executed” but no result | Run IDs, provider receipt, persisted/external effect | Correct status to unverified/pending while reconciling | Actual requested effect inspected; no blind replay |

## Security Notes

Use least privilege. Redact log contents and request payloads before sharing. Keep private hostnames, tokens, credentials and personal data out of public reports. Credential changes, external commitments and irreversible corrections require the authority applicable to that action; preparing them does not establish permission.

## Internal Standards

- Preserve source requests and accepted corrections. Owner instructions and current authorization govern; this guide cannot create a new approval burden.
- Keep historical claims intact and append dated evidence corrections.
- Never mark recovery solely because a process is up, a PR merged, or a check passed.
- In AgentEmpire, inspect [tool routing](../lib/tools/router.ts) and actual provider receipts when investigating task status. The router's status is a diagnostic signal, not independent acceptance evidence.
- Record delivery, verified conformity and sustained value separately. No usage evidence means sustained value is unverified.
- Use the [contribution evidence template](../.github/pull_request_template.md) to connect requirements, changes and validation.

## Communication and Handoff

```text
Incident / existing issue:
Observed at (timezone):
Affected operation / environment / release:
Impact observed:
Verified facts + evidence:
Current inference:
Unknowns:
Action taken + result + rollback:
Current status (investigating / contained / partial recovery / recovered):
Next action + responsible responder + next update time:
```

Keep updates brief, factual and in one thread. Distinguish “mitigation attempted” from “operation recovered.” A promised next update is a responder commitment, not an obligation imposed on the owner.

Recovery message: name the restored operation, evidence and observation window; state remaining limitations. If recovery cannot be verified, say so.

## Human and Agent Outcome Review

After recovery, the responder records whether the human could complete the original task, whether communication and handoff were clear, and any feedback actually received. Record agent-side evidence such as repeated attempts, failed handoffs and unresolved dependencies; do not invent agent emotions or human satisfaction.

Retain a short receipt:

```text
Requirement + source:
Delivered artifact / correction + immutable revision:
Original operation before / after + evidence:
Conformity verified / partial / unverified + reason:
Human feedback received (or not collected):
Agent workflow friction observed:
Sustained material benefit + dated evidence (or unverified):
Sustained experience/trust benefit + dated evidence (or unverified):
Residual risk / follow-up / next action / responsible responder:
```

A written guide establishes delivery only. Operational suitability requires recorded use or an authorized walkthrough; continued benefit requires observations over time.

## References

- [Original request — SRV-20](https://linear.app/seifs88/issue/SRV-20/document-human-agent-collaboration)
- [Owner-authored documentation section template](https://linear.app/seifs88/document/documentation-section-template-e46633d6b9e8)
- [Repository runtime contract](RUNTIME.md)
- [Architecture](../ARCHITECTURE.md)
- [Tool router implementation](../lib/tools/router.ts)

## Open Questions

Service inventory, actual responder contacts, approved containment controls, last verified release/backup, service-specific recovery targets and observation windows must be established from the affected environment. No values are invented here. Ownership and satisfaction remain unverified until supported by real records.
