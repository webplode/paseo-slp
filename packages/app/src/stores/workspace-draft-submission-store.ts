import { create } from "zustand";
import { persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import type { ComposerAttachment } from "@/attachments/types";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import type { WorkspaceDraftTabSetup } from "@/workspace-tabs/model";
import type { PluginDraftComposerSelection } from "@getpaseo/plugin/client";

export interface PendingWorkspaceDraftSubmission {
  serverId: string;
  workspaceId: string;
  draftId: string;
  text: string;
  attachments: ComposerAttachment[];
  cwd: string;
  provider: AgentProvider;
  clientMessageId: string;
  timestamp: number;
  modeId?: string;
  model?: string;
  thinkingOptionId?: string;
  featureValues?: Record<string, unknown>;
  pluginSelection?: PluginDraftComposerSelection;
  allowEmptyText?: boolean;
}

export interface PendingWorkspaceDraftSetup {
  setup: WorkspaceDraftTabSetup;
  sourceDirectory?: string | null;
}

interface WorkspaceDraftSubmissionState {
  pendingByDraftId: Record<string, PendingWorkspaceDraftSubmission>;
  setupByDraftId: Record<string, PendingWorkspaceDraftSetup>;
  pluginSelectionsByDraftId: Record<
    string,
    Record<string, PluginDraftComposerSelection | undefined>
  >;
  setPending: (submission: PendingWorkspaceDraftSubmission) => void;
  setDraftSetup: (input: {
    draftId: string;
    setup: WorkspaceDraftTabSetup;
    sourceDirectory?: string | null;
  }) => void;
  clearDraftSetup: (input: { draftId: string }) => void;
  setDraftPluginSelections: (input: {
    draftId: string;
    selections: Record<string, PluginDraftComposerSelection | undefined>;
  }) => void;
  clearDraftPluginSelections: (input: { draftId: string }) => void;
  consumePending: (input: {
    serverId: string;
    workspaceId: string;
    draftId: string;
  }) => PendingWorkspaceDraftSubmission | null;
}

function matchesPendingSubmission(
  pending: PendingWorkspaceDraftSubmission | null | undefined,
  input: { serverId: string; workspaceId: string; draftId: string },
): pending is PendingWorkspaceDraftSubmission {
  return (
    pending?.serverId === input.serverId &&
    pending.workspaceId === input.workspaceId &&
    pending.draftId === input.draftId
  );
}

function normalizeDraftId(draftId: string): string {
  return draftId.trim();
}

const PersistedDraftPluginSelectionsSchema: z.ZodType<
  Pick<WorkspaceDraftSubmissionState, "pluginSelectionsByDraftId">
> = z.object({
  pluginSelectionsByDraftId: z.record(
    z.string(),
    z.record(
      z.string(),
      z
        .object({
          ready: z.boolean(),
          profile: z
            .object({
              id: z.string(),
              provider: z.string(),
              modelId: z.string().optional(),
              modeId: z.string().optional(),
              thinkingOptionId: z.string().optional(),
              featureValues: z.record(z.string(), z.unknown()).optional(),
            })
            .optional(),
          profileIds: z.array(z.string()).optional(),
          dependencies: z.array(z.string()).optional(),
          labels: z.record(z.string(), z.string()).optional(),
          error: z.string().optional(),
        })
        .optional(),
    ),
  ),
});

export const useWorkspaceDraftSubmissionStore = create<WorkspaceDraftSubmissionState>()(
  persist(
    (set, get) => ({
      pendingByDraftId: {},
      setupByDraftId: {},
      pluginSelectionsByDraftId: {},
      setPending: (submission) =>
        set((state) => ({
          pendingByDraftId: {
            ...state.pendingByDraftId,
            [submission.draftId]: submission,
          },
        })),
      setDraftSetup: ({ draftId, setup, sourceDirectory }) => {
        const normalizedDraftId = normalizeDraftId(draftId);
        if (!normalizedDraftId) return;
        set((state) => ({
          setupByDraftId: {
            ...state.setupByDraftId,
            [normalizedDraftId]: { setup, sourceDirectory: sourceDirectory ?? null },
          },
        }));
      },
      clearDraftSetup: ({ draftId }) => {
        const normalizedDraftId = normalizeDraftId(draftId);
        if (!normalizedDraftId) return;
        set((state) => {
          if (!state.setupByDraftId[normalizedDraftId]) return state;
          const { [normalizedDraftId]: _removed, ...setupByDraftId } = state.setupByDraftId;
          return { setupByDraftId };
        });
      },
      setDraftPluginSelections: ({ draftId, selections }) => {
        const normalizedDraftId = normalizeDraftId(draftId);
        if (!normalizedDraftId) return;
        set((state) => ({
          pluginSelectionsByDraftId: {
            ...state.pluginSelectionsByDraftId,
            [normalizedDraftId]: selections,
          },
        }));
      },
      clearDraftPluginSelections: ({ draftId }) => {
        const normalizedDraftId = normalizeDraftId(draftId);
        if (!normalizedDraftId) return;
        set((state) => {
          if (!state.pluginSelectionsByDraftId[normalizedDraftId]) return state;
          const { [normalizedDraftId]: _removed, ...pluginSelectionsByDraftId } =
            state.pluginSelectionsByDraftId;
          return { pluginSelectionsByDraftId };
        });
      },
      consumePending: (input) => {
        const pending = get().pendingByDraftId[input.draftId];
        if (!matchesPendingSubmission(pending, input)) {
          return null;
        }
        set((state) => {
          if (!matchesPendingSubmission(state.pendingByDraftId[input.draftId], input)) {
            return state;
          }
          const { [input.draftId]: _removed, ...rest } = state.pendingByDraftId;
          return { pendingByDraftId: rest };
        });
        return pending;
      },
    }),
    {
      name: "workspace-draft-plugin-selections",
      storage: createValidatedPersistStorage(AsyncStorage, PersistedDraftPluginSelectionsSchema),
      // Pending messages and creation setup retain their existing runtime lifetime.
      partialize: ({ pluginSelectionsByDraftId }) => ({ pluginSelectionsByDraftId }),
    },
  ),
);

export function useWorkspaceDraftPluginSelectionsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    useWorkspaceDraftSubmissionStore.persist.hasHydrated(),
  );
  useEffect(() => {
    if (useWorkspaceDraftSubmissionStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useWorkspaceDraftSubmissionStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
