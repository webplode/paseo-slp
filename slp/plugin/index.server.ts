import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerAttentionTrigger } from "./server/attention-trigger";
import { configureRole } from "./server/configure-role";
import { bootstrapProjectMemory, inspectProjectMemory } from "./server/project-memory";
import { bootstrapProjectMemoryRpc, inspectProjectMemoryRpc } from "./shared/project-memory";

export default function contribute(server: PluginServerContext) {
  server.before("agent.create", ({ request }, { paseo }) => configureRole(request, paseo));
  server.handle(inspectProjectMemoryRpc, inspectProjectMemory);
  server.handle(bootstrapProjectMemoryRpc, bootstrapProjectMemory);
  return registerAttentionTrigger(server);
}
