import type { PluginBeforeRequests, PluginHookContext } from "@getpaseo/plugin/server";
import {
  getProfileRoles,
  getProfilePeerSubroles,
  recoveryLeaseLabel,
  recoveryLeaseValue,
  notebookWriterLabel,
  notebookWriterValue,
  peerSubroles,
  roles,
  watcherCadenceLabel,
  watcherScopeLabel,
  watcherSupervisorLabel,
  type Role,
  type PeerSubrole,
} from "../shared/roles";
import { roleInstructions, peerInstructions, prioritySkillInstructions } from "./role-instructions";
import { projectMemoryInstructions, resolveProjectMemoryRoot } from "./project-memory";

type Request = PluginBeforeRequests["agent.create"];
type Paseo = PluginHookContext["paseo"];

// Public catalog DTOs omit isUnattended. These are the native full-access IDs
// implemented by this checkout, not guesses based on labels or presentation.
const fullAccessModeIds = new Set([
  "full-access",
  "bypassPermissions",
  "full",
  "https://agentclientprotocol.com/protocol/session-modes#autopilot",
]);

const watcherNoWriteModeIds: Record<string, string> = {
  codex: "read-only",
  claude: "bypassPermissions",
  antigravity: "plan",
};

function resolveRoleMode(
  role: Role,
  provider: string,
  modes: readonly { id: string }[] | undefined,
): string {
  if (role === "watcher") {
    const requiredMode = watcherNoWriteModeIds[provider];
    if (!requiredMode) {
      throw new Error(
        `Provider ${provider} has no qualified no-write Watcher configuration in SLP.`,
      );
    }
    if (!modes?.some((mode) => mode.id === requiredMode)) {
      throw new Error(
        `Provider ${provider} does not advertise the required no-write Watcher mode ${requiredMode}.`,
      );
    }
    return requiredMode;
  }
  const fullAccess = modes?.find((mode) => fullAccessModeIds.has(mode.id));
  if (!fullAccess) {
    throw new Error(`Provider ${provider} has no supported full-access mode for SLP.`);
  }
  return fullAccess.id;
}

function applyRoleRuntimeBoundary(config: Request["config"], role: Role): Request["config"] {
  if (role !== "watcher") {
    return config.provider === "codex"
      ? {
          ...config,
          providerOptions: {
            ...config.providerOptions,
            sandbox_mode: "danger-full-access",
            approval_policy: "never",
          },
        }
      : config;
  }

  // Watchers receive only the daemon-injected caller-scoped Paseo MCP server.
  // Discard caller-supplied MCP servers so the bounded role cannot inherit a
  // second control plane. The daemon injects Paseo after this hook.
  const { mcpServers: _externalMcpServers, toolPolicy: _externalToolPolicy, ...bounded } = config;
  if (config.provider === "codex") {
    return {
      ...bounded,
      providerOptions: {
        ...config.providerOptions,
        sandbox_mode: "read-only",
        approval_policy: "never",
      },
    };
  }
  if (config.provider === "claude") {
    return {
      ...bounded,
      providerOptions: {
        ...config.providerOptions,
        // Claude SDK defines this as the complete built-in tool set. Empty
        // disables Bash/Edit/Write/subagents while leaving explicit MCP tools.
        tools: [],
      },
    };
  }
  return bounded;
}

// Keep role policy in the SLP plugin. The daemon only knows the generic
// optional ceiling and intersects it with the provider/host policy.
export const rolePaseoToolAllowlists: Record<Role, readonly string[]> = {
  peer: [],
  watcher: [
    "list_agents",
    "get_agent_status",
    "get_agent_activity",
    "create_heartbeat",
    "delete_heartbeat",
  ],
  lead: [
    // Provider/profile discovery.
    "list_profiles",
    "list_providers",
    "list_models",
    "inspect_provider",
    // Delegation, follow-up, inspection and correction.
    "create_agent",
    "send_agent_prompt",
    "get_agent_status",
    "list_agents",
    "get_agent_activity",
    "list_pending_permissions",
    "cancel_agent",
    "update_agent",
    "set_agent_mode",
    // Workspace placement.
    "create_workspace",
    "list_workspaces",
    "rename_workspace",
    // Existing integration surfaces.
    "list_workspace_scripts",
    "start_workspace_script",
    "stop_workspace_script",
    "list_terminals",
    "create_terminal",
    "capture_terminal",
    "send_terminal_keys",
  ],
  supervisor: [
    "get_agent_status",
    "list_agents",
    "get_agent_activity",
    "list_pending_permissions",
    "send_agent_prompt",
  ],
};

const supervisorRecoveryTools = [
  "list_profiles",
  "list_providers",
  "list_models",
  "inspect_provider",
  "create_agent",
  "cancel_agent",
  "update_agent",
] as const;

function hasRecoveryLease(request: Request, role: Role): boolean {
  return role === "supervisor" && request.labels?.[recoveryLeaseLabel] === recoveryLeaseValue;
}

function hasNotebookWriterLease(request: Request, role: Role): boolean {
  return role === "supervisor" && request.labels?.[notebookWriterLabel] === notebookWriterValue;
}

function enforceProviderRole(provider: string, role: Role): void {
  if (provider === "antigravity" && (role === "lead" || role === "supervisor")) {
    throw new Error("Antigravity profiles may serve SLP Watcher or Peer, not Lead or Supervisor.");
  }
}

function delegationInstructions(role: Role, recoveryAllowed: boolean): string {
  if (role === "peer" || role === "watcher") return "";
  if (role === "supervisor") {
    return recoveryAllowed
      ? `## Delegated Lead recovery

Your launch grants recovery capability, but the assignment is the lease. Recover only
the exact incumbent Lead, workspace, profile bounds, expiry and stop condition named
there. First inspect evidence and try one bounded attention question unless the Lead is
already unavailable. Replace at most one Lead, keep the same workspace, send a compact
handoff of accepted decisions, ownership, unknowns and next action, then report the
action to the Human. Do not create a Peer or turn recovery into a second command chain.
If any lease field is absent or ambiguous, report BLOCKED instead of launching.`
      : `## Human launcher route

Do not create or replace a Lead through your tools. The Human uses the existing SLP
launcher for that lifecycle operation and chooses the Lead's profile, provider, model,
budget and full-access mode there. You may ask the Lead a bounded question or relay a
Human decision with send_agent_prompt, but you do not create a second command chain or
direct a Peer.`;
  }
  const target = role === "lead" ? "peer" : "lead";
  return `## Choosing an execution profile

Role identity and execution settings are separate. Before creating a ${target}, call
Paseo list_profiles and read the notes of profiles tagged ${
    role === "lead" ? "[slp:peer] or [slp:peer:<specialization>]" : "[slp:lead]"
  }. Choose by
the task's uncertainty, scope, required judgment, cost and latency. Explain the fit
briefly in the assignment. Do not default every task to the largest model or budget.
${
  role === "lead"
    ? "First choose the Peer specialization: engineer for implementation, scout for evidence gathering, architect for design and tradeoffs, or reviewer for independent candidate review. Select profiles tagged [slp:peer:engineer], [slp:peer:scout], [slp:peer:architect] or [slp:peer:reviewer] for that specialization. A generic [slp:peer] profile supports all four. Include the chosen specialization in slp.subrole."
    : ""
}
Use the selected profile's provider, model, thinkingOptionId and featureValues.
Inspect the target provider's available modes and explicitly select its full-access
mode: full-access for Codex/Antigravity, bypassPermissions for Claude, full for OMP,
or the advertised ACP autopilot mode for Copilot. Cross-provider creation requires
an explicit mode before the plugin hook runs. Do not substitute plan mode for a
no-write assignment; keep that boundary in the assignment's instructions.
Discover current provider models and thinking options before a task-specific override;
keep overrides in that launch, never rewrite the standing profile. If no profile fits,
surface the missing configuration instead of silently assigning an unsuitable one.
If the native Paseo tools are absent, report that Enable Paseo tools must be turned
on in Settings → host → Agents and the session refreshed. Do not search for another
Paseo installation, connect to another host, or bypass this launch path.

Create through the ordinary Paseo create_agent tool with provider="provider/model",
labels={"slp.role":"${target}","slp.profile":"selected profile id"${
    role === "lead" ? ',"slp.subrole":"selected subrole"' : ""
  }}, and
settings={modeId:"verified full-access mode",thinkingOptionId:"selected budget",features:{...selected featureValues}}.
Supply a bounded initialPrompt with the objective, authority, owned scope, relevant
protocol constraints, handback and stop condition. The SLP plugin injects the target's
role instructions and full-access mode before its first turn. Use the normal Paseo
parent/child lifecycle and finish notifications. Do not create another lifecycle store.
You choose and accept the Peer outcome; the model and thinking budget do not grant the Peer acceptance authority.`;
}

function parseRoleLabels(request: Request) {
  const labels = request.labels ?? {};
  const roleId = labels["slp.role"];
  const profileId = labels["slp.profile"];
  if (roleId === undefined && profileId === undefined && labels["slp.subrole"] === undefined)
    return null;
  if (!roles.includes(roleId as Role) || !profileId) {
    throw new Error(
      "SLP launch requires slp.role (supervisor, watcher, lead or peer) and slp.profile labels.",
    );
  }
  const role = roleId as Role;
  const subroleId = labels["slp.subrole"];
  if (
    subroleId !== undefined &&
    (role !== "peer" || !peerSubroles.includes(subroleId as PeerSubrole))
  ) {
    throw new Error(
      "slp.subrole must be engineer, scout, architect or reviewer, and applies only to Peer.",
    );
  }
  // Older callers can still launch a generic Peer; explicit specializations are checked below.
  const subrole = subroleId as PeerSubrole | undefined;
  return { role, profileId, subrole };
}

async function enforceNotebookWriterLease(
  projectRoot: string,
  paseo: Paseo,
  requested: boolean,
): Promise<void> {
  if (!requested) return;
  const existing = await paseo.agents.list({
    filter: {
      labels: { "slp.role": "supervisor", [notebookWriterLabel]: notebookWriterValue },
      includeArchived: false,
    },
    page: { limit: 200 },
  });
  for (const entry of existing.entries) {
    const agent = entry.agent;
    if (!agent.workspaceId || agent.status === "closed") continue;
    const workspace = await paseo.workspaces.ref(agent.workspaceId).refresh();
    if (
      workspace?.projectRootPath &&
      (await resolveProjectMemoryRoot(workspace.workspaceDirectory, paseo)) === projectRoot
    ) {
      throw new Error(`Project ${projectRoot} already has an active Supervisor notebook writer.`);
    }
  }
}

async function enforceWatcherAssignment(request: Request, paseo: Paseo): Promise<void> {
  const labels = request.labels ?? {};
  const supervisorId = labels[watcherSupervisorLabel];
  const scopeWorkspaceId = labels[watcherScopeLabel];
  const cadence = Number(labels[watcherCadenceLabel]);
  if (!scopeWorkspaceId || !supervisorId) {
    throw new Error(
      "Watcher launch requires an exact reporting Supervisor and workspace scope matching its placement.",
    );
  }
  if (!Number.isInteger(cadence) || cadence < 1 || cadence > 1440) {
    throw new Error("Watcher cadence must be an integer from 1 to 1440 minutes.");
  }
  const supervisor = await paseo.agents.ref(supervisorId).refresh();
  if (
    !supervisor?.agent ||
    supervisor.agent.archivedAt ||
    supervisor.agent.workspaceId !== scopeWorkspaceId ||
    supervisor.agent.labels["slp.role"] !== "supervisor"
  ) {
    throw new Error(
      "Watcher reporting owner must be an active Supervisor in the assigned workspace.",
    );
  }
  const existing = await paseo.agents.list({
    filter: {
      labels: {
        "slp.role": "watcher",
        [watcherSupervisorLabel]: supervisorId,
        [watcherScopeLabel]: scopeWorkspaceId,
      },
      includeArchived: false,
    },
    page: { limit: 200 },
  });
  if (existing.entries.length > 0) {
    throw new Error(
      `Watcher ${existing.entries[0]!.agent.id} already covers Supervisor ${supervisorId} in workspace ${scopeWorkspaceId}.`,
    );
  }
}

// oxlint-disable-next-line complexity
export async function configureRole(request: Request, paseo: Paseo): Promise<Request> {
  const selection = parseRoleLabels(request);
  if (!selection) return request;
  const { role, profileId, subrole } = selection;
  const recoveryAllowed = hasRecoveryLease(request, role);
  const notebookWriter = hasNotebookWriterLease(request, role);
  if (role === "watcher") await enforceWatcherAssignment(request, paseo);
  const { config } = await paseo.config.get();
  const matches = config.agentProfiles?.filter((item) => item.id === profileId) ?? [];
  if (matches.length > 1)
    throw new Error(`Profile ID ${profileId} is duplicated. Give each profile a unique ID.`);
  const profile = matches[0];
  if (!profile || !getProfileRoles(profile.notes).includes(role)) {
    throw new Error(
      `Profile ${profileId} is not configured for ${role}. Update SLP profile roles in Settings.`,
    );
  }
  if (subrole && !getProfilePeerSubroles(profile.notes).includes(subrole)) {
    throw new Error(
      `Profile ${profileId} is not configured for Peer ${subrole}. Update SLP profile roles in Settings.`,
    );
  }
  if (profile.provider !== request.config.provider) {
    throw new Error(
      `Profile ${profileId} uses ${profile.provider}, not ${request.config.provider}.`,
    );
  }
  enforceProviderRole(profile.provider, role);
  const catalog = await paseo.providers.listModes(request.config.provider, {
    cwd: request.config.cwd,
  });
  if (catalog.error) throw new Error(catalog.error);
  const modeId = resolveRoleMode(role, profile.provider, catalog.modes);
  const projectRoot = await resolveProjectMemoryRoot(request.config.cwd, paseo);
  await enforceNotebookWriterLease(projectRoot, paseo, notebookWriter);

  const instructions = [
    roleInstructions[role],
    prioritySkillInstructions,
    subrole ? peerInstructions[subrole] : "",
    projectMemoryInstructions(role, projectRoot, notebookWriter),
    delegationInstructions(role, recoveryAllowed),
  ]
    .filter(Boolean)
    .join("\n\n");
  const useProfileThinking = !request.config.model || request.config.model === profile.model;
  const configured = applyRoleRuntimeBoundary(
    {
      ...request.config,
      model: request.config.model ?? profile.model,
      thinkingOptionId:
        request.config.thinkingOptionId ??
        (useProfileThinking ? profile.thinkingOptionId : undefined),
      featureValues: {
        ...profile.featureValues,
        ...request.config.featureValues,
      },
      modeId,
      paseoToolAllowlist: [
        ...rolePaseoToolAllowlists[role],
        ...(recoveryAllowed ? supervisorRecoveryTools : []),
      ],
      systemPrompt: [instructions, request.config.systemPrompt].filter(Boolean).join("\n\n"),
    },
    role,
  );
  return {
    ...request,
    config: configured,
  };
}
