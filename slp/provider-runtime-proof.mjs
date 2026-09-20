// Real installed CLIs + source adapters, with a local text-only model-response
// recorder. No credentials, provider delegation, daemon or authenticated API use.
// Run: node --import tsx slp/provider-runtime-proof.mjs
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import pino from "pino";
import { CodexAppServerAgentClient } from "../packages/server/src/server/agent/providers/codex-app-server-agent.ts";
import { ClaudeAgentClient } from "../packages/server/src/server/agent/providers/claude/agent.ts";
import { configureRole } from "./plugin/server/configure-role.ts";
import { setupProviderHomes } from "./setup-provider-homes.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "slp-real-provider-policy-"));
const logger = pino({ level: "silent" });
const requests = [];
let ordinal = 0;
const server = http.createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
    return;
  }
  const body = JSON.parse(raw);
  const family = req.url.includes("responses") ? "codex" : "claude";
  const tools = (body.tools ?? [])
    .flatMap((tool) => tool.tools ?? [tool])
    .map((tool) => tool.name ?? tool.function?.name);
  requests.push({ family, tools });
  const id = `proof-${++ordinal}`;
  res.writeHead(200, { "content-type": "text/event-stream" });
  function event(type, data) {
    res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  }
  if (family === "codex") {
    const item = {
      id: `msg-${id}`,
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "OK", annotations: [] }],
    };
    const response = {
      id: `resp-${id}`,
      object: "response",
      created_at: 1,
      model: body.model,
      status: "completed",
      output: [item],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    };
    event("response.created", { response: { ...response, status: "in_progress", output: [] } });
    event("response.output_item.added", {
      output_index: 0,
      item: { ...item, status: "in_progress", content: [] },
    });
    event("response.content_part.added", {
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    });
    event("response.output_text.delta", {
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      delta: "OK",
    });
    event("response.output_text.done", {
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      text: "OK",
    });
    event("response.output_item.done", { output_index: 0, item });
    event("response.completed", { response });
  } else {
    event("message_start", {
      message: {
        id,
        type: "message",
        role: "assistant",
        model: body.model,
        content: [],
        usage: { input_tokens: 1, output_tokens: 0 },
      },
    });
    event("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    event("content_block_delta", { index: 0, delta: { type: "text_delta", text: "OK" } });
    event("content_block_stop", { index: 0 });
    event("message_delta", {
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 1 },
    });
    event("message_stop", {});
  }
  res.end();
});

function print(value) {
  console.log(JSON.stringify(value));
}
const banned = {
  codex: ["spawn_agent", "send_input", "resume_agent", "wait_agent", "close_agent", "create_agent"],
  claude: ["Agent", "Task", "TeamCreate", "TeamDelete", "SendMessage"],
};

async function proveSession(
  client,
  selected,
  handle,
  { family, role, phase, provision, teamReadback },
) {
  const before = requests.length;
  const session =
    phase === "create" ? await client.createSession(selected) : await client.resumeSession(handle);
  try {
    const commands = await session.listCommands();
    assert.ok(
      provision.selectedSkills.every((name) => commands.some((command) => command.name === name)),
      "isolated provider home must expose selected bundle",
    );
    if (family === "codex") {
      const skillNames = new Set(
        commands.filter((command) => command.kind === "skill").map((command) => command.name),
      );
      assert.ok(
        provision.selectedSkills.every((name) => skillNames.has(name)),
        "isolated Codex home must expose selected bundle",
      );
      assert.equal(
        commands.some((command) => command.name === "goal"),
        role !== "watcher",
      );
    }
    await session.run("Return exactly OK. Do not call tools or delegate.", { timeout: 20000 });
    const nextHandle = session.describePersistence();
    const observed = requests.slice(before).find((request) => request.family === family);
    assert.ok(observed, `${family} must reach the recorder`);
    const present = banned[family].filter((name) => observed.tools.includes(name));
    if (role === "ordinary")
      assert.ok(present.length > 0, "baseline must expose native delegation");
    else
      assert.deepEqual(
        present,
        [],
        "SLP must remove native delegation from actual model-visible tools",
      );
    if (family === "claude") {
      const teams = await fs.readFile(teamReadback, "utf8");
      assert.equal(teams, role === "ordinary" ? "1" : "0");
      if (role === "watcher") assert.deepEqual(observed.tools, []);
      print({
        family,
        role,
        phase,
        toolCount: observed.tools.length,
        nativeDelegation: present,
        effectiveTeamsEnv: teams,
      });
    } else
      print({
        family,
        role,
        phase,
        toolCount: observed.tools.length,
        nativeDelegation: present,
        goalCommand: commands.some((command) => command.name === "goal"),
        selectedBundleVisible: true,
      });
    return nextHandle;
  } finally {
    await session.close();
  }
}

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const homes = {
    paseoHome: path.join(root, "paseo"),
    codexHome: path.join(root, "codex"),
    claudeHome: path.join(root, "claude"),
  };
  const provision = await setupProviderHomes({ ...homes, apply: true });
  assert.equal(provision.applied, true);
  const cwd = path.join(root, "project");
  await fs.mkdir(path.join(cwd, ".codex"), { recursive: true });
  await fs.mkdir(path.join(cwd, ".claude"));
  await fs.writeFile(
    path.join(cwd, ".codex/config.toml"),
    "[features]\nmulti_agent = true\nmulti_agent_v2 = true\ngoals = true\n[agents]\nenabled = true\n",
  );
  // This is a generated proof home, not a copy/edit of an existing user's TOML.
  await fs.appendFile(
    path.join(homes.codexHome, "config.toml"),
    `\n[projects.${JSON.stringify(cwd)}]\ntrust_level = "trusted"\n`,
  );
  const teamReadback = path.join(root, "team-env");
  const hookScript = `require("node:fs").writeFileSync(${JSON.stringify(teamReadback)}, process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS ?? "missing")`;
  const projectSettings = {
    env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
    hooks: {
      SessionStart: [
        {
          hooks: [
            { type: "command", command: `${JSON.stringify(process.execPath)} -e '${hookScript}'` },
          ],
        },
      ],
    },
  };
  await fs.writeFile(path.join(cwd, ".claude/settings.json"), JSON.stringify(projectSettings));
  await fs.writeFile(
    path.join(cwd, ".claude/settings.local.json"),
    JSON.stringify({ env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" } }),
  );
  const codexArgs = [
    "-c",
    'model_provider="proof"',
    "-c",
    'model_providers.proof.name="Runtime proof"',
    "-c",
    `model_providers.proof.base_url=${JSON.stringify(`${baseUrl}/v1`)}`,
    "-c",
    'model_providers.proof.wire_api="responses"',
    "-c",
    "model_providers.proof.requires_openai_auth=false",
    "-c",
    'model_providers.proof.env_key="SLP_RUNTIME_PROOF_KEY"',
    "-c",
    "features.multi_agent=true",
    "-c",
    "features.multi_agent_v2=true",
    "-c",
    "agents.enabled=true",
    "-c",
    "features.goals=true",
  ];
  const clients = {
    codex: new CodexAppServerAgentClient(logger, {
      command: { mode: "append", args: codexArgs },
      env: { CODEX_HOME: homes.codexHome, SLP_RUNTIME_PROOF_KEY: "local-fixture-not-a-credential" },
    }),
    claude: new ClaudeAgentClient({
      logger,
      runtimeSettings: {
        env: {
          CLAUDE_CONFIG_DIR: homes.claudeHome,
          ANTHROPIC_BASE_URL: baseUrl,
          ANTHROPIC_API_KEY: "local-fixture-not-a-credential",
          ANTHROPIC_AUTH_TOKEN: "",
          CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
        },
      },
    }),
  };
  for (const family of ["codex", "claude"]) {
    const client = clients[family];
    const ordinary = {
      provider: family,
      cwd,
      model: family === "codex" ? "gpt-5.4" : "claude-sonnet-4-6",
      modeId: family === "codex" ? "full-access" : "bypassPermissions",
    };
    for (const role of ["ordinary", "lead", "watcher"]) {
      const profile = { id: "proof", provider: family, notes: `[slp:${role}]` };
      const paseo = {
        config: { get: async () => ({ config: { agentProfiles: [profile] } }) },
        providers: {
          listModes: async () => ({ modes: [{ id: ordinary.modeId }, { id: "read-only" }] }),
        },
        agents: {
          list: async () => ({ entries: [] }),
          ref: () => ({
            refresh: async () => ({
              agent: {
                id: "owner",
                workspaceId: "workspace",
                archivedAt: null,
                labels: { "slp.role": "supervisor" },
              },
            }),
          }),
        },
        workspaces: {
          list: async () => ({ entries: [{ workspaceDirectory: cwd, projectRootPath: cwd }] }),
          ref: () => ({ refresh: async () => ({ workspaceDirectory: cwd, projectRootPath: cwd }) }),
        },
      };
      const selected =
        role === "ordinary"
          ? ordinary
          : (
              await configureRole(
                {
                  config: ordinary,
                  labels: {
                    "slp.role": role,
                    "slp.profile": "proof",
                    "slp.watcher.supervisor": "owner",
                    "slp.watcher.workspace": "workspace",
                    "slp.watcher.cadence-minutes": "15",
                  },
                },
                paseo,
              )
            ).config;
      const phases = role === "ordinary" ? ["create"] : ["create", "resume"];
      let handle;
      for (const phase of phases) {
        handle = await proveSession(client, selected, handle, {
          family,
          role,
          phase,
          provision,
          teamReadback,
        });
      }
    }
  }
  print({
    result: "passed",
    boundary:
      "real CLI/SDK/adapters; text-only local model recorder, not authenticated provider/model or installed-daemon proof",
  });
} finally {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
}
