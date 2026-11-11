import { getAgent, logAgentRun, createApproval, findMatchingActiveTask, closeMatchedTask } from "@/lib/store";
import type { AgentCapability, ToolProviderName } from "@/lib/agents/definitions";
import { getProviders, type ToolResult } from "@/lib/tools/providers";

const toCapability = (value: string) => value as AgentCapability;
const toProvider = (value: string) => value as ToolProviderName;
const isSensitiveCapability = (capability: string) => ["email.draft", "calendar.create"].includes(capability);

export async function routeAgentExecution(agentId: string, inputs: Record<string, string>) {
  const agent = await getAgent(agentId);
  const providers = getProviders();
  const executions: ToolResult[] = [];
  const createdRunIds: string[] = [];
  const createdApprovalIds: string[] = [];
  const outcomes: ToolResult[] = [];
  const matchedTask = await findMatchingActiveTask(inputs.objective || "");

  for (const selectedTool of agent.selectedTools) {
    const capability = toCapability(selectedTool);
    let executed = false;

    for (const preferredProvider of agent.preferredProviders) {
      const providerName = toProvider(preferredProvider);
      const provider = providers.find(p => p.name === providerName);
      if (!provider) continue;
      if (!provider.capabilities().includes(capability)) continue;

      const result = await provider.execute({
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
        message: result.message,
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

      if (["executed", "needs_approval", "queued_manual"].includes(result.status)) {
        outcomes.push(result);
        executed = true;
        break;
      }
    }

    if (!executed) {
      const fallback: ToolResult = {
        status: "queued_manual",
        provider: "manual",
        capability,
        message: `No configured provider executed ${capability}. The action remains available for manual/provider follow-up.`
      };
      executions.push(fallback);
      outcomes.push(fallback);
      const run = await logAgentRun({ agentId, objective: inputs.objective || "", provider: fallback.provider, capability: fallback.capability, status: fallback.status, message: fallback.message });
      createdRunIds.push(run.id);

    }
  }

  if (matchedTask && outcomes.length > 0) {
    const incomplete = outcomes.find(result => ["failed", "missing_connector", "queued_manual"].includes(result.status));
    if (incomplete) {
      await closeMatchedTask(matchedTask.id, "BLOCKED", incomplete.message);
    } else if (outcomes.some(result => result.status === "needs_approval")) {
      await closeMatchedTask(matchedTask.id, "WAITING_APPROVAL");
    } else if (outcomes.every(result => result.status === "executed")) {
      await closeMatchedTask(matchedTask.id, "DONE");
    }
  }

  return {
    agent,
    executedAt: new Date().toISOString(),
    matchedTaskId: matchedTask?.id,
    createdRunIds,
    createdApprovalIds,
    providersChecked: providers.map(p => ({ name: p.name, configured: p.isConfigured(), capabilities: p.capabilities() })),
    executions,
    summary: {
      executed: executions.filter(r => r.status === "executed").length,
      approvals: executions.filter(r => r.status === "needs_approval").length,
      manual: executions.filter(r => r.status === "queued_manual").length,
      failed: executions.filter(r => r.status === "failed").length
    }
  };
}
