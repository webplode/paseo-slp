import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { setupProviderHomes } from "./setup-provider-homes.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "slp-provider-homes-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const options = Object.fromEntries(
    ["paseoHome", "codexHome", "claudeHome", "bundle"].map((name) => [name, path.join(root, name)]),
  );
  for (const name of ["paseo", "triple-review"]) {
    await fs.mkdir(path.join(options.bundle, name), { recursive: true });
    await fs.writeFile(
      path.join(options.bundle, name, "SKILL.md"),
      `---\nname: ${name}\n---\nFixture skill.\n`,
    );
  }
  return options;
}

test("dry-run leaves all dedicated homes absent; explicit apply is idempotent", async (t) => {
  const options = await fixture(t);
  const dry = await setupProviderHomes(options);
  assert.equal(dry.applied, false);
  assert.equal(dry.writes.length, 3);
  assert.equal(dry.links.length, 4);
  assert.deepEqual(dry.blockers, []);
  await assert.rejects(fs.stat(options.paseoHome), { code: "ENOENT" });
  await assert.rejects(fs.stat(options.codexHome), { code: "ENOENT" });
  await assert.rejects(fs.stat(options.claudeHome), { code: "ENOENT" });

  const applied = await setupProviderHomes({ ...options, apply: true });
  assert.equal(applied.applied, true);
  const config = JSON.parse(await fs.readFile(path.join(options.paseoHome, "config.json"), "utf8"));
  assert.equal(config.agents.providers.codex.env.CODEX_HOME, await fs.realpath(options.codexHome));
  assert.equal(
    config.agents.providers.claude.env.CLAUDE_CONFIG_DIR,
    await fs.realpath(options.claudeHome),
  );
  assert.equal(config.pluginsEnabled, undefined);
  assert.deepEqual(await fs.readdir(options.codexHome), ["config.toml", "skills"]);
  assert.deepEqual(await fs.readdir(options.claudeHome), ["settings.json", "skills"]);
  const next = await setupProviderHomes({ ...options, apply: true });
  assert.deepEqual(next.writes, []);
  assert.deepEqual(next.links, []);
});

test("preserves existing config/auth and follows an explicit custom bundle selection", async (t) => {
  const options = await fixture(t);
  await fs.mkdir(options.paseoHome);
  await fs.mkdir(options.codexHome);
  await fs.mkdir(options.claudeHome);
  const config = {
    version: 1,
    listen: "127.0.0.1:6781",
    pluginsEnabled: true,
    skills: { selection: { mode: "custom", skills: ["paseo"] } },
    agents: {
      providers: {
        codex: { command: ["shared-codex"], env: { CODEX_HOME: options.codexHome, KEEP: "codex" } },
        claude: { command: ["shared-claude"], env: { CLAUDE_CONFIG_DIR: options.claudeHome } },
      },
    },
  };
  const settings = {
    hooks: { ExistingHook: [] },
    permissions: { deny: ["Write"] },
    env: { KEEP: "claude", CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
  };
  const toml = "# Existing config stays intact\n[features]\nmulti_agent = true\n";
  await fs.writeFile(path.join(options.paseoHome, "config.json"), JSON.stringify(config));
  await fs.writeFile(path.join(options.codexHome, "config.toml"), toml);
  await fs.writeFile(path.join(options.codexHome, "auth.json"), "fixture-auth-untouched");
  await fs.writeFile(path.join(options.claudeHome, "settings.json"), JSON.stringify(settings));

  const result = await setupProviderHomes({ ...options, apply: true });
  assert.deepEqual(result.selectedSkills, ["paseo"]);
  assert.equal(await fs.readFile(path.join(options.codexHome, "config.toml"), "utf8"), toml);
  assert.equal(
    await fs.readFile(path.join(options.codexHome, "auth.json"), "utf8"),
    "fixture-auth-untouched",
  );
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(options.paseoHome, "config.json"), "utf8")),
    config,
  );
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(options.claudeHome, "settings.json"), "utf8")),
    { ...settings, env: { ...settings.env, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "0" } },
  );
  assert.equal(
    await fs.realpath(path.join(options.claudeHome, "skills/paseo")),
    await fs.realpath(path.join(options.bundle, "paseo")),
  );
  await assert.rejects(fs.stat(path.join(options.claudeHome, "skills/triple-review")), {
    code: "ENOENT",
  });
});

test("refuses home repointing and unaccounted existing resume history before any writes", async (t) => {
  const options = await fixture(t);
  await fs.mkdir(path.join(options.paseoHome, "agents"), { recursive: true });
  await fs.writeFile(path.join(options.paseoHome, "agents/session.json"), "{}");
  const config = {
    agents: {
      providers: { codex: { env: { CODEX_HOME: path.join(options.paseoHome, "old-home") } } },
    },
  };
  await fs.writeFile(path.join(options.paseoHome, "config.json"), JSON.stringify(config));
  const result = await setupProviderHomes({ ...options, apply: true });
  assert.equal(result.applied, false);
  assert.equal(result.blockers.length, 2);
  assert.match(result.blockers[0], /existing CODEX_HOME differs/);
  assert.match(result.blockers[1], /resume-home decision/);
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(options.paseoHome, "config.json"), "utf8")),
    config,
  );
  await assert.rejects(fs.stat(options.codexHome), { code: "ENOENT" });
});

test("preserves conflicting skills and refuses wholesale skills links", async (t) => {
  const options = await fixture(t);
  await fs.mkdir(path.join(options.codexHome, "skills/paseo"), { recursive: true });
  const result = await setupProviderHomes({ ...options, apply: true });
  assert.equal(result.applied, false);
  assert.match(result.blockers[0], /Preserving conflicting skill/);
  await assert.rejects(fs.stat(options.claudeHome), { code: "ENOENT" });
  await fs.mkdir(options.claudeHome);
  await fs.symlink(options.bundle, path.join(options.claudeHome, "skills"), "dir");
  const linked = await setupProviderHomes({ ...options, apply: true });
  assert.equal(linked.applied, false);
  assert.match(linked.blockers.at(-1), /dedicated skills directory/);
});

test("rejects the main daemon, personal homes, aliases and malformed config without leaking content", async (t) => {
  const options = await fixture(t);
  await assert.rejects(
    setupProviderHomes({ ...options, paseoHome: path.join(os.homedir(), ".paseo") }),
    /dedicated homes/,
  );
  await fs.mkdir(options.paseoHome);
  await fs.writeFile(path.join(options.paseoHome, "config.json"), "private-fixture-not-json");
  await assert.rejects(setupProviderHomes(options), (error) => {
    assert.match(error.message, /Invalid configuration object/);
    assert.equal(error.message.includes("private-fixture-not-json"), false);
    return true;
  });
});
