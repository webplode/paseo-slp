// Isolated UI/creation proof only. Never launches an installed provider CLI or model.
// Run: node --import tsx packages/server/src/server/test-utils/slp-composer-proof-host.ts /absolute/.dev/slp-composer-handoff.XXXXXX
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { createPaseoClient } from "@getpaseo/client";
import { createTestAgentClients } from "./fake-agent-client.js";
import { createTestPaseoDaemon } from "./paseo-daemon.js";
import { setupProviderHomes } from "../../../../../slp/setup-provider-homes.mjs";

const proofRoot = process.argv[2];
if (
  !proofRoot ||
  !path.isAbsolute(proofRoot) ||
  !path.basename(proofRoot).startsWith("slp-composer-handoff.")
) {
  throw new Error("Pass the freshly allocated slp-composer-handoff fixture directory.");
}
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const clients = createTestAgentClients();
for (const [provider, client] of Object.entries(clients)) {
  const createSession = client.createSession.bind(client);
  client.createSession = async (config, context) => {
    await appendFile(
      path.join(proofRoot, "created-configs.jsonl"),
      `${JSON.stringify({ stage: "create", config })}\n`,
    );
    return createSession(config, context);
  };
  const fetchCatalog = client.fetchCatalog.bind(client);
  client.fetchCatalog = async (options) => {
    const catalog = await fetchCatalog(options);
    return {
      ...catalog,
      models: catalog.models.map((model) => ({
        ...model,
        thinkingOptions: [
          { id: "low", label: "Low", isDefault: true },
          { id: "high", label: "High" },
        ],
        defaultThinkingOptionId: "low",
      })),
      modes: catalog.modes.filter((mode) =>
        provider === "codex"
          ? ["full-access", "default"].includes(mode.id)
          : ["bypassPermissions", "default"].includes(mode.id),
      ),
    };
  };
}

const providerHomes = await setupProviderHomes({
  paseoHome: path.join(proofRoot, "daemon", ".paseo"),
  codexHome: path.join(proofRoot, "codex"),
  claudeHome: path.join(proofRoot, "claude"),
  apply: true,
});
await writeFile(
  path.join(proofRoot, "fixture-home-setup.json"),
  `${JSON.stringify(providerHomes, null, 2)}\n`,
);
if (!providerHomes.applied) throw new Error("Fresh fixture home setup was blocked.");

const fixture = await createTestPaseoDaemon({
  daemonVersion: "0.8.1",
  paseoHomeRoot: path.join(proofRoot, "daemon"),
  staticDir: path.join(repoRoot, "packages/server/static"),
  cleanup: false,
  corsAllowedOrigins: ["http://127.0.0.1:8081", "http://localhost:8081"],
  agentClients: clients,
  providerOverrides: {
    codex: { env: { CODEX_HOME: providerHomes.homes.codexHome } },
    claude: { env: { CLAUDE_CONFIG_DIR: providerHomes.homes.claudeHome } },
  },
  pluginsEnabled: true,
  plugins: { slp: { source: "directory", path: path.join(repoRoot, "slp/plugin"), enabled: true } },
  agentProfiles: [
    {
      id: "fixture-lead",
      name: "Lead fixture",
      provider: "codex",
      model: "gpt-5.4-mini",
      thinkingOptionId: "low",
      notes: "[slp:lead]\nDeterministic UI fixture; no authenticated model.",
    },
    {
      id: "fixture-review-codex",
      name: "Review profile",
      provider: "codex",
      model: "gpt-5.4-mini",
      thinkingOptionId: "low",
      notes: "[slp:peer:reviewer]",
    },
    {
      id: "fixture-review-claude",
      name: "Review profile",
      provider: "claude",
      model: "haiku",
      thinkingOptionId: "low",
      notes: "[slp:peer:reviewer]",
    },
    {
      id: "fixture-supervisor",
      name: "Supervisor fixture",
      provider: "codex",
      model: "gpt-5.4-mini",
      thinkingOptionId: "low",
      notes: "[slp:supervisor]",
    },
  ],
  webUi: { enabled: true, distDir: path.join(repoRoot, "packages/server/dist/server/web-ui") },
  logger: pino({ level: "info" }, pino.destination(path.join(proofRoot, "ui-daemon.log"))),
});
const client = createPaseoClient({
  url: `ws://127.0.0.1:${fixture.port}/ws`,
  appVersion: "0.8.1",
  reconnect: { enabled: false },
});
try {
  await client.connect();
  await client.agents.list();
  const directory = path.join(proofRoot, "project");
  await mkdir(directory, { recursive: true });
  const workspace = await client.workspaces.create({
    source: { kind: "directory", path: directory },
    title: "SLP composer fixture",
  });
  const identity = {
    port: fixture.port,
    url: `http://127.0.0.1:${fixture.port}`,
    paseoHome: fixture.paseoHome,
    workspaceId: workspace.id,
    providerEvidence:
      "Deterministic repository adapters, not installed CLI policy or an authenticated model run.",
  };
  await writeFile(path.join(proofRoot, "ui-host.json"), `${JSON.stringify(identity, null, 2)}\n`);
  console.log(JSON.stringify(identity));
} finally {
  await client.close();
}

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await fixture.close();
  console.log("Isolated fixture stopped; evidence/home retained, main6767 untouched.");
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
