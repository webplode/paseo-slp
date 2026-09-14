import type { PluginClientContext } from "@getpaseo/plugin/client";
import { LaunchSurface, LaunchWorkspacePanel } from "./client/launch";
import { RoleProfilesSettings } from "./client/settings";

const SURFACE_ID = "main";
const SETTINGS_ID = "role-profiles";
const PANEL_ID = "launch";

export default function contribute(client: PluginClientContext) {
  // Created once per plugin activation, not on each React render.
  // oxlint-disable-next-line eslint-plugin-react-perf/jsx-no-new-function-as-prop
  const openRoleSettings = () => client.openSettings(SETTINGS_ID);
  const Surface = (props: Parameters<typeof LaunchSurface>[0]) => (
    <LaunchSurface {...props} onOpenSettings={openRoleSettings} />
  );

  client.addSurface(SURFACE_ID, Surface);
  client.addSidebarItem({
    id: SURFACE_ID,
    title: "SLP",
    icon: "Waypoints",
    surface: SURFACE_ID,
  });
  client.addSettingsScreen({
    id: SETTINGS_ID,
    title: "SLP profile roles",
    icon: "Waypoints",
    Component: RoleProfilesSettings,
  });
  client.addWorkspacePanel({
    id: PANEL_ID,
    title: "Launch SLP agent",
    icon: "Rocket",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: LaunchWorkspacePanel,
  });
  client.addCommandCenterItem({
    id: "open-slp",
    title: "Open SLP launcher",
    icon: "Waypoints",
    keywords: ["supervisor", "watcher", "lead", "peer", "agent", "profile"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface(SURFACE_ID);
    },
  });
  client.addCommandCenterItem({
    id: "launch-slp-workspace-agent",
    title: "Launch SLP agent in workspace",
    icon: "Rocket",
    keywords: ["supervisor", "watcher", "lead", "peer", "task"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel(PANEL_ID);
    },
  });
  client.addCommandCenterItem({
    id: "configure-slp-profile-roles",
    title: "Configure SLP profile roles",
    icon: "Settings2",
    keywords: ["profiles", "roles", "supervisor", "watcher", "lead", "peer"],
    context: "global",
    onSelect({ openSettings: openSettingsFromCommand }) {
      openSettingsFromCommand(SETTINGS_ID);
    },
  });

  return () => {};
}
