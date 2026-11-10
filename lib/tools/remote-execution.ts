import { randomUUID } from "node:crypto";
import type { ToolRequest, ToolResult } from "./providers";

const TIMEOUT_MS = 20_000;
const MAX_RESPONSE_CHARS = 512 * 1024;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export async function dispatchRemoteTool(
  provider: "webhook" | "mcp", endpoint: string, token: string | undefined, request: ToolRequest
): Promise<ToolResult> {
  const correlationId = request.correlationId || randomUUID();
  const receivedAt = () => new Date().toISOString();
  const unknown = (message: string): ToolResult => ({
    status: "unverified", provider, capability: request.capability, correlationId,
    message, result: { correlationId, receivedAt: receivedAt(), reconciliationRequired: true }
  });
  const arguments_ = { ...request, correlationId };
  const body = provider === "mcp"
    ? { jsonrpc: "2.0", id: correlationId, method: "tools/call",
        params: { name: request.capability, arguments: arguments_ } }
    : arguments_;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json", "x-correlation-id": correlationId,
        "idempotency-key": correlationId, ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error"
    });
    if (!response.ok) {
      return unknown("The remote request did not return a successful response. Reconcile its correlation ID before another dispatch.");
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARS) return unknown("The remote response exceeded the supported size. Completion is unverified.");
    let payload: unknown;
    try { payload = JSON.parse(text); }
    catch { return unknown("The remote response was not valid JSON. Completion is unverified."); }
    if (provider === "mcp") {
      if (!record(payload) || payload.jsonrpc !== "2.0" || payload.id !== correlationId || payload.error) {
        return unknown("The MCP response did not match the request. Completion is unverified.");
      }
      if (record(payload.result) && payload.result.isError === true) return unknown("The MCP tool returned an error. Completion is unverified.");
      payload = record(payload.result) && record(payload.result.structuredContent)
        ? payload.result.structuredContent : payload.result;
    }
    if (!record(payload) || !record(payload.receipt)) {
      return unknown("No final execution receipt was returned. HTTP success alone does not confirm completion.");
    }
    const receipt = payload.receipt;
    if (typeof receipt.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(receipt.id) ||
        receipt.agentId !== request.agentId || receipt.capability !== request.capability ||
        receipt.correlationId !== correlationId) {
      return unknown("The execution receipt did not match the agent, capability and request. Completion is unverified.");
    }
    const result = {
      receipt: { id: receipt.id, status: receipt.status, agentId: receipt.agentId,
        capability: receipt.capability, correlationId },
      receivedAt: receivedAt()
    };
    if (response.status === 202 || receipt.status === "accepted" || receipt.status === "running") {
      return { status: "accepted", provider, capability: request.capability, correlationId, receiptId: receipt.id,
        message: "The remote request was accepted; execution is not yet complete.", result };
    }
    if (receipt.status === "completed") {
      return { status: "executed", provider, capability: request.capability, correlationId, receiptId: receipt.id,
        message: "The remote provider returned a matching completed receipt.",
        result: { ...result, output: payload.output } };
    }
    if (receipt.status === "failed") {
      return { status: "failed", provider, capability: request.capability, correlationId, receiptId: receipt.id,
        message: "The remote provider returned a matching failed receipt.", result };
    }
    return unknown("The execution receipt has an unsupported state. Completion is unverified.");
  } catch {
    return unknown("The remote request timed out or its transport failed. Reconcile its correlation ID before another dispatch.");
  }
}
