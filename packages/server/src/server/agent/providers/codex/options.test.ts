import { describe, expect, it } from "vitest";
import { CodexProviderOptionsSchema, mergeCodexProviderOptions } from "./options.js";

describe("Codex native session configuration", () => {
  it("accepts native delegation switches and rejects unowned controls", () => {
    const options = {
      features: { multi_agent: false, multi_agent_v2: false, network_proxy: true },
      agents: { enabled: false },
    };
    expect(CodexProviderOptionsSchema.parse(options)).toEqual(options);
    expect(CodexProviderOptionsSchema.safeParse({ agents: { enabled: "false" } }).success).toBe(
      false,
    );
    expect(CodexProviderOptionsSchema.safeParse({ agents: { max_threads: 3 } }).success).toBe(
      false,
    );
  });

  it("merges explicit session options last while preserving unrelated nested host defaults", () => {
    const defaults = {
      model_provider: "custom",
      features: { multi_agent: true, multi_agent_v2: true, network_proxy: true, shell_tool: true },
      agents: { enabled: true, max_threads: 3 },
      sandbox_workspace_write: { network_access: true, writable_roots: ["/cache"] },
    };
    const options = CodexProviderOptionsSchema.parse({
      features: { multi_agent: false, multi_agent_v2: false },
      agents: { enabled: false },
      sandbox_workspace_write: { writable_roots: ["/session-cache"] },
    });
    expect(mergeCodexProviderOptions(defaults, options)).toEqual({
      model_provider: "custom",
      features: {
        multi_agent: false,
        multi_agent_v2: false,
        network_proxy: true,
        shell_tool: true,
      },
      agents: { enabled: false, max_threads: 3 },
      sandbox_workspace_write: { network_access: true, writable_roots: ["/session-cache"] },
    });
    expect(defaults.features.multi_agent).toBe(true);
    expect(defaults.agents.enabled).toBe(true);
  });

  it("pins equivalent dotted host keys without touching unrelated dotted settings", () => {
    expect(
      mergeCodexProviderOptions(
        {
          "features.multi_agent": true,
          "features.multi_agent_v2": true,
          "agents.enabled": true,
          "features.goals": true,
          "features.shell_tool": true,
        },
        {
          features: { multi_agent: false, multi_agent_v2: false, goals: false },
          agents: { enabled: false },
        },
      ),
    ).toEqual({
      "features.multi_agent": false,
      "features.multi_agent_v2": false,
      "agents.enabled": false,
      "features.goals": false,
      "features.shell_tool": true,
      features: { multi_agent: false, multi_agent_v2: false, goals: false },
      agents: { enabled: false },
    });
  });
});
