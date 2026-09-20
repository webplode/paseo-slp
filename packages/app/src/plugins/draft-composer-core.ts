import type {
  PluginDraftComposerProfile,
  PluginDraftComposerSelection,
} from "@getpaseo/plugin/client";

export interface ResolvedDraftComposerSelection {
  labels?: Readonly<Record<string, string>>;
  profile?: PluginDraftComposerProfile;
  profileIds?: readonly string[];
  dependencies?: readonly string[];
}

export function intersectDraftComposerProfileIds(
  filters: readonly (readonly string[])[],
): readonly string[] | undefined {
  if (filters.length === 0) return undefined;
  let result = new Set(filters[0] ?? []);
  for (const filter of filters.slice(1)) {
    const allowed = new Set(filter);
    result = new Set([...result].filter((id) => allowed.has(id)));
  }
  return [...result];
}

function draftComposerMetadata(
  labels: Record<string, string>,
  profileIds: readonly string[] | undefined,
  dependencies: readonly string[],
): ResolvedDraftComposerSelection | null {
  const hasLabels = Object.keys(labels).length > 0;
  if (!hasLabels && profileIds === undefined && dependencies.length === 0) return null;
  return {
    ...(hasLabels ? { labels } : {}),
    ...(profileIds !== undefined ? { profileIds } : {}),
    ...(dependencies.length > 0 ? { dependencies } : {}),
  };
}

export function resolveDraftComposerSelections(
  selections: Readonly<Record<string, PluginDraftComposerSelection | undefined>>,
  activeKeys?: ReadonlySet<string>,
): { selection: ResolvedDraftComposerSelection | null; error: string | null } {
  const staleKey = activeKeys
    ? Object.entries(selections).find(
        ([key, selection]) =>
          selection !== undefined &&
          !activeKeys.has(key) &&
          (!selection.ready ||
            selection.profile !== undefined ||
            selection.profileIds !== undefined ||
            Object.keys(selection.labels ?? {}).length > 0 ||
            (selection.dependencies?.length ?? 0) > 0),
      )?.[0]
    : undefined;
  const values = Object.values(selections).filter(
    (selection): selection is PluginDraftComposerSelection => selection !== undefined,
  );
  const labels: Record<string, string> = {};
  const dependencies = [...new Set(values.flatMap((selection) => selection.dependencies ?? []))];
  let conflictingLabel: string | null = null;
  for (const selection of values) {
    for (const [key, value] of Object.entries(selection.labels ?? {})) {
      const existing = labels[key];
      if (existing !== undefined && existing !== value) {
        conflictingLabel = key;
        continue;
      }
      labels[key] = value;
    }
  }
  const filters = values
    .map((selection) => selection.profileIds)
    .filter((filter): filter is readonly string[] => Array.isArray(filter));
  const profileIds = intersectDraftComposerProfileIds(filters);
  const selectionWithoutProfile = draftComposerMetadata(labels, profileIds, dependencies);
  if (conflictingLabel) {
    return {
      selection: selectionWithoutProfile,
      error: `Plugin draft controls disagree about ${conflictingLabel}.`,
    };
  }
  if (staleKey) {
    return {
      selection: selectionWithoutProfile,
      error:
        "A plugin draft control is no longer available. Reopen the draft before creating an agent.",
    };
  }
  const incomplete = values.find((selection) => !selection.ready);
  if (incomplete) {
    return {
      selection: selectionWithoutProfile,
      error: incomplete.error ?? "Complete the plugin draft controls before creating an agent.",
    };
  }

  const profiles = values
    .map((selection) => selection.profile)
    .filter((profile): profile is PluginDraftComposerProfile => profile !== undefined);
  const firstProfile = profiles[0];
  if (firstProfile && profiles.some((profile) => profile.id !== firstProfile.id)) {
    return {
      selection: selectionWithoutProfile,
      error: "Choose one compatible plugin profile before creating an agent.",
    };
  }
  return {
    selection: firstProfile
      ? { ...selectionWithoutProfile, profile: firstProfile }
      : selectionWithoutProfile,
    error: null,
  };
}

export function invalidateDraftComposerSelection(
  selection: PluginDraftComposerSelection | undefined,
  error: string,
): PluginDraftComposerSelection {
  return {
    ready: false,
    ...(selection?.profileIds ? { profileIds: selection.profileIds } : {}),
    ...(selection?.dependencies ? { dependencies: selection.dependencies } : {}),
    ...(selection?.labels ? { labels: selection.labels } : {}),
    error,
  };
}
