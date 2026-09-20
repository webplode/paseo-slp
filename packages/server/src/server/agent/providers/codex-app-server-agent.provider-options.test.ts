import { expect, test } from "vitest";
import type { AgentSessionConfig } from "../agent-sdk-types.js";
import { CodexAppServerAgentSession } from "./codex-app-server-agent.js";
import { createFakeCodexAppServer } from "./codex/test-utils/fake-app-server.js";
import { createTestLogger } from "../../../test-utils/test-logger.js";

test("retains explicit native config through thread creation and persisted resume", async () => {
  const providerOptions = {
    features: { multi_agent: false, multi_agent_v2: false, goals: false },
    agents: { enabled: false },
  };
  const config: AgentSessionConfig = {
    provider: "codex",
    cwd: "/workspace",
    model: "gpt-5.4",
    providerOptions,
  };
  const deps = {
    customCodexConfig: {
      features: { multi_agent: true, multi_agent_v2: true, goals: true, shell_tool: true },
      "features.multi_agent": true,
      "features.multi_agent_v2": true,
      "agents.enabled": true,
    },
  };
  const expected = {
    ...deps.customCodexConfig,
    features: { ...providerOptions.features, shell_tool: true },
    agents: { enabled: false },
    "features.multi_agent": false,
    "features.multi_agent_v2": false,
    "agents.enabled": false,
  };
  const firstServer = createFakeCodexAppServer();
  const first = new CodexAppServerAgentSession(
    config,
    null,
    createTestLogger(),
    async () => firstServer.child,
    deps,
  );
  try {
    await first.connect();
    await first.startTurn("first harmless turn");
    expect(firstServer.requests().find((r) => r.method === "thread/start")?.params).toMatchObject({
      config: expected,
    });
    const handle = first.describePersistence();
    expect(handle?.metadata.providerOptions).toEqual(providerOptions);
    const secondServer = createFakeCodexAppServer();
    const second = new CodexAppServerAgentSession(
      handle!.metadata as unknown as AgentSessionConfig,
      handle!,
      createTestLogger(),
      async () => secondServer.child,
      deps,
    );
    try {
      await second.connect();
      await second.startTurn("resume harmless turn");
      expect(
        secondServer.requests().find((r) => r.method === "thread/resume")?.params,
      ).toMatchObject({ config: expected });
      firstServer.assertNoErrors();
      secondServer.assertNoErrors();
    } finally {
      await second.close();
    }
  } finally {
    await first.close();
  }
});
