import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { routeAgentExecution } from "@/lib/tools/router";
import { resolveExecutionMode } from "@/lib/tools/execution-policy";

function approvalTokenMatches(request: Request) {
  const expected = process.env.CONTROL_PLANE_APPROVAL_TOKEN;
  const provided = request.headers.get("x-control-plane-approval-token");
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "A JSON request body is required." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "The request body must be an object." }, { status: 400 });
  }
  const value = body as Record<string, unknown>;
  const inputs = value.inputs ?? {};
  const key = request.headers.get("idempotency-key") ?? undefined;
  if ((value.agentId !== undefined && (typeof value.agentId !== "string" || !value.agentId)) ||
      !inputs || typeof inputs !== "object" || Array.isArray(inputs) ||
      Object.values(inputs).some(input => typeof input !== "string") ||
      (key !== undefined && !/^[A-Za-z0-9._:-]{1,128}$/.test(key))) {
    return NextResponse.json({ ok: false, error: "Agent, inputs or operation key has an invalid format." }, { status: 400 });
  }
  const executionMode = resolveExecutionMode(value.executionMode);
  if (executionMode === "external" && !approvalTokenMatches(request)) {
    return NextResponse.json({
      ok: false, error: "External execution requires a valid owner approval token.", executionMode
    }, { status: 403 });
  }
  try {
    const result = await routeAgentExecution(
      typeof value.agentId === "string" ? value.agentId : "general-operator",
      inputs as Record<string, string>, { executionMode, idempotencyKey: key }
    );
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({
      ok: false, error: "Agent execution could not be completed. Reconcile existing request records before retrying."
    }, { status: 500 });
  }
}
