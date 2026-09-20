import type { PluginDraftComposerSelection } from "@getpaseo/plugin/client";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import type { ResolvedDraftComposerSelection } from "@/plugins/draft-composer-core";

const NEW_WORKSPACE_PLUGIN_DRAFT_PREFIX = "new-workspace-plugin";
const NEW_WORKSPACE_CONTEXT = "new-workspace";
const NO_PROJECT_CONTEXT = "no-project";

function encodeContext(value: string): string {
  return encodeURIComponent(value.trim() || "unknown");
}

/**
 * Plugin selections live longer than this screen, so the store key includes
 * every pre-workspace identity that can change without creating a workspace.
 * It deliberately contains no fabricated workspace id.
 */
export function buildNewWorkspacePluginDraftId(input: {
  draftId?: string;
  serverId: string;
  projectViewKey?: string | null;
}): string {
  return [
    NEW_WORKSPACE_PLUGIN_DRAFT_PREFIX,
    encodeContext(input.serverId),
    encodeContext(input.projectViewKey ?? NO_PROJECT_CONTEXT),
    encodeContext(input.draftId ?? NEW_WORKSPACE_CONTEXT),
  ].join(":");
}

/**
 * Turn the resolved plugin metadata into the pending request contract. An
 * explicit plugin binding must remain explicit all the way to creation.
 */
export function resolveNewWorkspacePluginSelection(input: {
  selection: ResolvedDraftComposerSelection | null;
  selectionError: string | null;
  provider: AgentProvider;
}): PluginDraftComposerSelection | undefined {
  if (input.selectionError) {
    throw new Error(input.selectionError);
  }
  if (!input.selection) return undefined;
  if (input.selection.profile && input.selection.profile.provider !== input.provider) {
    throw new Error(
      "The selected plugin profile no longer matches the provider. Choose a compatible profile again.",
    );
  }
  return {
    ready: true,
    ...input.selection,
  };
}
