import type { PluginServerContext, PluginServerActivationContext } from "@getpaseo/plugin/server";
import { registerAttentionTrigger } from "./server/attention-trigger";
import { configureRole } from "./server/configure-role";
import { bootstrapGlobalWorkspaceProtocol } from "./server/global-workspace-protocol";
import { startProjectMemoryBootstrap } from "./server/project-memory";

export default function contribute(
  server: PluginServerContext,
  { paseo }: PluginServerActivationContext,
) {
  const globalProtocol = bootstrapGlobalWorkspaceProtocol();
  if (globalProtocol.created) {
    console.log(`[SLP] Bootstrapped global Workspace Protocol at ${globalProtocol.path}`);
  }
  server.before("agent.create", ({ request }, hookContext) =>
    configureRole(request, hookContext.paseo, globalProtocol.path),
  );
  const memory = startProjectMemoryBootstrap(paseo);
  const cleanupAttention = registerAttentionTrigger(server);
  return async () => {
    try {
      cleanupAttention();
    } finally {
      await memory.cleanup();
    }
  };
}
