import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { ToolRequest, ToolResult } from "./providers";

type RemoteProvider = "webhook" | "mcp";
type Entry = {
  version: 1;
  fingerprint: string;
  provider: RemoteProvider;
  capability: string;
  agentId: string;
  correlationId: string;
  reservedAt: string;
  result: ToolResult | null;
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isExists = (error: unknown) => isRecord(error) && error.code === "EEXIST";
const supportedStatuses = new Set(["executed", "accepted", "failed", "unverified"]);

async function syncDirectory(directory: string) {
  const handle = await open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function saveResult(file: string, entry: Entry) {
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(entry)); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, file);
    await syncDirectory(path.dirname(file));
  } finally { await unlink(temporary).catch(() => undefined); }
}

// Reserve before dispatch. A crash, unreadable record or ambiguous result never
// grants a second send. This ledger deliberately has no timeout-based takeover.
export async function withDurableRemoteDispatch(
  provider: RemoteProvider, request: ToolRequest,
  dispatch: (correlatedRequest: ToolRequest) => Promise<ToolResult>
): Promise<ToolResult> {
  const inputs = Object.entries(request.inputs).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const fingerprint = hash(JSON.stringify([inputs, request.summary, request.sensitiveAction ?? null]));
  const identity = hash(JSON.stringify([
    request.agentId, request.capability,
    request.idempotencyKey ? ["explicit", request.idempotencyKey] : ["inputs", fingerprint]
  ]));
  const directory = path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "var"), "remote-executions");
  const file = path.join(directory, identity + ".json");
  const correlationId = request.correlationId || randomUUID();
  const unknown = (message: string, id = correlationId): ToolResult => ({
    status: "unverified", provider, capability: request.capability, correlationId: id,
    message, result: { correlationId: id, reconciliationRequired: true }
  });
  const entry: Entry = {
    version: 1, fingerprint, provider, capability: request.capability,
    agentId: request.agentId, correlationId, reservedAt: new Date().toISOString(), result: null
  };
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let handle;
    try { handle = await open(file, "wx", 0o600); }
    catch (error) {
      if (!isExists(error)) throw error;
      const raw = await readFile(file, "utf8");
      if (raw.length > 1024 * 1024) throw new Error("Invalid execution record");
      const existing: unknown = JSON.parse(raw);
      if (!isRecord(existing) || existing.version !== 1 ||
          typeof existing.correlationId !== "string" ||
          existing.agentId !== request.agentId || existing.capability !== request.capability) {
        return unknown("The existing execution record cannot be reconciled. No new dispatch was sent.");
      }
      if (existing.fingerprint !== fingerprint || existing.provider !== provider) {
        return unknown("This operation key belongs to different inputs or a different provider. No new dispatch was sent.",
          existing.correlationId);
      }
      const saved = existing.result;
      if (!isRecord(saved) || !supportedStatuses.has(String(saved.status)) ||
          saved.provider !== provider || saved.capability !== request.capability ||
          saved.correlationId !== existing.correlationId || typeof saved.message !== "string") {
        return unknown("This operation already has a dispatch reservation. Reconcile its original request before another send.",
          existing.correlationId);
      }
      return { ...(saved as unknown as ToolResult), replayed: true };
    }
    try { await handle.writeFile(JSON.stringify(entry)); await handle.sync(); }
    finally { await handle.close(); }
    await syncDirectory(directory);
  } catch {
    return unknown("A durable execution reservation could not be established. No new dispatch was sent.");
  }

  let result: ToolResult;
  try { result = await dispatch({ ...request, correlationId }); }
  catch { result = unknown("The reserved dispatch did not return a verified result. Reconcile its original request before another send."); }
  try { await saveResult(file, { ...entry, result }); }
  catch {
    return unknown("The dispatch result could not be persisted. Reconcile its original request before another send.");
  }
  return result;
}
