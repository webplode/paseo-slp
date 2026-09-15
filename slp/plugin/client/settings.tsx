// These small forms render on user input; inline row handlers avoid per-row memoization machinery.
/* oxlint-disable eslint-plugin-react-perf/jsx-no-new-function-as-prop, eslint-plugin-react-perf/jsx-no-new-object-as-prop, eslint-plugin-react-perf/jsx-no-new-array-as-prop */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { ScrollView, TextInput } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo, useState, type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import {
  getProfilePeerSubroles,
  getProfileRoles,
  peerSubroles,
  roleLabel,
  roles,
  setProfileMembership,
  type PeerSubrole,
  type Role,
} from "../shared/roles";

interface SavedProfile {
  id: string;
  name: string;
  provider: string;
  model?: string;
  thinkingOptionId?: string;
  notes?: string;
}

const emptyProfiles: SavedProfile[] = [];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function profileHint(profile: SavedProfile): string {
  const model = profile.model?.trim() || "provider default";
  const thinking = profile.thinkingOptionId?.trim() || "provider default";
  return `${profile.provider} · ${model} · thinking ${thinking}`;
}

export function RoleProfilesSettings({ theme, layout, host }: PluginSurfaceProps): ReactElement {
  const paseo = usePaseo();
  const queryClient = useQueryClient();
  const queryKey = ["slp", "agent-profiles", host.id];
  const [activeRole, setActiveRole] = useState<Role>("supervisor");
  const [activePeerSubrole, setActivePeerSubrole] = useState<PeerSubrole>("engineer");
  const [profileSearch, setProfileSearch] = useState("");
  const profilesQuery = useQuery({
    queryKey,
    queryFn: () => paseo.config.get(),
    staleTime: 15_000,
  });
  const profiles = (profilesQuery.data?.config.agentProfiles ?? emptyProfiles) as SavedProfile[];
  const { refetch: refetchProfiles } = profilesQuery;

  const updateMembership = useMutation({
    mutationFn: async ({
      profileId,
      role,
      enabled,
      subrole,
    }: {
      profileId: string;
      role: Role;
      enabled: boolean;
      subrole?: PeerSubrole;
    }) => {
      // Re-read immediately before patching so a role toggle preserves every
      // native profile field and wins against stale screen state.
      const latest = await paseo.config.get();
      const latestProfiles = (latest.config.agentProfiles ?? []) as SavedProfile[];
      const profile = latestProfiles.find((entry) => entry.id === profileId);
      if (!profile) throw new Error("This agent profile no longer exists. Reload SLP settings.");
      const nextProfiles = latestProfiles.map((entry) =>
        entry.id === profileId
          ? Object.assign({}, entry, {
              notes: setProfileMembership(entry.notes, role, enabled, subrole),
            })
          : entry,
      );
      const patch = { agentProfiles: nextProfiles } as Parameters<typeof paseo.config.patch>[0];
      const result = await paseo.config.patch(patch);
      return result.config.agentProfiles ?? [];
    },
    onSuccess: (nextProfiles) => {
      queryClient.setQueryData(
        queryKey,
        (current: { requestId: string; config: unknown } | undefined) =>
          current
            ? { ...current, config: { ...(current.config as object), agentProfiles: nextProfiles } }
            : current,
      );
    },
  });

  const filteredProfiles = useMemo(() => {
    const normalizedSearch = profileSearch.trim().toLocaleLowerCase();
    if (!normalizedSearch) return profiles;
    return profiles.filter((profile) => {
      const haystack = [
        profile.name,
        profile.provider,
        profile.model,
        profile.thinkingOptionId,
        profile.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [profileSearch, profiles]);

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
      body: {
        color: theme.colors.foregroundMuted,
        lineHeight: 20,
      },
      error: {
        color: theme.colors.statusDanger,
        lineHeight: 20,
      },
      empty: {
        borderColor: theme.colors.border,
        borderRadius: 10,
        borderWidth: 1,
        padding: 16,
        gap: 8,
        backgroundColor: theme.colors.surface1,
      },
      search: {
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
      },
      tabRail: {
        flexDirection: "row" as const,
        gap: 4,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 10,
        padding: 4,
        backgroundColor: theme.colors.surface1,
      },
      tab: {
        flex: 1,
        alignItems: "center" as const,
        borderRadius: 7,
        paddingHorizontal: 10,
        paddingVertical: 8,
      },
      tabSelected: {
        backgroundColor: theme.colors.surface0,
      },
      tabText: {
        color: theme.colors.foregroundMuted,
        fontWeight: "600" as const,
      },
      tabTextSelected: {
        color: theme.colors.foreground,
      },
      subroleRail: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 6,
      },
      subroleTab: {
        borderColor: theme.colors.border,
        borderRadius: 7,
        borderWidth: 1,
        paddingHorizontal: layout.compact ? 8 : 12,
        paddingVertical: 7,
      },
      subroleTabSelected: {
        backgroundColor: theme.colors.surface1,
        borderColor: theme.colors.foregroundMuted,
      },
      subroleText: {
        color: theme.colors.foregroundMuted,
        fontSize: 13,
        fontWeight: "600" as const,
      },
      subroleTextSelected: {
        color: theme.colors.foreground,
      },
    }),
    [theme, layout.compact],
  );
  const reloadProfiles = useCallback(() => {
    void refetchProfiles();
  }, [refetchProfiles]);

  let profileContent: ReactElement;
  if (profilesQuery.isPending) {
    profileContent = <Text style={styles.body}>Loading native agent profiles…</Text>;
  } else if (profilesQuery.error) {
    profileContent = (
      <View style={styles.empty}>
        <Text style={styles.error}>{errorMessage(profilesQuery.error)}</Text>
        <SettingsAction
          label="Agent profiles"
          actionLabel="Reload"
          onPress={reloadProfiles}
          disabled={profilesQuery.isFetching}
        />
      </View>
    );
  } else if (profiles.length === 0) {
    profileContent = (
      <View style={styles.empty}>
        <Text style={styles.body}>
          No saved profiles are available on this host. Create one in Settings → host → Agents →
          Agent profiles, then reload this screen.
        </Text>
        <SettingsAction
          label="Profiles"
          hint="Configure the model, thinking budget, and task guidance in Agent profiles."
          actionLabel="Reload"
          onPress={reloadProfiles}
          disabled={profilesQuery.isFetching}
        />
      </View>
    );
  } else {
    profileContent = (
      <SettingsSection
        title={`${roleLabel(activeRole === "peer" ? activePeerSubrole : activeRole)} profiles`}
        info={
          activeRole === "peer"
            ? `Choose which profiles are available for the ${roleLabel(activePeerSubrole)} Peer subrole.`
            : `Choose which profiles are available for ${roleLabel(activeRole)}.`
        }
      >
        <TextInput
          accessibilityLabel="Search profiles"
          value={profileSearch}
          onChangeText={setProfileSearch}
          placeholder="Search profiles…"
          style={styles.search}
        />
        <SettingsCard>
          {filteredProfiles.length > 0 ? (
            filteredProfiles.map((profile) => {
              const selected =
                activeRole === "peer"
                  ? getProfilePeerSubroles(profile.notes).includes(activePeerSubrole)
                  : getProfileRoles(profile.notes).includes(activeRole);
              return (
                <SettingsSwitch
                  key={profile.id}
                  label={profile.name}
                  hint={profileHint(profile)}
                  value={selected}
                  onValueChange={(enabled) => {
                    updateMembership.mutate({
                      profileId: profile.id,
                      role: activeRole,
                      enabled,
                      ...(activeRole === "peer" ? { subrole: activePeerSubrole } : {}),
                    });
                  }}
                  disabled={updateMembership.isPending}
                />
              );
            })
          ) : (
            <Text style={styles.body}>No saved profiles match this search.</Text>
          )}
        </SettingsCard>
      </SettingsSection>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: 6 }}>
          <Text style={styles.title}>SLP profile roles</Text>
          <Text style={styles.body}>
            Enable saved profiles for each role. Manage their models and thinking budgets in
            Settings → Agents → Agent profiles.
          </Text>
        </View>

        <View style={styles.tabRail}>
          {roles.map((role) => {
            const selected = role === activeRole;
            return (
              <Pressable
                key={role}
                accessibilityRole="tab"
                accessibilityLabel={`${roleLabel(role)} profiles`}
                accessibilityState={{ selected }}
                aria-selected={selected}
                onPress={() => setActiveRole(role)}
                style={[styles.tab, selected && styles.tabSelected]}
              >
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                  {roleLabel(role)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeRole === "peer" ? (
          <View style={styles.subroleRail}>
            {peerSubroles.map((subrole) => {
              const selected = subrole === activePeerSubrole;
              return (
                <Pressable
                  key={subrole}
                  accessibilityRole="tab"
                  accessibilityLabel={`${roleLabel(subrole)} Peer profiles`}
                  accessibilityState={{ selected }}
                  aria-selected={selected}
                  onPress={() => setActivePeerSubrole(subrole)}
                  style={[styles.subroleTab, selected && styles.subroleTabSelected]}
                >
                  <Text style={[styles.subroleText, selected && styles.subroleTextSelected]}>
                    {roleLabel(subrole)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {profileContent}

        {updateMembership.error ? (
          <Text style={styles.error}>{errorMessage(updateMembership.error)}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
