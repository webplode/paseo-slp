import type {
  PluginHookAgent,
  PluginHookContext,
  PluginLifecycleEvents,
  PluginServerContext,
  PluginTurnOutcome,
} from "@getpaseo/plugin/server";
import {
  attentionWatchLabel,
  attentionWatchValue,
  watcherScopeLabel,
  watcherSupervisorLabel,
  watcherRepairPromptPrefix,
  watcherSweepPromptPrefix,
  watcherTriggerPromptPrefix,
  type Role,
} from "../shared/roles";
import { formatWatcherReport, parseWatcherResult, type WatcherResult } from "./watcher-result";

interface Signal {
  sourceAgentId: string;
  sourceTitle: string;
  kind: string;
}

function latestOutputText(timeline: PluginLifecycleEvents["agent.turn_ended"]["timeline"]): string {
  let output = "";
  for (const item of timeline) {
    if (item.type === "user_message") {
      output = "";
    } else if (item.type === "assistant_message") {
      output += item.text;
    }
  }
  return output.trim();
}

function isWatcherMachineTurn(
  timeline: PluginLifecycleEvents["agent.turn_ended"]["timeline"],
): boolean {
  const userMessages = timeline.filter((item) => item.type === "user_message");
  // Some providers do not echo the creation prompt. A Watcher's first no-user
  // turn can only be its launch assignment; subsequent Human sends receive a
  // canonical user row from AgentManager.
  if (userMessages.length === 0) return true;
  const latest = userMessages.at(-1)?.text.trim() ?? "";
  const scheduledSweep =
    latest.startsWith("<paseo-system>") &&
    latest.includes("Schedule fired") &&
    latest.includes(watcherSweepPromptPrefix);
  return (
    scheduledSweep ||
    latest.startsWith(watcherSweepPromptPrefix) ||
    latest.startsWith(watcherTriggerPromptPrefix) ||
    latest.startsWith(watcherRepairPromptPrefix) ||
    (userMessages.length === 1 && latest.includes("## Watcher assignment"))
  );
}

function latestTurnItems(
  timeline: PluginLifecycleEvents["agent.turn_ended"]["timeline"],
): PluginLifecycleEvents["agent.turn_ended"]["timeline"] {
  let start = 0;
  for (let index = 0; index < timeline.length; index += 1) {
    if (timeline[index]?.type === "user_message") start = index + 1;
  }
  return timeline.slice(start);
}

function priorAssistantOutputs(
  timeline: PluginLifecycleEvents["agent.turn_ended"]["timeline"],
): string[] {
  const outputs: string[] = [];
  let current = "";
  let sawTurn = false;
  for (const item of timeline) {
    if (item.type === "user_message") {
      if (sawTurn && current.trim()) outputs.push(current.trim());
      current = "";
      sawTurn = true;
    } else if (item.type === "assistant_message") {
      current += item.text;
    }
  }
  return outputs;
}

const watcherReaderTools = ["list_agents", "get_agent_activity"] as const;

type WatcherToolCall = Extract<
  PluginLifecycleEvents["agent.turn_ended"]["timeline"][number],
  { type: "tool_call" }
>;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function watcherReaderToolName(item: WatcherToolCall): (typeof watcherReaderTools)[number] | null {
  for (const tool of watcherReaderTools) {
    if (
      item.name === tool ||
      item.name.endsWith(`__${tool}`) ||
      item.name.endsWith(`/${tool}`) ||
      item.name.endsWith(`.${tool}`)
    )
      return tool;
  }
  const input = record(record(item.detail)?.input);
  if (item.name === "call_mcp_tool" && input?.ServerName === "paseo") {
    const toolName = input.ToolName;
    if (watcherReaderTools.includes(toolName as (typeof watcherReaderTools)[number])) {
      return toolName as (typeof watcherReaderTools)[number];
    }
  }
  return null;
}

function evidenceText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function validateWatcherEvidence(
  result: WatcherResult,
  timeline: PluginLifecycleEvents["agent.turn_ended"]["timeline"],
  hasCoveredAgents: boolean,
): string | null {
  const completedCalls = latestTurnItems(timeline).filter(
    (item) => item.type === "tool_call" && item.status === "completed",
  );
  const listCalls = completedCalls.filter((item) => watcherReaderToolName(item) === "list_agents");
  const activityCalls = completedCalls.filter(
    (item) => watcherReaderToolName(item) === "get_agent_activity",
  );

  if (result.coverage === "complete" && listCalls.length === 0) {
    return "complete coverage was claimed without a completed list_agents read in this sweep";
  }
  if (result.coverage === "complete" && hasCoveredAgents && activityCalls.length === 0) {
    return "complete coverage was claimed without a completed get_agent_activity read in this sweep";
  }

  const suppliedActivityEvidence = activityCalls
    .map((item) => evidenceText(item.detail))
    .join("\n");
  const unseenRef = result.sourceRefs.find((ref) => !suppliedActivityEvidence.includes(ref));
  if (unseenRef) {
    return `source reference was not present in supplied get_agent_activity evidence: ${unseenRef}`;
  }
  return null;
}

function validateWatcherChange(
  result: WatcherResult,
  timeline: PluginLifecycleEvents["agent.turn_ended"]["timeline"],
  allowedAgentIds: ReadonlySet<string>,
): { error: string | null; unchangedRepeat: boolean } {
  if (result.status === "quiet" || result.changed.trim()) {
    return { error: null, unchangedRepeat: false };
  }
  const hasMatchingPriorObservation = priorAssistantOutputs(timeline).some((output) => {
    const previous = parseWatcherResult(output, allowedAgentIds);
    return (
      previous.ok &&
      previous.result.status !== "quiet" &&
      previous.result.status === result.status &&
      previous.result.coverage === result.coverage &&
      previous.result.state === result.state
    );
  });
  return hasMatchingPriorObservation
    ? { error: null, unchangedRepeat: true }
    : {
        error: "non-quiet result omitted what changed without a matching prior observation state",
        unchangedRepeat: false,
      };
}

function signalText(signal: Signal): string {
  return `- ${signal.sourceTitle} (${signal.sourceAgentId}): ${signal.kind}`;
}

function outcomeText(outcome: PluginTurnOutcome): string {
  if (outcome.kind === "failed") return `turn failed: ${outcome.error.message}`;
  if (outcome.kind === "canceled") return `turn canceled: ${outcome.reason}`;
  return "Lead turn completed";
}

async function snapshotFor(agent: PluginHookAgent, context: PluginHookContext) {
  const refreshed = await context.paseo.agents.ref(agent.id).refresh();
  return refreshed?.agent ?? null;
}

export function registerAttentionTrigger(server: PluginServerContext): () => void {
  const pending = new Map<string, Signal[]>();
  const pendingSupervisorPrompts = new Map<string, string[]>();
  const activeWake = new Set<string>();
  const repairAttempts = new Set<string>();

  const watchingAgents = async (
    role: "watcher" | "supervisor",
    workspaceId: string,
    context: PluginHookContext,
  ) => {
    const result = await context.paseo.agents.list({
      filter: {
        labels: { "slp.role": role, [attentionWatchLabel]: attentionWatchValue },
        includeArchived: false,
      },
      page: { limit: 200 },
    });
    return result.entries
      .map((entry) => entry.agent)
      .filter((agent) => agent.workspaceId === workspaceId);
  };

  const wakeSupervisor = async (
    supervisorId: string,
    context: PluginHookContext,
  ): Promise<void> => {
    if (activeWake.has(supervisorId)) return;
    const prompts = pendingSupervisorPrompts.get(supervisorId);
    if (!prompts?.length) return;
    pendingSupervisorPrompts.delete(supervisorId);
    activeWake.add(supervisorId);
    try {
      await context.paseo.agents.ref(supervisorId).send(prompts.slice(-8).join("\n\n"));
    } catch (error) {
      activeWake.delete(supervisorId);
      console.warn("SLP attention trigger could not wake Supervisor", supervisorId, error);
    }
  };

  const queueSupervisorPrompt = async (
    workspaceId: string,
    prompt: string,
    context: PluginHookContext,
  ): Promise<void> => {
    const supervisors = await watchingAgents("supervisor", workspaceId, context);
    for (const supervisor of supervisors) {
      const prompts = pendingSupervisorPrompts.get(supervisor.id) ?? [];
      prompts.push(prompt);
      pendingSupervisorPrompts.set(supervisor.id, prompts.slice(-8));
      if (supervisor.status !== "running" && supervisor.status !== "initializing") {
        await wakeSupervisor(supervisor.id, context);
      }
    }
  };

  const queueAssignedSupervisorPrompt = async (
    watcher: NonNullable<Awaited<ReturnType<typeof snapshotFor>>>,
    prompt: string,
    context: PluginHookContext,
  ): Promise<void> => {
    const supervisorId = watcher.labels[watcherSupervisorLabel];
    if (!supervisorId) {
      await queueSupervisorPrompt(watcher.workspaceId ?? "", prompt, context);
      return;
    }
    const supervisor = await context.paseo.agents.ref(supervisorId).refresh();
    if (
      !supervisor?.agent ||
      supervisor.agent.archivedAt ||
      supervisor.agent.workspaceId !== watcher.workspaceId ||
      supervisor.agent.labels["slp.role"] !== "supervisor"
    ) {
      console.warn("SLP Watcher has no valid reporting Supervisor", watcher.id, supervisorId);
      return;
    }
    const prompts = pendingSupervisorPrompts.get(supervisorId) ?? [];
    prompts.push(prompt);
    pendingSupervisorPrompts.set(supervisorId, prompts.slice(-8));
    if (supervisor.agent.status !== "running" && supervisor.agent.status !== "initializing") {
      await wakeSupervisor(supervisorId, context);
    }
  };

  const wakeWatcher = async (watcherId: string, context: PluginHookContext): Promise<void> => {
    if (activeWake.has(watcherId)) return;
    const signals = pending.get(watcherId);
    if (!signals?.length) return;
    pending.delete(watcherId);
    activeWake.add(watcherId);
    const watcher = await context.paseo.agents.ref(watcherId).refresh();
    const workspaceId = watcher?.agent.workspaceId;
    const prompt = `${watcherTriggerPromptPrefix} these are doorbells, not findings.

Workspace: ${workspaceId ?? "unknown"}

Recent lifecycle signals:
${signals.slice(-8).map(signalText).join("\n")}

Discover all covered Lead and Peer agents with list_agents filtered by this exact workspace.
Covered means the agent has an exact slp.role label of lead or peer; never infer a role
from title, lifecycle, parentage, missing labels, or activity. Then
use get_agent_status and incremental get_agent_activity. Inspect the smallest evidence
needed and return the exact JSON result required by your role contract. Do not contact
another agent or edit project state.`;
    try {
      await context.paseo.agents.ref(watcherId).send(prompt);
    } catch (error) {
      activeWake.delete(watcherId);
      console.warn("SLP attention trigger could not wake Watcher", watcherId, error);
    }
  };

  const queue = async (
    source: PluginHookAgent,
    kind: string,
    context: PluginHookContext,
  ): Promise<void> => {
    if (!source.workspaceId) return;
    const candidates = (await watchingAgents("watcher", source.workspaceId, context)).filter(
      (watcher) =>
        watcher.status !== "error" &&
        watcher.labels[watcherScopeLabel] === source.workspaceId &&
        typeof watcher.labels[watcherSupervisorLabel] === "string",
    );
    const watchers = (
      await Promise.all(
        candidates.map(async (watcher) => {
          const owner = await context.paseo.agents
            .ref(watcher.labels[watcherSupervisorLabel]!)
            .refresh();
          return owner?.agent &&
            !owner.agent.archivedAt &&
            owner.agent.workspaceId === source.workspaceId &&
            owner.agent.labels["slp.role"] === "supervisor"
            ? watcher
            : null;
        }),
      )
    ).filter((watcher): watcher is NonNullable<typeof watcher> => watcher !== null);
    for (const watcher of watchers) {
      const signals = pending.get(watcher.id) ?? [];
      signals.push({
        sourceAgentId: source.id,
        sourceTitle: source.title ?? "SLP agent",
        kind,
      });
      pending.set(watcher.id, signals.slice(-8));
      if (watcher.status !== "running" && watcher.status !== "initializing") {
        await wakeWatcher(watcher.id, context);
      }
    }
    if (watchers.length === 0) {
      const signal = { sourceAgentId: source.id, sourceTitle: source.title ?? "SLP agent", kind };
      await queueSupervisorPrompt(
        source.workspaceId,
        `SLP attention trigger — no Watcher is active, so this doorbell is routed directly.\n\n${signalText(signal)}\n\nInspect the bounded recent activity and decide independently whether intervention would materially help.`,
        context,
      );
    }
  };

  const onTurnEnded = server.on("agent.turn_ended", async (event, context) => {
    const snapshot = await snapshotFor(event.agent, context);
    const role = snapshot?.labels["slp.role"] as Role | undefined;
    if (role === "supervisor") {
      activeWake.delete(event.agent.id);
      await wakeSupervisor(event.agent.id, context);
      return;
    }
    if (role === "watcher") {
      activeWake.delete(event.agent.id);
      if (!snapshot?.workspaceId) return;
      if (event.outcome.kind === "completed" && !isWatcherMachineTurn(event.timeline)) {
        await wakeWatcher(event.agent.id, context);
        return;
      }
      if (event.outcome.kind !== "completed") {
        repairAttempts.delete(event.agent.id);
        await queueAssignedSupervisorPrompt(
          snapshot,
          `SLP Watcher could not complete its passive inspection: ${outcomeText(event.outcome)}. Coverage is failed; inspect the original evidence directly.`,
          context,
        );
      } else {
        const covered = await Promise.all(
          (["lead", "peer"] as const).map((coveredRole) =>
            context.paseo.agents.list({
              filter: { labels: { "slp.role": coveredRole }, includeArchived: false },
              page: { limit: 200 },
            }),
          ),
        );
        const coveredAgents = covered
          .flatMap((result) => result.entries)
          .map((entry) => entry.agent)
          .filter((agent) => agent.workspaceId === snapshot.workspaceId);
        const allowedAgents = new Map(
          coveredAgents.map((agent) => [agent.id, agent.labels["slp.role"] as "lead" | "peer"]),
        );
        const allowedIds = new Set(allowedAgents.keys());
        const parsed = parseWatcherResult(latestOutputText(event.timeline), allowedAgents);
        if (!parsed.ok) {
          if (!repairAttempts.has(event.agent.id)) {
            repairAttempts.add(event.agent.id);
            activeWake.add(event.agent.id);
            // oxlint-disable-next-line max-depth
            try {
              await context.paseo.agents
                .ref(event.agent.id)
                .send(
                  `${watcherRepairPromptPrefix} Your previous Watcher result was invalid (${parsed.error}). Repair it once: return exactly one JSON object matching the role contract. Do not reread evidence or change source references.`,
                );
            } catch (error) {
              activeWake.delete(event.agent.id);
              await queueAssignedSupervisorPrompt(
                snapshot,
                `SLP Watcher format repair could not start. Coverage is failed: ${String(error)}`,
                context,
              );
            }
            return;
          }
          repairAttempts.delete(event.agent.id);
          await queueAssignedSupervisorPrompt(
            snapshot,
            `SLP Watcher returned invalid output after one bounded repair (${parsed.error}). Coverage is failed; inspect original evidence directly.`,
            context,
          );
        } else {
          repairAttempts.delete(event.agent.id);
          const evidenceError = validateWatcherEvidence(
            parsed.result,
            event.timeline,
            coveredAgents.length > 0,
          );
          if (evidenceError) {
            await queueAssignedSupervisorPrompt(
              snapshot,
              `SLP Watcher result failed evidence validation (${evidenceError}). Coverage is failed; inspect the original evidence directly.`,
              context,
            );
          } else {
            const change = validateWatcherChange(parsed.result, event.timeline, allowedIds);
            // oxlint-disable-next-line max-depth
            if (change.error) {
              await queueAssignedSupervisorPrompt(
                snapshot,
                `SLP Watcher result failed change validation (${change.error}). Coverage is failed; inspect the original evidence directly.`,
                context,
              );
            } else if (parsed.result.status !== "quiet" && !change.unchangedRepeat) {
              await queueAssignedSupervisorPrompt(
                snapshot,
                `SLP Watcher report — inspect the cited original evidence independently before acting.\n\n${formatWatcherReport(parsed.result)}`,
                context,
              );
            }
          }
        }
      }
      await wakeWatcher(event.agent.id, context);
      return;
    }
    if (role === "lead" || (role === "peer" && event.outcome.kind !== "completed")) {
      await queue(event.agent, outcomeText(event.outcome), context);
    }
  });

  const onPermission = server.on("agent.permission_requested", async (event, context) => {
    const snapshot = await snapshotFor(event.agent, context);
    const role = snapshot?.labels["slp.role"] as Role | undefined;
    if (role === "lead" || role === "peer") {
      await queue(event.agent, "permission requested", context);
    }
  });

  const onArchived = server.on("agent.archived", async (event, context) => {
    const snapshot = await snapshotFor(event.agent, context);
    if (snapshot?.labels["slp.role"] !== "supervisor") return;
    const watchers = await context.paseo.agents.list({
      filter: {
        labels: { "slp.role": "watcher", [watcherSupervisorLabel]: event.agent.id },
        includeArchived: false,
      },
      page: { limit: 200 },
    });
    await Promise.all(
      watchers.entries.map((entry) => context.paseo.agents.ref(entry.agent.id).archive()),
    );
  });

  return () => {
    onTurnEnded();
    onPermission();
    onArchived();
    pending.clear();
    pendingSupervisorPrompts.clear();
    activeWake.clear();
    repairAttempts.clear();
  };
}
