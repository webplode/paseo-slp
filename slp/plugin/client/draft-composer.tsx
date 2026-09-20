import { useQuery } from "@tanstack/react-query";
import type {
  PluginDraftComposerProfile,
  PluginDraftComposerProps,
  PluginDraftComposerSelection,
} from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import { ComposerSelect } from "@getpaseo/plugin/client/ui";
import { View, type ViewStyle } from "react-native";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  attentionWatchLabel,
  attentionWatchValue,
  getProfilePeerSubroles,
  getProfileRoles,
  peerSubroles,
  roleLabel,
  roles,
  SLP_PLUGIN_ID,
  type PeerSubrole,
  type Role,
} from "../shared/roles";

interface SavedProfile {
  id: string;
  name: string;
  provider: string;
  model?: string;
  modeId?: string;
  thinkingOptionId?: string;
  featureValues?: Record<string, unknown>;
  notes?: string;
}

const EMPTY_PROFILES: readonly SavedProfile[] = [];
const ROLE_OPTIONS = [
  { label: "None", value: "none" },
  ...roles.map((candidate) => ({ label: roleLabel(candidate), value: candidate })),
];
const PEER_SUBROLE_OPTIONS = [
  { label: "Choose specialization", value: "none" },
  ...peerSubroles.map((candidate) => ({ label: roleLabel(candidate), value: candidate })),
];

export function filterProfilesForRole(
  profiles: readonly SavedProfile[],
  role: Role,
  peerSubrole: PeerSubrole | null,
  availableProviders: readonly string[],
): SavedProfile[] {
  const providers = new Set(availableProviders);
  if (role === "peer" && !peerSubrole) return [];
  return profiles.filter((profile) => {
    if (!providers.has(profile.provider) || !getProfileRoles(profile.notes).includes(role)) {
      return false;
    }
    return (
      role !== "peer" || getProfilePeerSubroles(profile.notes).includes(peerSubrole as PeerSubrole)
    );
  });
}

export function toDraftComposerProfile(profile: SavedProfile): PluginDraftComposerProfile {
  return {
    id: profile.id,
    provider: profile.provider,
    ...(profile.model?.trim() ? { modelId: profile.model.trim() } : {}),
    ...(profile.modeId?.trim() ? { modeId: profile.modeId.trim() } : {}),
    ...(profile.thinkingOptionId?.trim()
      ? { thinkingOptionId: profile.thinkingOptionId.trim() }
      : {}),
    ...(profile.featureValues ? { featureValues: profile.featureValues } : {}),
  };
}

export function retainSelectedDraftProfile(
  selection: PluginDraftComposerSelection | undefined,
  selectedProfileId: string | undefined,
): PluginDraftComposerProfile | undefined {
  return selection?.profile?.id === selectedProfileId ? selection?.profile : undefined;
}

function roleFromSelection(selection: PluginDraftComposerSelection | undefined): Role | null {
  const value = selection?.labels?.["slp.role"];
  return roles.includes(value as Role) ? (value as Role) : null;
}

function peerSubroleFromSelection(
  selection: PluginDraftComposerSelection | undefined,
): PeerSubrole | null {
  const value = selection?.labels?.["slp.subrole"];
  return peerSubroles.includes(value as PeerSubrole) ? (value as PeerSubrole) : null;
}

function labelsForSelection(role: Role, peerSubrole: PeerSubrole | null, profileId: string) {
  return {
    "slp.role": role,
    "slp.profile": profileId,
    ...(role === "peer" && peerSubrole ? { "slp.subrole": peerSubrole } : {}),
    ...(role === "supervisor" ? { [attentionWatchLabel]: attentionWatchValue } : {}),
  };
}

function intentLabelsForSelection(role: Role, peerSubrole: PeerSubrole | null) {
  return {
    "slp.role": role,
    ...(role === "peer" && peerSubrole ? { "slp.subrole": peerSubrole } : {}),
  };
}

function selectionError(role: Role, peerSubrole: PeerSubrole | null): string {
  if (role === "watcher") {
    return "Watcher requires an exact reporting Supervisor, workspace scope, cadence, expiry, and stop condition.";
  }
  if (role === "peer" && !peerSubrole) {
    return "Choose a Peer specialization before choosing a profile.";
  }
  return "Choose an SLP profile enabled for this role.";
}

export function SlpDraftComposer({
  host,
  workspaceId,
  availableProviders,
  disabled = false,
  selection,
  selectedProfileId,
  clearProfileSelection,
  onSelectionChange,
  openSettings,
}: PluginDraftComposerProps): ReactElement {
  const paseo = usePaseo();
  const [role, setRole] = useState<Role | null>(() => roleFromSelection(selection));
  const [peerSubrole, setPeerSubrole] = useState<PeerSubrole | null>(() =>
    peerSubroleFromSelection(selection),
  );
  const profilesQuery = useQuery({
    queryKey: ["slp", "draft-profiles", host.id, workspaceId ?? null],
    queryFn: () => paseo.config.get(),
    staleTime: 15_000,
  });
  const profiles = (profilesQuery.data?.config.agentProfiles ??
    EMPTY_PROFILES) as readonly SavedProfile[];
  const allowedProfiles = useMemo(
    () => (role ? filterProfilesForRole(profiles, role, peerSubrole, availableProviders) : []),
    [availableProviders, peerSubrole, profiles, role],
  );
  const allowedProfileIds = useMemo(
    () => (role ? allowedProfiles.map((profile) => profile.id) : undefined),
    [allowedProfiles, role],
  );
  const selectedProfile =
    allowedProfiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const retainedProfile = retainSelectedDraftProfile(selection, selectedProfileId);
  const needsPeerSubrole = role === "peer" && !peerSubrole;

  useEffect(() => {
    if (!role) {
      onSelectionChange({ ready: true });
      return;
    }
    if (profilesQuery.isLoading) {
      onSelectionChange({
        ready: false,
        profile: retainedProfile,
        dependencies: [SLP_PLUGIN_ID],
        profileIds: allowedProfileIds,
        ...(role ? { labels: intentLabelsForSelection(role, peerSubrole) } : {}),
        error: "Loading SLP profiles…",
      });
      return;
    }
    if (profilesQuery.isError) {
      onSelectionChange({
        ready: false,
        profile: retainedProfile,
        dependencies: [SLP_PLUGIN_ID],
        profileIds: allowedProfileIds,
        labels: intentLabelsForSelection(role, peerSubrole),
        error: "SLP profiles could not be loaded. Open profile settings and retry.",
      });
      return;
    }
    if (role === "watcher") {
      onSelectionChange({
        ready: false,
        profile: retainedProfile,
        dependencies: [SLP_PLUGIN_ID],
        profileIds: allowedProfileIds,
        labels: intentLabelsForSelection(role, peerSubrole),
        error: selectionError(role, peerSubrole),
      });
      return;
    }
    if (!selectedProfile) {
      onSelectionChange({
        ready: false,
        // Native provider inventory may still be loading, or membership may
        // have been removed. Keep explicit identity; neither case is admission.
        profile: retainedProfile,
        dependencies: [SLP_PLUGIN_ID],
        profileIds: allowedProfileIds,
        labels: intentLabelsForSelection(role, peerSubrole),
        error:
          !needsPeerSubrole && allowedProfiles.length === 0
            ? "No native profiles are enabled for this role. Open SLP profile settings to add membership."
            : selectionError(role, peerSubrole),
      });
      return;
    }
    onSelectionChange({
      ready: true,
      dependencies: [SLP_PLUGIN_ID],
      profileIds: allowedProfileIds,
      profile: toDraftComposerProfile(selectedProfile),
      labels: labelsForSelection(role, peerSubrole, selectedProfile.id),
    });
  }, [
    allowedProfileIds,
    allowedProfiles.length,
    onSelectionChange,
    needsPeerSubrole,
    peerSubrole,
    profilesQuery.isError,
    profilesQuery.isLoading,
    role,
    selectedProfile,
    retainedProfile,
  ]);

  const chooseRole = useCallback(
    (value: string) => {
      if (disabled) return;
      setRole(value === "none" ? null : (value as Role));
      setPeerSubrole(null);
      clearProfileSelection?.();
    },
    [clearProfileSelection, disabled],
  );
  const choosePeerSubrole = useCallback(
    (value: string) => {
      if (disabled) return;
      setPeerSubrole(value === "none" ? null : (value as PeerSubrole));
      clearProfileSelection?.();
    },
    [clearProfileSelection, disabled],
  );
  const containerStyle = useMemo<ViewStyle>(
    () => ({
      minWidth: 0,
      flexShrink: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
    }),
    [],
  );
  let menuMessage: string | undefined;
  if (role && !selectedProfile) {
    menuMessage = selection?.error ?? selectionError(role, peerSubrole);
  }
  const menuAction = useMemo(() => {
    if (!openSettings || !role) return undefined;
    if (!needsPeerSubrole && allowedProfiles.length === 0) {
      return {
        label: "Configure profiles",
        onPress: openSettings,
        disabled,
      };
    }
    return undefined;
  }, [allowedProfiles.length, disabled, needsPeerSubrole, openSettings, role]);

  return (
    <View testID="slp-draft-composer" style={containerStyle}>
      <ComposerSelect
        label="SLP role"
        value={role ?? "none"}
        displayValue={role ? roleLabel(role) : "Role"}
        icon="Waypoints"
        options={ROLE_OPTIONS}
        disabled={disabled}
        onValueChange={chooseRole}
        message={menuMessage}
        messageTone={profilesQuery.isError ? "danger" : "muted"}
        action={menuAction}
        testID="slp-role-select"
      />
      {role === "peer" ? (
        <ComposerSelect
          label="Peer specialization"
          value={peerSubrole ?? "none"}
          displayValue={peerSubrole ? roleLabel(peerSubrole) : "Specialization"}
          icon="Users"
          options={PEER_SUBROLE_OPTIONS}
          disabled={disabled}
          onValueChange={choosePeerSubrole}
          testID="slp-peer-specialization-select"
        />
      ) : null}
    </View>
  );
}
