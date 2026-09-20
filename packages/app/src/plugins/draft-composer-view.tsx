import type {
  PluginDraftComposerProps,
  PluginDraftComposerSelection,
  PluginHostProps,
} from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { PluginClientStateProvider } from "@getpaseo/plugin/client/host";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Platform, Text } from "react-native";
import { withUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useHostRuntimeClient, useHosts } from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";
import { createPluginClientStateSource } from "./client-state/source";
import { PluginRuntimeBoundary } from "./runtime-boundary";
import { SurfaceErrorBoundary } from "./surface-error-boundary";
import { createPluginSurfaceRuntime } from "./surface-runtime";
import { toPluginTheme } from "./theme";
import type { InstalledPluginDraftComposer } from "./draft-composer";
import { invalidateDraftComposerSelection } from "./draft-composer-core";

function resolvePlatform(): PluginHostProps["layout"]["platform"] {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

function DraftComposerError({
  error,
  onFailure,
  theme,
}: {
  error: string;
  onFailure: () => void;
  theme: PluginTheme;
}) {
  // Error boundaries render synchronously. Defer the selection invalidation so
  // React never receives a state update while it is rendering the fallback.
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    onFailure();
  }, [onFailure]);
  const style = useMemo(() => ({ color: theme.colors.statusDanger }), [theme.colors.statusDanger]);
  return <Text style={style}>{`Plugin failed: ${error}`}</Text>;
}

interface DraftComposerHostProps {
  entry: InstalledPluginDraftComposer;
  serverId: string;
  workspaceId?: string;
  draftBindingKey?: string;
  cwd: string;
  availableProviders: readonly string[];
  disabled: boolean;
  selection?: PluginDraftComposerSelection;
  selectedProfileId?: string;
  clearProfileSelection: () => void;
  onSelectionChange: (key: string, selection: PluginDraftComposerSelection) => void;
}

function DraftComposerHost({
  entry,
  serverId,
  workspaceId,
  draftBindingKey,
  cwd,
  availableProviders,
  disabled,
  selection,
  selectedProfileId,
  clearProfileSelection,
  onSelectionChange,
  theme,
}: DraftComposerHostProps & { theme: PluginTheme }) {
  const client = useHostRuntimeClient(serverId);
  const runtime = useMemo(
    () => createPluginSurfaceRuntime(client, entry.installation.id),
    [client, entry.installation.id],
  );
  const hosts = useHosts();
  const hostLabel = hosts.find((host) => host.serverId === serverId)?.label ?? serverId;
  const compact = useIsCompactFormFactor();
  const stateSource = useMemo(() => createPluginClientStateSource(serverId), [serverId]);
  const host = useMemo(() => ({ id: serverId, label: hostLabel }), [hostLabel, serverId]);
  const layout = useMemo(() => ({ compact, platform: resolvePlatform() }), [compact]);
  const key = `${entry.installation.id}:${entry.contribution.id}`;
  const contextKey = [
    workspaceId === undefined ? `before-workspace:${cwd}` : `workspace:${workspaceId}`,
    `draft:${draftBindingKey ?? "none"}`,
  ].join(":");
  const handleSelectionChange = useCallback(
    (nextSelection: PluginDraftComposerSelection) => onSelectionChange(key, nextSelection),
    [key, onSelectionChange],
  );
  const handleFailure = useCallback(
    () =>
      handleSelectionChange(
        invalidateDraftComposerSelection(
          selection,
          "Plugin draft controls failed. Reopen the draft before creating an agent.",
        ),
      ),
    [handleSelectionChange, selection],
  );
  const renderError = useCallback(
    (error: string) => <DraftComposerError error={error} onFailure={handleFailure} theme={theme} />,
    [handleFailure, theme],
  );

  if (!runtime) return null;
  const Component = entry.contribution.Component;
  const props: PluginDraftComposerProps = {
    theme,
    host,
    layout,
    workspaceId,
    cwd,
    availableProviders,
    disabled,
    selection,
    selectedProfileId,
    clearProfileSelection,
    onSelectionChange: handleSelectionChange,
  };
  return (
    <SurfaceErrorBoundary
      installation={entry.installation}
      Surface={Component}
      resetKey={`${serverId}:${contextKey}:${entry.contribution.id}`}
      renderError={renderError}
    >
      <PluginRuntimeBoundary plugin={entry.installation} runtime={runtime}>
        <PluginClientStateProvider source={stateSource}>
          <Component {...props} />
        </PluginClientStateProvider>
      </PluginRuntimeBoundary>
    </SurfaceErrorBoundary>
  );
}

const ThemedDraftComposerHost = withUnistyles(DraftComposerHost);

export interface PluginDraftComposerControlsProps {
  isHydrated: boolean;
  entries: readonly InstalledPluginDraftComposer[];
  serverId: string;
  workspaceId?: string;
  /** Existing host-owned binding identity used to remount plugin-local state. */
  draftBindingKey?: string;
  cwd: string;
  availableProviders: readonly string[];
  disabled?: boolean;
  selections: Readonly<Record<string, PluginDraftComposerSelection | undefined>>;
  selectedProfileId?: string;
  clearProfileSelection: () => void;
  onSelectionChange: (key: string, selection: PluginDraftComposerSelection) => void;
}

export function PluginDraftComposerControls({
  isHydrated,
  entries,
  serverId,
  workspaceId,
  draftBindingKey,
  cwd,
  availableProviders,
  disabled = false,
  selections,
  selectedProfileId,
  clearProfileSelection,
  onSelectionChange,
}: PluginDraftComposerControlsProps): ReactNode {
  if (!isHydrated) return null;
  return entries.map((entry) => {
    const key = `${entry.installation.id}:${entry.contribution.id}`;
    const contextKey = [
      workspaceId === undefined ? `before-workspace:${cwd}` : `workspace:${workspaceId}`,
      `draft:${draftBindingKey ?? "none"}`,
    ].join(":");
    return (
      <ThemedDraftComposerHost
        key={`${key}:${serverId}:${contextKey}`}
        entry={entry}
        serverId={serverId}
        workspaceId={workspaceId}
        draftBindingKey={draftBindingKey}
        cwd={cwd}
        availableProviders={availableProviders}
        disabled={disabled}
        selection={selections[key]}
        selectedProfileId={selectedProfileId}
        clearProfileSelection={clearProfileSelection}
        onSelectionChange={onSelectionChange}
        uniProps={pluginDraftComposerThemeMapping}
      />
    );
  });
}

export const pluginDraftComposerThemeMapping = (theme: Theme) => ({
  theme: toPluginTheme(theme),
});
