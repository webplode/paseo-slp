import { useCallback, useMemo, useState } from "react";
import type { PluginDraftComposerSelection } from "@getpaseo/plugin/client";
import {
  useWorkspaceDraftSubmissionStore,
  useWorkspaceDraftPluginSelectionsHydrated,
} from "@/stores/workspace-draft-submission-store";
import { useInstalledPlugins } from "./registry";
import type { InstalledPlugin } from "./types";
import {
  invalidateDraftComposerSelection,
  resolveDraftComposerSelections,
} from "./draft-composer-core";

const EMPTY_SELECTIONS: Record<string, PluginDraftComposerSelection | undefined> = {};

export interface InstalledPluginDraftComposer {
  installation: InstalledPlugin;
  contribution: NonNullable<InstalledPlugin["draftComposers"]>[number];
}

/**
 * Draft contributions are host-scoped. A draft must never render controls from
 * a plugin installed on another daemon connection.
 */
export function usePluginDraftComposers(serverId: string): InstalledPluginDraftComposer[] {
  const installed = useInstalledPlugins();
  return useMemo(
    () =>
      installed
        .filter((plugin) => plugin.serverId === serverId)
        .flatMap((installation) =>
          (installation.draftComposers ?? []).map((contribution) => ({
            installation,
            contribution,
          })),
        ),
    [installed, serverId],
  );
}

/** Keep plugin intent in the draft store so changing tabs cannot clear a binding. */
export function usePluginDraftComposerState({
  draftId,
  entries,
  pendingSelection,
}: {
  draftId: string;
  entries: readonly InstalledPluginDraftComposer[];
  pendingSelection: PluginDraftComposerSelection | null | undefined;
}) {
  const isHydrated = useWorkspaceDraftPluginSelectionsHydrated();
  const selections = useWorkspaceDraftSubmissionStore(
    (state) => state.pluginSelectionsByDraftId[draftId] ?? EMPTY_SELECTIONS,
  );
  const restoredProfileId = useMemo(
    () => Object.values(selections).find((selection) => selection?.profile)?.profile?.id,
    [selections],
  );
  const [profileOverride, setProfileOverride] = useState<{
    draftId: string;
    profileId?: string;
  } | null>(null);
  const nativeProfileId =
    profileOverride?.draftId === draftId ? profileOverride.profileId : restoredProfileId;
  const selectedProfileId = pendingSelection?.profile?.id ?? nativeProfileId;
  const setSelectedProfileId = useCallback(
    (profileId: string | undefined) => {
      setProfileOverride({ draftId, profileId });
    },
    [draftId],
  );
  const activeKeys = useMemo(
    () => new Set(entries.map((entry) => `${entry.installation.id}:${entry.contribution.id}`)),
    [entries],
  );
  const resolved = useMemo(
    () => resolveDraftComposerSelections(selections, activeKeys),
    [activeKeys, selections],
  );
  const resolvedError =
    pendingSelection?.ready === false
      ? (pendingSelection.error ?? "Complete the plugin draft controls before creating an agent.")
      : resolved.error;
  const recordSelection = useCallback(
    (key: string, selection: PluginDraftComposerSelection) => {
      const store = useWorkspaceDraftSubmissionStore.getState();
      const current = store.pluginSelectionsByDraftId[draftId] ?? EMPTY_SELECTIONS;
      if (JSON.stringify(current[key]) === JSON.stringify(selection)) return;
      store.setDraftPluginSelections({ draftId, selections: { ...current, [key]: selection } });
    },
    [draftId],
  );
  const clearProfileSelection = useCallback(
    () => setSelectedProfileId(undefined),
    [setSelectedProfileId],
  );
  const invalidateForProvider = useCallback(
    (provider: string) => {
      const store = useWorkspaceDraftSubmissionStore.getState();
      const current = store.pluginSelectionsByDraftId[draftId] ?? EMPTY_SELECTIONS;
      const next = { ...current };
      let changed = false;
      for (const [key, selection] of Object.entries(current)) {
        if (!selection?.profile || selection.profile.provider === provider) continue;
        next[key] = invalidateDraftComposerSelection(
          selection,
          "The selected plugin profile no longer matches the provider. Choose a compatible profile again.",
        );
        changed = true;
      }
      if (!changed) return;
      clearProfileSelection();
      store.setDraftPluginSelections({ draftId, selections: next });
    },
    [clearProfileSelection, draftId],
  );
  const clearSelections = useCallback(() => {
    useWorkspaceDraftSubmissionStore.getState().clearDraftPluginSelections({ draftId });
    clearProfileSelection();
  }, [clearProfileSelection, draftId]);
  return {
    isHydrated,
    selections,
    selectedProfileId,
    setSelectedProfileId,
    clearProfileSelection,
    recordSelection,
    invalidateForProvider,
    clearSelections,
    selection: pendingSelection ?? resolved.selection,
    selectionError: isHydrated ? resolvedError : "Loading saved draft controls…",
  };
}
