import { expect, test } from "vitest";

import type { PluginHookContext } from "@getpaseo/plugin/server";

import { PluginHookHandlers, validateBeforeRequest, validateBeforeResult } from "./index.js";

const paseo = undefined as unknown as PluginHookContext["paseo"];

test("agent.create hooks can inspect caller labels", async () => {
  const handlers = new PluginHookHandlers(() => undefined);
  let seen: Readonly<Record<string, string>> | undefined;

  handlers.before("agent.create", ({ request }) => {
    seen = request.labels;
    return request;
  });

  const result = await handlers.invoke(
    "request-1",
    "before",
    "agent.create",
    {
      config: { provider: "codex", cwd: "/tmp/project" },
      labels: { "plugin.profile": "review" },
    },
    paseo,
  );

  expect(seen).toEqual({ "plugin.profile": "review" });
  expect(result).toEqual({
    config: { provider: "codex", cwd: "/tmp/project" },
    labels: { "plugin.profile": "review" },
  });
});

test("agent.create hooks can inspect declared plugin dependencies", async () => {
  const handlers = new PluginHookHandlers(() => undefined);
  let seen: readonly string[] | undefined;

  handlers.before("agent.create", ({ request }) => {
    seen = request.pluginDependencies;
    return request;
  });

  const result = await handlers.invoke(
    "request-dependency",
    "before",
    "agent.create",
    {
      config: { provider: "codex", cwd: "/tmp/project" },
      pluginDependencies: ["slp"],
    },
    paseo,
  );

  expect(seen).toEqual(["slp"]);
  expect(result).toEqual({
    config: { provider: "codex", cwd: "/tmp/project" },
    pluginDependencies: ["slp"],
  });
});

test.each([
  ["add", { "plugin.profile": "review", "plugin.extra": "value" }],
  ["remove", {}],
  ["replace", { "plugin.profile": "other" }],
])("agent.create hooks cannot %s labels", (_operation, labels) => {
  const input = validateBeforeRequest("agent.create", {
    config: { provider: "codex", cwd: "/tmp/project" },
    labels: { "plugin.profile": "review" },
  });

  expect(() =>
    validateBeforeResult("agent.create", input, {
      ...input,
      labels,
    }),
  ).toThrow("agent.create hooks cannot change labels");
});

test("agent.create hooks cannot add labels when none were supplied", () => {
  const input = validateBeforeRequest("agent.create", {
    config: { provider: "codex", cwd: "/tmp/project" },
  });

  expect(() =>
    validateBeforeResult("agent.create", input, {
      ...input,
      labels: { "plugin.profile": "review" },
    }),
  ).toThrow("agent.create hooks cannot change labels");
});

test("agent.create hooks cannot change plugin dependencies", () => {
  const input = validateBeforeRequest("agent.create", {
    config: { provider: "codex", cwd: "/tmp/project" },
    pluginDependencies: ["slp"],
  });

  expect(() =>
    validateBeforeResult("agent.create", input, {
      ...input,
      pluginDependencies: ["other-plugin"],
    }),
  ).toThrow("agent.create hooks cannot change plugin dependencies");
});
