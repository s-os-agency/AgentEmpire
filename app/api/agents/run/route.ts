import { NextResponse } from "next/server";
import { routeAgentExecution } from "@/lib/tools/router";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const agentId = body.agentId || "content-strategist";
    const inputs = body.inputs || {};

    if (inputs.mode === "demo" || inputs.mode === "dry-run") {
      return NextResponse.json({ ok: true, mode: inputs.mode, executed: false, executions: [],
        message: "Preview only. No actions were executed." });
    }
    const result = await routeAgentExecution(agentId, inputs);

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown agent execution error"
    }, { status: 500 });
  }
}
