import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { acceptRemoteReceipt, readRemoteOperation } from "@/lib/tools/execution-ledger";

export const runtime = "nodejs";
type Context = { params: Promise<{ provider: string; operationId: string }> };
function matches(provided: string | null, expected: string | undefined) {
  if (!provided || !expected) return false;
  return timingSafeEqual(createHash("sha256").update(provided).digest(), createHash("sha256").update(expected).digest());
}
async function target(context: Context) {
  const value = await context.params;
  if (!["webhook", "mcp"].includes(value.provider) || !/^[a-f0-9]{64}$/.test(value.operationId)) return null;
  return { ...value, provider: value.provider as "webhook" | "mcp" };
}
export async function GET(request: Request, context: Context) {
  if (!matches(request.headers.get("x-control-plane-approval-token"), process.env.CONTROL_PLANE_APPROVAL_TOKEN)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const value = await target(context);
  if (!value) return NextResponse.json({ ok: false, error: "Invalid operation." }, { status: 400 });
  try {
    const { entry, result } = await readRemoteOperation(value.provider, value.operationId);
    return NextResponse.json({
      ok: true, operationId: value.operationId, provider: entry.provider,
      agentId: entry.agentId, capability: entry.capability, correlationId: entry.correlationId,
      reservedAt: entry.reservedAt, status: result?.status ?? "unverified",
      receiptId: result?.receiptId, reconciliationRequired: !result || ["accepted", "unverified"].includes(result.status)
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Operation unavailable." }, { status: 404 });
  }
}
export async function POST(request: Request, context: Context) {
  const value = await target(context);
  if (!value) return NextResponse.json({ ok: false, error: "Invalid operation." }, { status: 400 });
  const token = value.provider === "webhook" ? process.env.WEBHOOK_ROUTER_TOKEN : process.env.MCP_AUTH_TOKEN;
  const authorization = request.headers.get("authorization");
  if (!matches(authorization?.startsWith("Bearer ") ? authorization.slice(7) : null, token)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ ok: false, error: "A receipt body is required." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 512 * 1024) {
        await reader.cancel();
        return NextResponse.json({ ok: false, error: "Receipt too large." }, { status: 413 });
      }
      chunks.push(chunk.value);
    }
    const payload: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = await acceptRemoteReceipt(value.provider, value.operationId, payload);
    return NextResponse.json({ ok: true, operationId: value.operationId, status: result.status,
      receiptId: result.receiptId, correlationId: result.correlationId, replayed: result.replayed ?? false },
      { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Receipt could not be reconciled with the original operation." }, { status: 409 });
  } finally { reader.releaseLock(); }
}
