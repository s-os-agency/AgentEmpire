import { NextResponse } from "next/server";
import { runHeartbeat } from "@/lib/heartbeat";
import { updateAgent, getAgents } from "@/lib/store";

// GET or POST: run a zero-token heartbeat.
// Call from cron, n8n, or external monitor every 15-60 minutes.
// No LLM tokens consumed. Protects wallets by surfacing anomalies only.
export async function GET() {
  return handleHeartbeat();
}

export async function POST() {
  return handleHeartbeat();
}

async function handleHeartbeat() {
  try {
    const status = await runHeartbeat();

    // Persist lastHeartbeat on agents
    const agents = await getAgents();
    for (const agent of agents) {
      if (agent.enabled) {
        await updateAgent(agent.id, { lastHeartbeat: status.timestamp } as any);
      }
    }

    return NextResponse.json({
      ok: true,
      tokensConsumed: 0,
      ...status
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Heartbeat failed", tokensConsumed: 0 },
      { status: 500 }
    );
  }
}
