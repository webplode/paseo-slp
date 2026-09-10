import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

import { createTestLogger } from "../../test-utils/test-logger.js";
import { AgentManager } from "./agent-manager.js";
import { ensureAgentLoaded } from "./agent-loading.js";
import { AgentStorage } from "./agent-storage.js";
import type {
  AgentClient,
  AgentLaunchContext,
  AgentPersistenceHandle,
  AgentResumeSessionOptions,
  AgentSession,
  AgentSessionConfig,
} from "./agent-sdk-types.js";
import { createTestAgentClient, createTestAgentClients } from "../test-utils/fake-agent-client.js";

test("loads archived records for history and active records with the interactive default", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-loading-purpose-"));
  const logger = createTestLogger();
  const storage = new AgentStorage(path.join(root, "agents"), logger);
  const baseClient = createTestAgentClients().codex;
  if (!baseClient) {
    throw new Error("expected Codex test client");
  }

  const resumeOptions: Array<AgentResumeSessionOptions | undefined> = [];
  const client: AgentClient = {
    provider: baseClient.provider,
    capabilities: baseClient.capabilities,
    createSession: async (
      config: AgentSessionConfig,
      launchContext?: AgentLaunchContext,
    ): Promise<AgentSession> => await baseClient.createSession(config, launchContext),
    resumeSession: async (
      handle: AgentPersistenceHandle,
      overrides?: Partial<AgentSessionConfig>,
      launchContext?: AgentLaunchContext,
      options?: AgentResumeSessionOptions,
    ): Promise<AgentSession> => {
      resumeOptions.push(options);
      return await baseClient.resumeSession(handle, overrides, launchContext);
    },
    fetchCatalog: async (options) => await baseClient.fetchCatalog(options),
    isAvailable: async () => await baseClient.isAvailable(),
  };
  const manager = new AgentManager({
    clients: { codex: client },
    registry: storage,
    logger,
  });

  const archivedId = "00000000-0000-4000-8000-000000000301";
  const activeId = "00000000-0000-4000-8000-000000000302";

  try {
    const archived = await manager.createAgent({ provider: "codex", cwd: root }, archivedId, {
      workspaceId: "workspace-archived",
    });
    await manager.archiveAgent(archived.id);

    const active = await manager.createAgent({ provider: "codex", cwd: root }, activeId, {
      workspaceId: "workspace-active",
    });
    await manager.closeAgent(active.id);

    await ensureAgentLoaded(archived.id, { agentManager: manager, agentStorage: storage, logger });
    await ensureAgentLoaded(active.id, { agentManager: manager, agentStorage: storage, logger });

    expect(resumeOptions).toEqual([{ purpose: "history" }, undefined]);
  } finally {
    await Promise.all([
      manager.closeAgent(archivedId).catch(() => undefined),
      manager.closeAgent(activeId).catch(() => undefined),
    ]);
    await manager.flushForShutdown().catch(() => undefined);
    await storage.flush().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});

test("restores a stored config without reapplying provider defaults when persistence is unavailable", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-loading-provider-defaults-"));
  const logger = createTestLogger();
  const storage = new AgentStorage(path.join(root, "agents"), logger);
  const baseClient = createTestAgentClient("codex-role");
  const createdConfigs: AgentSessionConfig[] = [];
  const client: AgentClient = {
    provider: baseClient.provider,
    capabilities: baseClient.capabilities,
    isAvailable: () => baseClient.isAvailable(),
    fetchCatalog: (options) => baseClient.fetchCatalog(options),
    resumeSession: (handle, overrides, context, options) =>
      baseClient.resumeSession(handle, overrides, context, options),
    createSession: async (
      config: AgentSessionConfig,
      launchContext?: AgentLaunchContext,
    ): Promise<AgentSession> => {
      createdConfigs.push(config);
      return await baseClient.createSession(config, launchContext);
    },
  };
  const manager = new AgentManager({
    clients: { "codex-role": client },
    providerDefinitions: {
      "codex-role": {
        enabled: true,
        systemPrompt: "Role instructions.",
        configuredDefaultModeId: "full-access",
      },
    },
    registry: storage,
    logger,
  });
  const agentId = "00000000-0000-4000-8000-000000000303";
  const composedPrompt = "Role instructions.\n\nTask instructions.";

  try {
    await manager.createAgent(
      {
        provider: "codex-role",
        cwd: root,
        systemPrompt: "Task instructions.",
      },
      agentId,
      { workspaceId: "workspace-role" },
    );
    await manager.closeAgent(agentId);

    const stored = await storage.get(agentId);
    expect(stored?.config).toMatchObject({
      modeId: "full-access",
      systemPrompt: composedPrompt,
    });
    expect(stored).not.toBeNull();

    await storage.upsert({ ...stored!, persistence: null });
    await ensureAgentLoaded(agentId, {
      agentManager: manager,
      agentStorage: storage,
      logger,
    });

    expect(createdConfigs).toHaveLength(2);
    expect(createdConfigs[1]).toMatchObject({
      modeId: "full-access",
      systemPrompt: composedPrompt,
    });
    expect(createdConfigs[1]?.systemPrompt).not.toContain(
      "Role instructions.\n\nRole instructions.",
    );
  } finally {
    await manager.closeAgent(agentId).catch(() => undefined);
    await manager.flushForShutdown().catch(() => undefined);
    await storage.flush().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
