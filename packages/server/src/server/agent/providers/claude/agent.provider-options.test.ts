import { expect, test, vi } from "vitest";
import type { Query } from "@anthropic-ai/claude-agent-sdk";
import { ClaudeAgentClient } from "./agent.js";
import { ClaudeProviderOptionsSchema } from "./options.js";
import type { ClaudeQueryInput } from "./query.js";
import { createTestLogger } from "../../../../test-utils/test-logger.js";

test("accepts string-valued native settings.env but not arbitrary SDK controls", () => {
  expect(
    ClaudeProviderOptionsSchema.parse({
      settings: { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "0" } },
    }),
  ).toEqual({ settings: { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "0" } } });
  expect(
    ClaudeProviderOptionsSchema.safeParse({
      settings: { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: 0 } },
    }).success,
  ).toBe(false);
  expect(ClaudeProviderOptionsSchema.safeParse({ settings: { hooks: {} } }).success).toBe(false);
});

test("retains settings env, tool restrictions and Watcher built-ins through native resume", async () => {
  const launches: ClaudeQueryInput[] = [];
  const queryFactory = vi.fn((input: ClaudeQueryInput) => {
    launches.push(input);
    return {
      close: vi.fn(),
      supportedCommands: async () => [],
      applyFlagSettings: async () => undefined,
    } as unknown as Query;
  });
  const client = new ClaudeAgentClient({
    logger: createTestLogger(),
    queryFactory,
    resolveBinary: async () => "/test/claude",
    runtimeSettings: {
      env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
      disallowedTools: ["WebSearch"],
    },
  });
  const config = {
    provider: "claude" as const,
    cwd: process.cwd(),
    model: "claude-opus-4-8",
    featureValues: { fast_mode: true },
    providerOptions: {
      tools: [] as string[],
      disallowedTools: ["Agent", "Task", "SendMessage"],
      allowedTools: ["Read"],
      settings: {
        env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "0", UNRELATED_FLAG: "keep" },
        permissions: { deny: ["Write"] },
      },
    },
  };
  const first = await client.createSession(config);
  const second = await client.resumeSession(
    { provider: "claude", sessionId: "native-history", metadata: config },
    { featureValues: config.featureValues },
  );
  try {
    await first.listCommands();
    await second.listCommands();
    for (const { options } of launches) {
      expect(options).toMatchObject({
        tools: [],
        allowedTools: ["Read"],
        disallowedTools: ["Agent", "Task", "SendMessage", "WebSearch"],
        settings: { ...config.providerOptions.settings, fastMode: true },
        settingSources: ["user", "project", "local"],
      });
    }
    expect(launches).toHaveLength(2);
    expect(launches[1]!.options.resume).toBe("native-history");
  } finally {
    await first.close();
    await second.close();
  }
});
