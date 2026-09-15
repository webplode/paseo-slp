// These small forms render on user input; inline row handlers avoid per-row memoization machinery.
/* oxlint-disable eslint-plugin-react-perf/jsx-no-new-function-as-prop, eslint-plugin-react-perf/jsx-no-new-object-as-prop, eslint-plugin-react-perf/jsx-no-new-array-as-prop */
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PluginSurfaceProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import {
  getProfilePeerSubroles,
  getProfileRoles,
  attentionWatchLabel,
  attentionWatchValue,
  peerSubroles,
  recoveryLeaseLabel,
  recoveryLeaseValue,
  notebookWriterLabel,
  notebookWriterValue,
  roleLabel,
  roles,
  stripProfileTags,
  type PeerSubrole,
  type Role,
  watcherCadenceLabel,
  watcherSweepPromptPrefix,
  watcherScopeLabel,
  watcherSupervisorLabel,
} from "../shared/roles";
import { bootstrapProjectMemoryRpc, inspectProjectMemoryRpc } from "../shared/project-memory";

interface SavedProfile {
  id: string;
  name: string;
  provider: string;
  model?: string;
  thinkingOptionId?: string;
  featureValues?: Record<string, unknown>;
  notes?: string;
}

interface WorkspaceChoice {
  id: string;
  name: string;
  directory: string | null;
}

interface LaunchFormProps extends Pick<
  PluginSurfaceProps,
  "theme" | "layout" | "host" | "navigation"
> {
  workspace: WorkspaceChoice | null;
  workspaceChoices?: readonly WorkspaceChoice[];
  onWorkspaceChange?: (workspaceId: string) => void;
  onOpenSettings?: () => void;
}

function profileNotes(notes: string | undefined): string {
  return stripProfileTags(notes);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function displayModel(profile: SavedProfile): string {
  return profile.model?.trim() || "Provider default";
}

function displayThinking(profile: SavedProfile): string {
  return profile.thinkingOptionId?.trim() || "Provider default";
}

function profileForRole(
  profiles: readonly SavedProfile[],
  role: Role,
  peerSubrole: PeerSubrole,
): SavedProfile[] {
  return profiles.filter((profile) => {
    if (!getProfileRoles(profile.notes).includes(role)) return false;
    return role !== "peer" || getProfilePeerSubroles(profile.notes).includes(peerSubrole);
  });
}

export function LaunchSurface(
  props: PluginSurfaceProps & { onOpenSettings?: () => void },
): ReactElement {
  const paseo = usePaseo();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const workspaceQuery = useQuery({
    queryKey: ["slp", "workspaces", props.host.id],
    queryFn: () => paseo.workspaces.list(),
    staleTime: 10_000,
  });

  const workspaceChoices = useMemo<WorkspaceChoice[]>(
    () =>
      (workspaceQuery.data?.entries ?? []).map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        directory: workspace.workspaceDirectory,
      })),
    [workspaceQuery.data],
  );

  useEffect(() => {
    if (workspaceChoices.length === 0) {
      setWorkspaceId(null);
      return;
    }
    if (!workspaceChoices.some((workspace) => workspace.id === workspaceId)) {
      setWorkspaceId(workspaceChoices[0]?.id ?? null);
    }
  }, [workspaceChoices, workspaceId]);

  const workspace = workspaceChoices.find((entry) => entry.id === workspaceId) ?? null;

  return (
    <LaunchForm
      {...props}
      workspace={workspace}
      workspaceChoices={workspaceChoices}
      onWorkspaceChange={setWorkspaceId}
      onOpenSettings={props.onOpenSettings}
    />
  );
}

export function LaunchWorkspacePanel({
  theme,
  layout,
  host,
  navigation,
  workspaceId,
}: PluginWorkspacePanelProps): ReactElement {
  const workspace = useWorkspace(workspaceId, ({ id, name, directory }) => ({
    id,
    name,
    directory,
  }));

  return (
    <LaunchForm
      theme={theme}
      layout={layout}
      host={host}
      navigation={navigation}
      workspace={
        workspace ?? {
          id: workspaceId,
          name: "Current workspace",
          directory: null,
        }
      }
    />
  );
}

// oxlint-disable-next-line complexity
function LaunchForm({
  theme,
  layout,
  host,
  navigation,
  workspace,
  workspaceChoices,
  onWorkspaceChange,
  onOpenSettings,
}: LaunchFormProps): ReactElement {
  const paseo = usePaseo();
  const inspectProjectMemory = useRpc(inspectProjectMemoryRpc);
  const bootstrapProjectMemory = useRpc(bootstrapProjectMemoryRpc);
  const toast = useToast();
  const [role, setRole] = useState<Role>("peer");
  const [peerSubrole, setPeerSubrole] = useState<PeerSubrole>("engineer");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [thinkingOverride, setThinkingOverride] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [recoveryLease, setRecoveryLease] = useState(false);
  const [notebookWriter, setNotebookWriter] = useState(true);
  const [watcherSupervisorId, setWatcherSupervisorId] = useState<string | null>(null);
  const [watcherCadenceMinutes, setWatcherCadenceMinutes] = useState("15");
  const [watcherExpiry, setWatcherExpiry] = useState("");
  const [watcherStopCondition, setWatcherStopCondition] = useState(
    "Until explicitly stopped or the reporting Supervisor is archived.",
  );

  const profilesQuery = useQuery({
    queryKey: ["slp", "agent-profiles", host.id],
    queryFn: () => paseo.config.get(),
    staleTime: 15_000,
  });
  const profiles = (profilesQuery.data?.config.agentProfiles ?? []) as SavedProfile[];
  const allowedProfiles = profileForRole(profiles, role, peerSubrole);

  useEffect(() => {
    if (!allowedProfiles.some((profile) => profile.id === profileId)) {
      setProfileId(allowedProfiles[0]?.id ?? null);
    }
  }, [allowedProfiles, profileId]);

  useEffect(() => {
    setModelOverride(null);
    setThinkingOverride(null);
  }, [profileId]);

  const selectedProfile = allowedProfiles.find((profile) => profile.id === profileId) ?? null;
  const cwd = workspace?.directory ?? null;
  const projectMemoryQuery = useQuery({
    queryKey: ["slp", "project-memory", host.id, workspace?.id ?? ""],
    queryFn: () => inspectProjectMemory({ workspaceId: workspace!.id }),
    enabled: Boolean(workspace?.id),
    staleTime: 5_000,
  });
  const bootstrapMemory = useMutation({
    mutationFn: () => bootstrapProjectMemory({ workspaceId: workspace!.id }),
    onSuccess: async (result) => {
      await projectMemoryQuery.refetch();
      toast.show(
        result.created.length > 0
          ? `Created ${result.created.join(" and ")}`
          : "Project memory is already ready",
        { variant: "success" },
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const modelsQuery = useQuery({
    queryKey: ["slp", "models", host.id, selectedProfile?.provider ?? "", cwd ?? ""],
    queryFn: async () => {
      if (!selectedProfile) return [];
      const result = await paseo.providers.listModels(
        selectedProfile.provider,
        cwd ? { cwd } : undefined,
      );
      return result.models ?? [];
    },
    enabled: Boolean(selectedProfile),
    staleTime: 60_000,
  });
  const catalogModels = modelsQuery.data;
  const models = catalogModels ?? [];
  const savedModel = selectedProfile?.model?.trim() ?? "";
  const catalogDefaultModel = models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? "";
  const effectiveModelId = modelOverride ?? (savedModel || catalogDefaultModel);
  const modelOptions = useMemo(() => {
    const options = (catalogModels ?? []).map((model) => ({ label: model.label, value: model.id }));
    if (savedModel && !options.some((option) => option.value === savedModel)) {
      options.unshift({ label: `Saved: ${savedModel}`, value: savedModel });
    }
    return options;
  }, [catalogModels, savedModel]);
  const profileModelActive = modelOverride === null && savedModel.length > 0;
  const selectedModel = models.find((model) => model.id === effectiveModelId);
  const thinkingOptions = selectedModel?.thinkingOptions ?? [];
  const savedThinking = selectedProfile?.thinkingOptionId?.trim() ?? "";
  const catalogDefaultThinking =
    selectedModel?.defaultThinkingOptionId ??
    thinkingOptions.find((option) => option.isDefault)?.id ??
    "";
  const effectiveThinkingId =
    thinkingOverride ?? (profileModelActive ? savedThinking : catalogDefaultThinking);
  const featureValues = selectedProfile?.featureValues ?? {};
  const mcpConfig = profilesQuery.data?.config as
    | { mcp?: { injectIntoAgents?: boolean } }
    | undefined;
  const toolsHint =
    role !== "peer" && profilesQuery.data && mcpConfig?.mcp?.injectIntoAgents !== true
      ? "Enable Paseo tools in Settings → host → Agents, then start a new agent for delegation."
      : null;
  const supervisorsQuery = useQuery({
    queryKey: ["slp", "watcher-supervisors", host.id, workspace?.id ?? ""],
    queryFn: async () => {
      if (!workspace) return [];
      const result = await paseo.agents.list({
        filter: { labels: { "slp.role": "supervisor" }, includeArchived: false },
        page: { limit: 200 },
      });
      return result.entries
        .map((entry) => entry.agent)
        .filter((agent) => agent.workspaceId === workspace.id);
    },
    enabled: role === "watcher" && Boolean(workspace),
    staleTime: 5_000,
  });
  const supervisors = useMemo(() => supervisorsQuery.data ?? [], [supervisorsQuery.data]);

  useEffect(() => {
    if (role !== "watcher") return;
    if (!supervisors.some((agent) => agent.id === watcherSupervisorId)) {
      setWatcherSupervisorId(supervisors[0]?.id ?? null);
    }
  }, [role, supervisors, watcherSupervisorId]);

  const createAgent = useMutation({
    // oxlint-disable-next-line complexity
    mutationFn: async () => {
      if (!workspace || !selectedProfile || !effectiveModelId || !prompt.trim()) {
        throw new Error("Choose a workspace and SLP profile, then enter a prompt.");
      }
      const cadenceMinutes = Number(watcherCadenceMinutes);
      if (
        role === "watcher" &&
        (!watcherSupervisorId ||
          !Number.isInteger(cadenceMinutes) ||
          cadenceMinutes < 1 ||
          cadenceMinutes > 59 ||
          !watcherStopCondition.trim())
      ) {
        throw new Error(
          "Choose the reporting Supervisor, a cadence from 1 to 59 minutes, and a stop condition.",
        );
      }
      const workspaceHandle = paseo.workspaces.ref(workspace.id);
      const launchConfig = {
        provider: `${selectedProfile.provider}/${effectiveModelId}`,
        ...(effectiveThinkingId ? { thinkingOptionId: effectiveThinkingId } : {}),
        ...(Object.keys(featureValues).length > 0 ? { featureValues } : {}),
      };
      if (role === "watcher" && watcherSupervisorId) {
        const existing = await paseo.agents.list({
          filter: {
            labels: {
              "slp.role": "watcher",
              [watcherSupervisorLabel]: watcherSupervisorId,
              [watcherScopeLabel]: workspace.id,
            },
            includeArchived: false,
          },
          page: { limit: 200 },
        });
        const existingWatcher = existing.entries[0]?.agent;
        if (existingWatcher) return paseo.agents.ref(existingWatcher);
      }
      const watcherAssignment =
        role === "watcher" && watcherSupervisorId
          ? `\n\n## Watcher assignment\n\nReporting Supervisor: ${watcherSupervisorId}\nAllowed workspace: ${workspace.id}\nSelected profile: ${selectedProfile.id}\nSelected provider/model: ${selectedProfile.provider}/${effectiveModelId}\nThinking budget: ${effectiveThinkingId || "provider default"}\nCadence: every ${cadenceMinutes} minutes (cron: */${cadenceMinutes} * * * *)\nExpiry: ${watcherExpiry.trim() || "none"}\nStop condition: ${watcherStopCondition.trim()}\n\nOn this first turn, call the Paseo MCP tool named create_heartbeat (never a provider-native scheduler or general schedule tool) to create or replace your own heartbeat named slp-watcher:${watcherSupervisorId}:${workspace.id} with the stated cron, quiet=true, a prompt beginning exactly with ${watcherSweepPromptPrefix} and continuing with one bounded incremental sweep under this assignment, and ${watcherExpiry.trim() ? `expiresIn=${watcherExpiry.trim()}` : "no expiry"}. Then perform the initial sweep. Repeating this launch or setup must retain one session and one named heartbeat.`
          : "";
      const agent = await workspaceHandle.agents.create({
        // The SDK splits provider/model before the SLP before-hook resolves
        // the role's provider-advertised execution boundary.
        config: launchConfig,
        ...(title.trim() ? { title: title.trim() } : {}),
        prompt: `${prompt.trim()}${watcherAssignment}`,
        ...(role === "watcher" && watcherSupervisorId ? { parent: watcherSupervisorId } : {}),
        labels: {
          "slp.role": role,
          "slp.profile": selectedProfile.id,
          ...(role === "peer" ? { "slp.subrole": peerSubrole } : {}),
          ...(role === "supervisor" || role === "watcher"
            ? {
                [attentionWatchLabel]: attentionWatchValue,
                ...(role === "watcher" && watcherSupervisorId
                  ? {
                      [watcherSupervisorLabel]: watcherSupervisorId,
                      [watcherScopeLabel]: workspace.id,
                      [watcherCadenceLabel]: String(cadenceMinutes),
                    }
                  : {}),
                ...(role === "supervisor" && recoveryLease
                  ? { [recoveryLeaseLabel]: recoveryLeaseValue }
                  : {}),
                ...(role === "supervisor" && notebookWriter
                  ? { [notebookWriterLabel]: notebookWriterValue }
                  : {}),
              }
            : {}),
        },
      });
      return agent;
    },
    onSuccess: (agent) => {
      toast.show(`${roleLabel(role)} agent launched`, { variant: "success" });
      if (agent.id) navigation?.openAgent({ agentId: agent.id });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        backgroundColor: theme.colors.surface0,
      },
      content: {
        padding: layout.compact ? 16 : 24,
        gap: layout.compact ? 12 : 16,
        maxWidth: 760,
        width: "100%" as const,
        alignSelf: "center" as const,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: layout.compact ? 22 : 28,
        fontWeight: "700" as const,
      },
      subtitle: {
        color: theme.colors.foregroundMuted,
        lineHeight: 20,
      },
      sectionLabel: {
        color: theme.colors.foreground,
        fontSize: 15,
        fontWeight: "600" as const,
      },
      roleRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 8,
      },
      roleButton: {
        borderColor: theme.colors.border,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 9,
        backgroundColor: theme.colors.surface1,
      },
      roleButtonSelected: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accent,
      },
      roleText: {
        color: theme.colors.foreground,
        fontWeight: "600" as const,
      },
      roleTextSelected: {
        color: theme.colors.accentForeground,
      },
      card: {
        borderColor: theme.colors.border,
        borderRadius: 10,
        borderWidth: 1,
        padding: 12,
        gap: 5,
        backgroundColor: theme.colors.surface1,
      },
      cardSelected: {
        borderColor: theme.colors.accent,
      },
      cardName: {
        color: theme.colors.foreground,
        fontSize: 16,
        fontWeight: "600" as const,
      },
      detail: {
        color: theme.colors.foregroundMuted,
        fontSize: 13,
        lineHeight: 18,
      },
      notes: {
        color: theme.colors.foregroundMuted,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 3,
      },
      inputLabel: {
        color: theme.colors.foreground,
        fontSize: 14,
        fontWeight: "600" as const,
      },
      input: {
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface2,
        borderColor: theme.colors.border,
        borderRadius: 8,
        borderWidth: 1,
        minHeight: 42,
        paddingHorizontal: 12,
        paddingVertical: 10,
      },
      prompt: {
        minHeight: layout.compact ? 110 : 140,
        textAlignVertical: "top" as const,
      },
      launchButton: {
        alignItems: "center" as const,
        backgroundColor: theme.colors.accent,
        borderRadius: 9,
        paddingHorizontal: 16,
        paddingVertical: 13,
      },
      launchButtonDisabled: {
        opacity: 0.45,
      },
      launchText: {
        color: theme.colors.accentForeground,
        fontWeight: "700" as const,
      },
      empty: {
        borderColor: theme.colors.border,
        borderRadius: 10,
        borderWidth: 1,
        padding: 16,
        gap: 10,
        backgroundColor: theme.colors.surface1,
      },
      error: {
        color: theme.colors.statusDanger,
        lineHeight: 20,
      },
      smallAction: {
        alignSelf: "flex-start" as const,
        borderColor: theme.colors.border,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 9,
      },
      smallActionText: {
        color: theme.colors.foreground,
        fontWeight: "600" as const,
      },
    }),
    [theme, layout.compact],
  );

  const watcherLaunchInvalid =
    role === "watcher" &&
    (!watcherSupervisorId ||
      !Number.isInteger(Number(watcherCadenceMinutes)) ||
      Number(watcherCadenceMinutes) < 1 ||
      Number(watcherCadenceMinutes) > 59 ||
      watcherStopCondition.trim().length === 0);
  const launchDisabled =
    createAgent.isPending ||
    !workspace ||
    !selectedProfile ||
    !effectiveModelId ||
    prompt.trim().length === 0 ||
    watcherLaunchInvalid;

  let workspaceContent: ReactElement;
  if (workspaceChoices === undefined) {
    workspaceContent = (
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Workspace</Text>
        <Text style={styles.detail}>{workspace?.name ?? "Workspace unavailable"}</Text>
      </View>
    );
  } else if (workspaceChoices.length === 0) {
    workspaceContent = (
      <View style={styles.empty}>
        <Text style={styles.sectionLabel}>No workspaces available</Text>
        <Text style={styles.subtitle}>
          Open or create a workspace in Paseo, then return here to launch an SLP agent.
        </Text>
      </View>
    );
  } else {
    workspaceContent = (
      <SettingsSelect
        label="Workspace"
        hint="The selected workspace receives the new agent."
        value={workspace?.id ?? workspaceChoices[0]?.id ?? ""}
        options={workspaceChoices.map((entry) => ({ label: entry.name, value: entry.id }))}
        onValueChange={(value) => onWorkspaceChange?.(value)}
        disabled={createAgent.isPending}
      />
    );
  }

  let profileContent: ReactElement;
  if (profilesQuery.isPending) {
    profileContent = <Text style={styles.subtitle}>Loading saved agent profiles…</Text>;
  } else if (profilesQuery.error) {
    profileContent = <Text style={styles.error}>{errorMessage(profilesQuery.error)}</Text>;
  } else if (profiles.length === 0) {
    profileContent = (
      <View style={styles.empty}>
        <Text style={styles.sectionLabel}>Create an agent profile first</Text>
        <Text style={styles.subtitle}>
          SLP uses the existing native profiles for provider, model, thinking, features, and notes.
          Open Settings → host → Agents → Agent profiles to create one, then map it to a role in SLP
          settings.
        </Text>
        {onOpenSettings ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open SLP profile settings"
            onPress={onOpenSettings}
            style={styles.smallAction}
          >
            <Text style={styles.smallActionText}>Open SLP settings</Text>
          </Pressable>
        ) : null}
      </View>
    );
  } else if (allowedProfiles.length === 0) {
    profileContent = (
      <View style={styles.empty}>
        <Text style={styles.sectionLabel}>No {roleLabel(role)} profile is allowed</Text>
        <Text style={styles.subtitle}>
          Map an existing native profile to {roleLabel(role)} in SLP settings. The native profile
          editor remains the place to change its model, thinking budget, or notes.
        </Text>
        {onOpenSettings ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Configure SLP profile roles"
            onPress={onOpenSettings}
            style={styles.smallAction}
          >
            <Text style={styles.smallActionText}>Configure role profiles</Text>
          </Pressable>
        ) : null}
      </View>
    );
  } else {
    profileContent = (
      <View style={{ gap: 8 }}>
        <Text style={styles.sectionLabel}>Saved profile</Text>
        {allowedProfiles.map((profile) => {
          const selected = profile.id === selectedProfile?.id;
          const notes = profileNotes(profile.notes);
          return (
            <Pressable
              key={profile.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setProfileId(profile.id)}
              style={[styles.card, selected && styles.cardSelected]}
            >
              <Text style={styles.cardName}>{profile.name}</Text>
              <Text style={styles.detail}>
                {profile.provider} · model: {displayModel(profile)} · thinking:{" "}
                {displayThinking(profile)}
              </Text>
              {notes ? <Text style={styles.notes}>{notes}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    );
  }

  const memory = projectMemoryQuery.data;
  let projectMemoryBody: ReactElement | null = null;
  if (projectMemoryQuery.isPending) {
    projectMemoryBody = (
      <Text style={styles.detail}>Checking Workspace Protocol and Supervisor Notebook…</Text>
    );
  } else if (projectMemoryQuery.error) {
    projectMemoryBody = <Text style={styles.error}>{errorMessage(projectMemoryQuery.error)}</Text>;
  } else if (memory) {
    projectMemoryBody = (
      <>
        <Text style={styles.detail}>
          Workspace Protocol: {memory.protocol.status} · Supervisor Notebook:{" "}
          {memory.notebook.status}
        </Text>
        <Text style={styles.detail} numberOfLines={2}>
          {memory.projectRoot}
        </Text>
        {memory.protocol.status === "missing" || memory.notebook.status === "missing" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bootstrap SLP project memory"
            accessibilityState={{ disabled: bootstrapMemory.isPending }}
            disabled={bootstrapMemory.isPending}
            onPress={() => bootstrapMemory.mutate()}
            style={styles.smallAction}
          >
            <Text style={styles.smallActionText}>
              {bootstrapMemory.isPending ? "Bootstrapping…" : "Bootstrap missing files"}
            </Text>
          </Pressable>
        ) : null}
        {memory.protocol.status === "blocked" || memory.notebook.status === "blocked" ? (
          <Text style={styles.error}>
            A target path is not a regular file. Resolve it before bootstrapping.
          </Text>
        ) : null}
      </>
    );
  }
  const projectMemoryContent = workspace ? (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>Project memory</Text>
      {projectMemoryBody}
    </View>
  ) : null;

  let modelContent: ReactElement | null = null;
  if (selectedProfile && models.length > 0) {
    modelContent = (
      <SettingsSelect
        label="Model override"
        hint={
          savedModel ? "Starts from the saved profile model." : "Uses a discovered provider model."
        }
        value={effectiveModelId}
        options={modelOptions}
        onValueChange={(value) => {
          setModelOverride(value);
          setThinkingOverride(null);
        }}
        disabled={createAgent.isPending}
      />
    );
  } else if (selectedProfile && modelsQuery.isFetching) {
    modelContent = (
      <Text style={styles.detail}>Discovering models for {selectedProfile.provider}…</Text>
    );
  } else if (selectedProfile && savedModel) {
    modelContent = <Text style={styles.detail}>Using saved model: {savedModel}</Text>;
  } else if (selectedProfile) {
    modelContent = (
      <Text style={styles.error}>
        No provider model was discovered. Update this profile with a model in native Agent profiles
        settings before launching.
      </Text>
    );
  }

  let thinkingContent: ReactElement | null = null;
  if (selectedProfile && thinkingOptions.length > 0) {
    thinkingContent = (
      <SettingsSelect
        label="Thinking override"
        hint={
          savedThinking
            ? "Starts from the saved profile thinking option."
            : "Uses the discovered model default."
        }
        value={effectiveThinkingId || thinkingOptions[0]?.id || ""}
        options={thinkingOptions.map((option) => ({ label: option.label, value: option.id }))}
        onValueChange={setThinkingOverride}
        disabled={createAgent.isPending}
      />
    );
  } else if (selectedProfile && savedThinking) {
    thinkingContent = (
      <Text style={styles.detail}>Using saved thinking option: {savedThinking}</Text>
    );
  }

  const taskContent = selectedProfile ? (
    <View style={{ gap: 10 }}>
      <Text style={styles.sectionLabel}>Task settings</Text>
      <Text style={styles.detail}>
        Permission mode: Full access via the provider&apos;s advertised SLP mode.
      </Text>
      {toolsHint ? <Text style={styles.detail}>{toolsHint}</Text> : null}
      {modelContent}
      {thinkingContent}
      {role === "supervisor" ? (
        <>
          <SettingsSwitch
            label="Project notebook writer"
            hint="Grant the single writer lease for this project's shared Supervisor Notebook. Other Supervisors return proposed records."
            value={notebookWriter}
            onValueChange={setNotebookWriter}
            disabled={createAgent.isPending}
          />
          <SettingsSwitch
            label="Delegated Lead recovery"
            hint="Allow this Supervisor to replace one Lead only under the exact recovery lease written in its task prompt."
            value={recoveryLease}
            onValueChange={setRecoveryLease}
            disabled={createAgent.isPending}
          />
        </>
      ) : null}
      {role === "supervisor" && recoveryLease ? (
        <Text style={styles.detail}>
          The prompt must name the incumbent Lead, workspace, allowed profile bounds, expiry, and
          stop condition. Missing lease terms block replacement.
        </Text>
      ) : null}
      {role === "watcher" ? (
        <View style={{ gap: 10 }}>
          {supervisors.length > 0 ? (
            <SettingsSelect
              label="Reporting Supervisor"
              hint="The Watcher reports only to this Supervisor in the selected workspace."
              value={watcherSupervisorId ?? ""}
              options={supervisors.map((agent) => ({
                label: agent.title || agent.id,
                value: agent.id,
              }))}
              onValueChange={setWatcherSupervisorId}
              disabled={createAgent.isPending}
            />
          ) : (
            <Text style={styles.error}>Launch a Supervisor in this workspace first.</Text>
          )}
          <Text style={styles.inputLabel}>Cadence in minutes (default 15)</Text>
          <TextInput
            value={watcherCadenceMinutes}
            onChangeText={setWatcherCadenceMinutes}
            keyboardType="number-pad"
            style={styles.input}
            editable={!createAgent.isPending}
          />
          <Text style={styles.inputLabel}>Expiry</Text>
          <TextInput
            value={watcherExpiry}
            onChangeText={setWatcherExpiry}
            placeholder="Optional, for example 12h or 7d"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
            editable={!createAgent.isPending}
          />
          <Text style={styles.inputLabel}>Stop condition</Text>
          <TextInput
            value={watcherStopCondition}
            onChangeText={setWatcherStopCondition}
            style={styles.input}
            editable={!createAgent.isPending}
          />
        </View>
      ) : null}
    </View>
  ) : null;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: 6 }}>
          <Text style={styles.title}>SLP launch</Text>
          <Text style={styles.subtitle}>
            Launch a bounded Supervisor, Watcher, Lead, or Peer agent from an existing Paseo
            profile. Models and budgets stay managed by the native Agent profiles settings.
          </Text>
        </View>

        {workspaceContent}

        {projectMemoryContent}

        <View style={{ gap: 8 }}>
          <Text style={styles.sectionLabel}>Role</Text>
          <View style={styles.roleRow}>
            {roles.map((candidate) => {
              const selected = candidate === role;
              return (
                <Pressable
                  key={candidate}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setRole(candidate)}
                  style={[styles.roleButton, selected && styles.roleButtonSelected]}
                >
                  <Text style={[styles.roleText, selected && styles.roleTextSelected]}>
                    {roleLabel(candidate)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {role === "peer" ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>Peer subrole</Text>
            <View style={styles.roleRow}>
              {peerSubroles.map((candidate) => {
                const selected = candidate === peerSubrole;
                return (
                  <Pressable
                    key={candidate}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setPeerSubrole(candidate)}
                    style={[styles.roleButton, selected && styles.roleButtonSelected]}
                  >
                    <Text style={[styles.roleText, selected && styles.roleTextSelected]}>
                      {roleLabel(candidate)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {profileContent}

        {taskContent}

        <View style={{ gap: 8 }}>
          <Text style={styles.inputLabel}>Task title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Optional title"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
            editable={!createAgent.isPending}
          />
          <Text style={styles.inputLabel}>Task prompt</Text>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe the bounded task, scope, and handback."
            placeholderTextColor={theme.colors.foregroundMuted}
            multiline
            style={[styles.input, styles.prompt]}
            editable={!createAgent.isPending}
          />
        </View>

        {createAgent.error ? (
          <Text style={styles.error}>{errorMessage(createAgent.error)}</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Launch ${roleLabel(role)} agent`}
          accessibilityState={{ disabled: launchDisabled }}
          disabled={launchDisabled}
          onPress={() => createAgent.mutate()}
          style={[styles.launchButton, launchDisabled && styles.launchButtonDisabled]}
        >
          <Text style={styles.launchText}>
            {createAgent.isPending ? "Launching…" : `Launch ${roleLabel(role)}`}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
