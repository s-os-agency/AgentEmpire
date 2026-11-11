import { addAsset, addContent, addLead, addOpportunity, addTask, analyzeDecision, generateWeeklyBrief } from "@/lib/store";
import type { AgentCapability, ToolProviderName } from "@/lib/agents/definitions";

export type ToolStatus = "executed" | "needs_approval" | "missing_connector" | "queued_manual" | "failed";

export interface ToolRequest {
  capability: AgentCapability;
  agentId: string;
  inputs: Record<string, string>;
  summary: string;
  sensitiveAction?: string;
}

export interface ToolResult {
  status: ToolStatus;
  provider: ToolProviderName;
  capability: AgentCapability;
  message: string;
  result?: unknown;
  approvalRequired?: boolean;
}

export interface ToolProvider {
  name: ToolProviderName;
  isConfigured(): boolean;
  capabilities(): AgentCapability[];
  execute(request: ToolRequest): Promise<ToolResult>;
}

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function createReadableTaskTitle(input: Record<string, string>, fallback: string) {
  return input.taskTitle || input.title || input.objective || input.topic || input.focusArea || fallback;
}

export class NativeProvider implements ToolProvider {
  name: ToolProviderName = "native";
  isConfigured() { return true; }
  capabilities(): AgentCapability[] {
    return ["task.create", "task.subtask.create", "content.create", "opportunity.manage", "decision.manage", "lead.manage", "asset.manage", "briefing.create"];
  }

  async execute(request: ToolRequest): Promise<ToolResult> {
    const input = request.inputs;

    if (request.capability === "content.create") {
      const item = await addContent({ pillar: input.pillar || "Execution", topic: input.topic || createReadableTaskTitle(input, "New content work"), angle: input.angle || "Operational", hook: input.hook || createReadableTaskTitle(input, "New content work"), body: input.body || request.summary, platform: input.platform || "Internal" });
      return { status: "executed", provider: this.name, capability: request.capability, message: "Content work created.", result: item };
    }

    if (request.capability === "opportunity.manage") {
      const item = await addOpportunity({ title: input.title || createReadableTaskTitle(input, "Operational opportunity"), description: input.description || request.summary, type: input.type || "Opportunity", source: input.source || "agent", expectedRevenue: asNumber(input.expectedRevenue, 0), nextAction: input.nextAction || "", dueDate: input.dueDate || "" });
      return { status: "executed", provider: this.name, capability: request.capability, message: "Opportunity record created.", result: item };
    }

    if (request.capability === "lead.manage") {
      const lead = await addLead({ name: input.name || "Unnamed lead", email: input.email || "", message: input.message || request.summary, sourceType: "offer", sourceId: "agent", sourceName: input.sourceName || "Operational lead work" });
      return { status: "executed", provider: this.name, capability: request.capability, message: "Lead work created.", result: lead };
    }

    if (request.capability === "asset.manage") {
      const asset = await addAsset({ title: input.title || createReadableTaskTitle(input, "Operational asset"), type: input.type || "Toolkit", summary: input.summary || request.summary, price: asNumber(input.price, 0), format: input.format || "Internal" });
      return { status: "executed", provider: this.name, capability: request.capability, message: "Asset work created.", result: asset };
    }

    if (request.capability === "decision.manage") {
      const decision = await analyzeDecision({ title: input.title || createReadableTaskTitle(input, "Decision"), context: input.context || request.summary, options: (input.options || "Proceed,Pause,Refine").split(",").map(v => v.trim()).filter(Boolean) });
      return { status: "executed", provider: this.name, capability: request.capability, message: "Decision work created.", result: decision };
    }

    if (request.capability === "briefing.create") {
      const brief = await generateWeeklyBrief();
      return { status: "executed", provider: this.name, capability: request.capability, message: "Briefing created.", result: brief };
    }

    if (request.capability === "task.create" || request.capability === "task.subtask.create") {
      const task = await addTask({ title: createReadableTaskTitle(input, "Operational task"), category: input.category || "Operations", priority: (input.priority as any) || "MEDIUM", linkedEntityType: input.linkedEntityType || "agent", linkedEntityId: request.agentId, dueAt: input.dueAt || new Date().toISOString() });
      return { status: "executed", provider: this.name, capability: request.capability, message: "Task created.", result: task };
    }

    return {
      status: "missing_connector",
      provider: this.name,
      capability: request.capability,
      message: `No native implementation exists for ${request.capability}.`
    };
  }
}

export class ComposioProvider implements ToolProvider {
  name: ToolProviderName = "composio";
  isConfigured() { return Boolean(process.env.COMPOSIO_API_KEY); }
  capabilities(): AgentCapability[] { return ["email.draft", "calendar.create", "github.issue.create"]; }
  async execute(request: ToolRequest): Promise<ToolResult> {
    if (!this.isConfigured()) return { status: "missing_connector", provider: this.name, capability: request.capability, message: "Composio is not configured. Add COMPOSIO_API_KEY in Netlify environment variables." };
    return { status: "missing_connector", provider: this.name, capability: request.capability, message: "A Composio key is configured, but this provider has no execution adapter for the requested capability. No external action was prepared or performed." };
  }
}

export class WebhookProvider implements ToolProvider {
  name: ToolProviderName = "webhook";
  isConfigured() { return Boolean(process.env.WEBHOOK_ROUTER_URL); }
  capabilities(): AgentCapability[] { return ["agent.execute", "task.create", "task.subtask.create"]; }
  async execute(request: ToolRequest): Promise<ToolResult> {
    if (!this.isConfigured()) return { status: "missing_connector", provider: this.name, capability: request.capability, message: "Webhook router is not configured." };
    const response = await fetch(process.env.WEBHOOK_ROUTER_URL!, { method: "POST", headers: { "content-type": "application/json", ...(process.env.WEBHOOK_ROUTER_TOKEN ? { authorization: `Bearer ${process.env.WEBHOOK_ROUTER_TOKEN}` } : {}) }, body: JSON.stringify(request) });
    const payload = await response.json().catch(() => null);
    const executed = response.ok && payload !== null && payload?.ok !== false && !payload?.error;
    return { status: executed ? "executed" : "failed", provider: this.name, capability: request.capability, message: executed ? "Webhook returned a successful response." : "Webhook returned an error or unreadable response.", result: payload };
  }
}

export class McpProvider implements ToolProvider {
  name: ToolProviderName = "mcp";
  isConfigured() { return Boolean(process.env.MCP_SERVER_URL); }
  capabilities(): AgentCapability[] { return ["agent.execute", "task.create", "task.subtask.create", "github.issue.create"]; }
  async execute(request: ToolRequest): Promise<ToolResult> {
    if (!this.isConfigured()) return { status: "missing_connector", provider: this.name, capability: request.capability, message: "MCP server is not configured." };
    const response = await fetch(process.env.MCP_SERVER_URL!, { method: "POST", headers: { "content-type": "application/json", ...(process.env.MCP_AUTH_TOKEN ? { authorization: `Bearer ${process.env.MCP_AUTH_TOKEN}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: request }) });
    const payload = await response.json().catch(() => null);
    const executed = response.ok && payload?.jsonrpc === "2.0" && !payload?.error && payload?.result && payload.result.isError !== true;
    return { status: executed ? "executed" : "failed", provider: this.name, capability: request.capability, message: executed ? "MCP returned a successful tool result." : "MCP did not return a successful tool result.", result: payload };
  }
}

export class ManualProvider implements ToolProvider {
  name: ToolProviderName = "manual";
  isConfigured() { return true; }
  capabilities(): AgentCapability[] { return ["agent.execute", "task.create", "task.subtask.create", "content.create", "opportunity.manage", "decision.manage", "lead.manage", "asset.manage", "briefing.create", "email.draft", "calendar.create", "github.issue.create"]; }
  async execute(request: ToolRequest): Promise<ToolResult> {
    return { status: "queued_manual", provider: this.name, capability: request.capability, message: "Action queued for manual/provider follow-up.", result: { queued: true, capability: request.capability } };
  }
}

export function getProviders(): ToolProvider[] {
  return [new NativeProvider(), new ComposioProvider(), new WebhookProvider(), new McpProvider(), new ManualProvider()];
}
