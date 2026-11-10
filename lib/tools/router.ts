import { randomUUID } from "node:crypto";
import { getAgent, getDb, logAgentRun, createApproval, findMatchingActiveTask, closeMatchedTask } from "@/lib/store";
import { getAgentDefinition } from "@/lib/agents/definitions";
import type { AgentCapability, ToolProviderName } from "@/lib/agents/definitions";
import { getProviders, type ToolResult } from "@/lib/tools/providers";
import { executionModeDescription, providerAllowed, type ExecutionMode } from "@/lib/tools/execution-policy";

const toCapability = (value: string) => value as AgentCapability;
const toProvider = (value: string) => value as ToolProviderName;
const isSensitiveCapability = (capability: string) => ["email.draft", "calendar.create"].includes(capability);

async function getAgentForInspection(agentId: string) {
  const db = await getDb();
  if (db.agents?.length) return db.agents.find(agent => agent.id === agentId) ?? db.agents[0];
  return getAgentDefinition(agentId);
}

export async function routeAgentExecution(
  agentId: string,
  inputs: Record<string, string>,
  options: { executionMode?: ExecutionMode; idempotencyKey?: string } = {}
) {
  const executionMode = options.executionMode ?? "inspect";
  const agent = executionMode === "inspect" ? await getAgentForInspection(agentId) : await getAgent(agentId);
  const providers = getProviders();

  if (executionMode === "inspect") {
    const executions = agent.selectedTools.map(selectedTool => ({
      status: "preview" as const,
      provider: toProvider(agent.preferredProviders[0] || "manual"),
      capability: toCapability(selectedTool),
      message: `Preview only: ${selectedTool} was not executed.`
    }));

    return {
      agent,
      executionMode,
      executionPolicy: executionModeDescription(executionMode),
      executedAt: new Date().toISOString(),
      matchedTaskId: undefined,
      createdRunIds: [],
      createdApprovalIds: [],
      providersChecked: providers.map(p => ({ name: p.name, configured: p.isConfigured(), capabilities: p.capabilities() })),
      executions,
      summary: {
        preview: executions.length,
        accepted: 0,
        unverified: 0,
        executed: 0,
        approvals: 0,
        manual: 0,
        failed: 0
      }
    };
  }

  const executions: ToolResult[] = [];
  const createdRunIds: string[] = [];
  const createdApprovalIds: string[] = [];
  const matchedTask = await findMatchingActiveTask(inputs.objective || "");

  for (const selectedTool of agent.selectedTools) {
    const capability = toCapability(selectedTool);
    let executed = false;

    for (const preferredProvider of agent.preferredProviders) {
      const providerName = toProvider(preferredProvider);
      if (!providerAllowed(providerName, executionMode)) continue;

      const provider = providers.find(p => p.name === providerName);
      if (!provider) continue;
      if (!provider.capabilities().includes(capability)) continue;

      const result = await provider.execute({
        correlationId: randomUUID(),
        idempotencyKey: options.idempotencyKey,
        capability,
        agentId,
        inputs,
        summary: inputs.objective || `${agent.name} internal operation`,
        sensitiveAction: isSensitiveCapability(capability) ? "external_send" : undefined
      });

      executions.push(result);

      const run = await logAgentRun({
        agentId,
        objective: inputs.objective || "",
        provider: result.provider,
        capability: result.capability,
        status: result.status,
        message: result.operationId ? (result.message + " [Operation " + result.operationId + "; Request " + result.correlationId + (result.receiptId ? "; Receipt " + result.receiptId : "") + "]") : result.correlationId ? `${result.message} [Request ${result.correlationId}${result.receiptId ? "; Receipt " + result.receiptId : ""}]` : result.message,
        createdTasks: matchedTask ? [matchedTask.id] : undefined
      });
      createdRunIds.push(run.id);

      if (result.status === "needs_approval") {
        const approval = await createApproval({
          source: agentId,
          action: result.capability,
          provider: result.provider,
          payload: { inputs, result: result.result },
          riskLevel: isSensitiveCapability(result.capability) ? "HIGH" : "MEDIUM"
        });
        createdApprovalIds.push(approval.id);
      }

      if (["executed", "needs_approval", "queued_manual", "accepted", "unverified", "failed"].includes(result.status)) {
        executed = true;
        break;
      }
    }

    if (!executed) {
      const fallback: ToolResult = {
        status: "queued_manual",
        provider: "manual",
        capability,
        message: executionMode === "internal"
          ? `No permitted internal provider executed ${capability}. Remote providers remain blocked in internal mode.`
          : `No configured provider executed ${capability}. The action remains available for manual/provider follow-up.`
      };
      executions.push(fallback);
      const run = await logAgentRun({ agentId, objective: inputs.objective || "", provider: fallback.provider, capability: fallback.capability, status: fallback.status, message: fallback.message });
      createdRunIds.push(run.id);
    }
  }

  // Complete the matched task only after every selected capability has finished.
  // A successful first step must not hide an unfinished manual, failed or approval step.
  if (matchedTask) {
    const allCompleted = agent.selectedTools.length > 0 && agent.selectedTools.every(capability =>
      executions.some(result => result.capability === capability && result.status === "executed")
    );
    if (allCompleted) {
      await closeMatchedTask(matchedTask.id, "DONE");
    } else if (executions.some(result => result.status === "needs_approval")) {
      await closeMatchedTask(matchedTask.id, "WAITING_APPROVAL");
    } else if (agent.selectedTools.length > 0 && agent.selectedTools.every(capability =>
      executions.some(result => result.capability === capability && ["executed", "accepted"].includes(result.status))
    )) {
      await closeMatchedTask(matchedTask.id, "IN_PROGRESS");
    } else {
      await closeMatchedTask(matchedTask.id, "BLOCKED", "Execution is incomplete. One or more selected capabilities did not complete.");
    }
  }

  return {
    agent,
    executionMode,
    executionPolicy: executionModeDescription(executionMode),
    executedAt: new Date().toISOString(),
    matchedTaskId: matchedTask?.id,
    createdRunIds,
    createdApprovalIds,
    providersChecked: providers.map(p => ({ name: p.name, configured: p.isConfigured(), capabilities: p.capabilities() })),
    executions,
    summary: {
      preview: 0,
      accepted: executions.filter(r => r.status === "accepted").length,
      unverified: executions.filter(r => r.status === "unverified").length,
      executed: executions.filter(r => r.status === "executed").length,
      approvals: executions.filter(r => r.status === "needs_approval").length,
      manual: executions.filter(r => r.status === "queued_manual").length,
      failed: executions.filter(r => r.status === "failed").length
    }
  };
}
