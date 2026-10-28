// Zero-token heartbeats: pure Node logic, no model calls.
// Keeps bots alive by updating lastSeen, monitors wallets for anomalies,
// and surfaces only actionable issues for human review.

import { getAgents, getWallets, getWalletTransactions, getApprovals } from "./store";
import type { StoredAgent, WalletTransaction } from "./types";

export interface HeartbeatStatus {
  timestamp: string;
  agentsAlive: number;
  agentsChecked: number;
  staleAgents: Array<{ id: string; name: string; lastHeartbeat?: string }>;
  walletAlerts: Array<{ walletId: string; agentName: string; reason: string; severity: "LOW" | "MEDIUM" | "HIGH" }>;
  pendingApprovals: number;
  message: string;
}

const STALE_THRESHOLD_MS = 1000 * 60 * 60 * 6; // 6 hours without heartbeat = stale
const HIGH_SPEND_THRESHOLD = 1000; // currency units

export async function runHeartbeat(): Promise<HeartbeatStatus> {
  const now = new Date().toISOString();
  const nowMs = Date.now();

  const agents = await getAgents();
  const wallets = await getWallets();
  const transactions = await getWalletTransactions();
  const approvals = await getApprovals();

  const enabledAgents = agents.filter(a => a.enabled);
  const staleAgents: HeartbeatStatus["staleAgents"] = [];
  const walletAlerts: HeartbeatStatus["walletAlerts"] = [];

  for (const agent of enabledAgents) {
    const last = (agent as any).lastHeartbeat ? new Date((agent as any).lastHeartbeat).getTime() : 0;
    if (last && nowMs - last > STALE_THRESHOLD_MS) {
      staleAgents.push({ id: agent.id, name: agent.name, lastHeartbeat: (agent as any).lastHeartbeat });
    }
  }

  // Protect belongings: scan wallets for anomalies
  for (const wallet of wallets) {
    if (wallet.status === "FROZEN") continue;

    const pendingHigh = transactions.filter(
      t => t.walletId === wallet.id && t.status === "PENDING_APPROVAL" && isHighRisk(t)
    );
    if (pendingHigh.length > 0) {
      walletAlerts.push({
        walletId: wallet.id,
        agentName: wallet.agentName,
        reason: `${pendingHigh.length} high-value or agent-initiated spend(s) awaiting approval`,
        severity: "HIGH"
      });
    }

    const pendingOutflows = transactions.filter(
      t => t.walletId === wallet.id && t.status === "PENDING_APPROVAL" && ["WITHDRAWAL", "AGENT_SPEND", "TRANSFER"].includes(t.type)
    );
    if (pendingOutflows.length > 3) {
      walletAlerts.push({
        walletId: wallet.id,
        agentName: wallet.agentName,
        reason: `${pendingOutflows.length} pending outflows — review for possible automation drift`,
        severity: "MEDIUM"
      });
    }
  }

  const pendingApprovals = approvals.filter(a => a.status === "PENDING").length;

  const message =
    staleAgents.length === 0 && walletAlerts.length === 0 && pendingApprovals === 0
      ? "All systems nominal. Agents alive, belongings protected."
      : `Attention: ${staleAgents.length} stale agent(s), ${walletAlerts.length} wallet alert(s), ${pendingApprovals} pending approval(s).`;

  return {
    timestamp: now,
    agentsAlive: enabledAgents.length,
    agentsChecked: enabledAgents.length,
    staleAgents,
    walletAlerts,
    pendingApprovals,
    message
  };
}

function isHighRisk(tx: WalletTransaction): boolean {
  return tx.amount >= HIGH_SPEND_THRESHOLD || tx.requestedBy === "agent";
}
