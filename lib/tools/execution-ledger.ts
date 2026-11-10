import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, link } from "node:fs/promises";
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
    message, operationId: identity, result: { correlationId: id, reconciliationRequired: true }
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
      const final = await readFinal(file, existing as unknown as Entry);
      if (final) return { ...final, operationId: identity, replayed: true };
      const saved = existing.result;
      if (!isRecord(saved) || !supportedStatuses.has(String(saved.status)) ||
          saved.provider !== provider || saved.capability !== request.capability ||
          saved.correlationId !== existing.correlationId || typeof saved.message !== "string") {
        return unknown("This operation already has a dispatch reservation. Reconcile its original request before another send.",
          existing.correlationId);
      }
      return { ...(saved as unknown as ToolResult), operationId: identity, replayed: true };
    }
    try { await handle.writeFile(JSON.stringify(entry)); await handle.sync(); }
    finally { await handle.close(); }
    await syncDirectory(directory);
  } catch {
    return unknown("A durable execution reservation could not be established. No new dispatch was sent.");
  }

  let result: ToolResult;
  try { result = { ...await dispatch({ ...request, correlationId, operationId: identity }), operationId: identity }; }
  catch { result = unknown("The reserved dispatch did not return a verified result. Reconcile its original request before another send."); }
  try { await saveResult(file, { ...entry, result }); }
  catch {
    return unknown("The dispatch result could not be persisted. Reconcile its original request before another send.");
  }
  return result;
}

type SavedOperation = Entry & { result: ToolResult | null };
const operationDirectory = () => path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "var"), "remote-executions");
const operationFile = (operationId: string) => {
  if (!/^[a-f0-9]{64}$/.test(operationId)) throw new Error("invalid_operation");
  return path.join(operationDirectory(), operationId + ".json");
};
async function readFinal(file: string, entry: Entry): Promise<ToolResult | null> {
  let raw: string;
  try { raw = await readFile(file + ".receipt.json", "utf8"); }
  catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return null;
    throw error;
  }
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || !["executed", "failed"].includes(String(value.status)) ||
      value.provider !== entry.provider || value.capability !== entry.capability ||
      value.correlationId !== entry.correlationId || typeof value.receiptId !== "string") {
    throw new Error("invalid_receipt_record");
  }
  return value as unknown as ToolResult;
}
export async function readRemoteOperation(provider: RemoteProvider, operationId: string) {
  const file = operationFile(operationId);
  const raw = await readFile(file, "utf8");
  if (raw.length > 1024 * 1024) throw new Error("invalid_operation_record");
  const entry = JSON.parse(raw) as SavedOperation;
  if (entry.version !== 1 || entry.provider !== provider || typeof entry.agentId !== "string" ||
      typeof entry.capability !== "string" || typeof entry.correlationId !== "string") {
    throw new Error("invalid_operation_record");
  }
  const result = await readFinal(file, entry) ?? entry.result;
  return { entry, result, file };
}

// Only the authenticated provider receipt route calls this function. It never
// dispatches work, changes permissions, or accepts receipts for unknown requests.
export async function acceptRemoteReceipt(provider: RemoteProvider, operationId: string, payload: unknown) {
  const { entry, result: previous, file } = await readRemoteOperation(provider, operationId);
  if (!isRecord(payload) || !isRecord(payload.receipt)) throw new Error("invalid_receipt");
  const receipt = payload.receipt;
  if (typeof receipt.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(receipt.id) ||
      receipt.agentId !== entry.agentId || receipt.capability !== entry.capability ||
      receipt.correlationId !== entry.correlationId ||
      !["completed", "failed"].includes(String(receipt.status)) ||
      (previous?.receiptId && previous.receiptId !== receipt.id)) {
    throw new Error("receipt_mismatch");
  }
  const final: ToolResult = {
    provider, operationId, capability: entry.capability as ToolResult["capability"],
    correlationId: entry.correlationId, receiptId: receipt.id,
    status: receipt.status === "completed" ? "executed" : "failed",
    message: receipt.status === "completed"
      ? "The authenticated provider returned a matching completed receipt."
      : "The authenticated provider returned a matching failed receipt.",
    result: {
      receipt: { id: receipt.id, status: receipt.status, agentId: entry.agentId,
        capability: entry.capability, correlationId: entry.correlationId },
      ...(receipt.status === "completed" ? { output: payload.output } : {})
    }
  };
  if (previous && ["executed", "failed"].includes(previous.status)) {
    // A terminal receipt cannot reverse success/failure or replace its output.
    const old = isRecord(previous.result) ? previous.result : {};
    if (previous.status !== final.status || previous.receiptId !== receipt.id ||
        JSON.stringify(old.output) !== JSON.stringify(payload.output)) throw new Error("receipt_conflict");
    return { ...previous, operationId, replayed: true };
  }
  const target = file + ".receipt.json";
  const temporary = target + "." + randomUUID() + ".tmp";
  try {
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(final)); await handle.sync(); }
    finally { await handle.close(); }
    try { await link(temporary, target); }
    catch (error) {
      if (!isExists(error)) throw error;
      const saved = await readFinal(file, entry);
      if (!saved || JSON.stringify(saved) !== JSON.stringify(final)) throw new Error("receipt_conflict");
      await syncDirectory(path.dirname(file));
      return { ...saved, operationId, replayed: true };
    }
    await syncDirectory(path.dirname(file));
  } finally { await unlink(temporary).catch(() => undefined); }
  return final;
}
