import type { PluginClientContext } from "@getpaseo/plugin/client";
import { SlpDraftComposer } from "./client/draft-composer";
import { RoleProfilesSettings } from "./client/settings";

const SETTINGS_ID = "role-profiles";

export default function contribute(client: PluginClientContext) {
  // Created once per plugin activation, not on each React render.
  // oxlint-disable-next-line eslint-plugin-react-perf/jsx-no-new-function-as-prop
  const openRoleSettings = () => client.openSettings(SETTINGS_ID);
  const DraftComposer = (props: Parameters<typeof SlpDraftComposer>[0]) => (
    <SlpDraftComposer {...props} openSettings={openRoleSettings} />
  );

  client.addSettingsScreen({
    id: SETTINGS_ID,
    title: "SLP profile roles",
    icon: "Waypoints",
    Component: RoleProfilesSettings,
  });
  client.addDraftComposer({ id: "roles", Component: DraftComposer });

  return () => {};
}
