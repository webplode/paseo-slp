import { describe, expect, it, vi } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { requestWorkspaceDraftAgent } from "./create-agent-request";

describe("workspace draft creation request", () => {
  it("carries plugin binding and live task overrides through native creation", async () => {
    const createAgent = vi.fn().mockResolvedValue({ id: "created-agent" });
    const client = { createAgent } as unknown as DaemonClient;
    const config = {
      provider: "codex",
      cwd: "/workspace",
      model: "task-model",
      thinkingOptionId: "task-thinking",
      featureValues: { fast_mode: true },
    };
    const labels = { "example.role": "review", "example.profile": "profile-id" };
    const dependencies = ["example-plugin"];

    await expect(
      requestWorkspaceDraftAgent(client, {
        workspaceId: "workspace-id",
        config,
        text: "Bounded assignment",
        clientMessageId: "message-id",
        labels,
        pluginDependencies: dependencies,
      }),
    ).resolves.toEqual({ id: "created-agent" });
    expect(createAgent).toHaveBeenCalledExactlyOnceWith({
      config,
      workspaceId: "workspace-id",
      clientMessageId: "message-id",
      initialPrompt: "Bounded assignment",
      labels,
      pluginDependencies: ["example-plugin"],
    });
    expect(createAgent.mock.calls[0]?.[0].pluginDependencies).not.toBe(dependencies);
  });

  it("leaves ordinary creation unchanged and never retries a rejected binding", async () => {
    const createAgent = vi.fn().mockRejectedValue(new Error("Required plugin is unavailable"));
    const client = { createAgent } as unknown as DaemonClient;
    await expect(
      requestWorkspaceDraftAgent(client, {
        workspaceId: "workspace-id",
        config: { provider: "codex", cwd: "/workspace" },
        text: "",
        clientMessageId: "message-id",
      }),
    ).rejects.toThrow("Required plugin is unavailable");
    expect(createAgent).toHaveBeenCalledExactlyOnceWith({
      config: { provider: "codex", cwd: "/workspace" },
      workspaceId: "workspace-id",
      clientMessageId: "message-id",
    });
  });
});
