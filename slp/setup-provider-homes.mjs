import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function record(value) {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a configuration object; no files changed.");
  }
  return value;
}

async function stat(file) {
  try {
    return await fs.lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function canonical(file) {
  const resolved = path.resolve(file);
  if (await stat(resolved)) return fs.realpath(resolved);
  return path.join(await canonical(path.dirname(resolved)), path.basename(resolved));
}

async function readConfig(file) {
  const info = await stat(file);
  if (!info) return null;
  if (!info.isFile()) throw new Error(`Refusing non-regular configuration file: ${file}`);
  try {
    return record(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    // Parser messages can include the original configuration and secrets.
    throw new Error(`Invalid configuration object: ${file}`);
  }
}

async function dedicatedHomes(paseoHome, codexHome, claudeHome) {
  const homes = await Promise.all([paseoHome, codexHome, claudeHome].map(canonical));
  const personal = await Promise.all(
    [".paseo", ".codex", ".claude"].map((name) => canonical(path.join(os.homedir(), name))),
  );
  for (const home of homes) {
    if (personal.includes(home) || home === path.parse(home).root || home === os.homedir()) {
      throw new Error("Use dedicated homes, not the main daemon or personal provider homes.");
    }
  }
  for (const [index, home] of homes.entries()) {
    if (
      homes.some(
        (other, otherIndex) =>
          index !== otherIndex && (other === home || other.startsWith(`${home}${path.sep}`)),
      )
    ) {
      throw new Error("Provider and Paseo homes must be separate, non-nested directories.");
    }
  }
  return homes;
}

async function planPaseoConfig(paseoHome, codexHome, claudeHome, writes, blockers) {
  const configFile = path.join(paseoHome, "config.json");
  const config = (await readConfig(configFile)) ?? { version: 1 };
  const agents = record(config.agents);
  const providers = record(agents.providers);
  const nextProviders = { ...providers };
  const history = await stat(path.join(paseoHome, "agents"));
  const hasHistory =
    history !== null &&
    (!history.isDirectory() || (await fs.readdir(path.join(paseoHome, "agents"))).length > 0);

  for (const [provider, key, home] of [
    ["codex", "CODEX_HOME", codexHome],
    ["claude", "CLAUDE_CONFIG_DIR", claudeHome],
  ]) {
    const entry = record(providers[provider]);
    const env = record(entry.env);
    const previous = env[key];
    const sameHome =
      typeof previous === "string" &&
      path.isAbsolute(previous) &&
      (await canonical(previous)) === home;
    if (previous !== undefined && !sameHome)
      blockers.push(
        `${provider}: existing ${key} differs; reconcile native resume history before repointing.`,
      );
    if (previous === undefined && hasHistory)
      blockers.push(
        `${provider}: existing Paseo agent history requires a resume-home decision before binding ${key}. Use a fresh isolated Paseo home for new sessions.`,
      );
    nextProviders[provider] = { ...entry, env: { ...env, [key]: sameHome ? previous : home } };
  }
  const nextConfig = { ...config, agents: { ...agents, providers: nextProviders } };
  if (JSON.stringify(nextConfig) !== JSON.stringify(config))
    writes.push({ file: configFile, content: `${JSON.stringify(nextConfig, null, 2)}\n` });
  return config;
}

async function planProviderConfigs(codexHome, claudeHome, writes, blockers) {
  const codexConfig = path.join(codexHome, "config.toml");
  const codexInfo = await stat(codexConfig);
  if (codexInfo && !codexInfo.isFile())
    blockers.push(`Refusing non-regular Codex config: ${codexConfig}`);
  if (!codexInfo)
    writes.push({
      file: codexConfig,
      content:
        "[features]\nmulti_agent = false\nmulti_agent_v2 = false\n\n[agents]\nenabled = false\n",
    });
  // Existing TOML is left byte-for-byte intact; role launches pin session config.
  const claudeConfig = path.join(claudeHome, "settings.json");
  const claudeSettings = (await readConfig(claudeConfig)) ?? {};
  const nextSettings = {
    ...claudeSettings,
    env: { ...record(claudeSettings.env), CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "0" },
  };
  if (JSON.stringify(nextSettings) !== JSON.stringify(claudeSettings))
    writes.push({ file: claudeConfig, content: `${JSON.stringify(nextSettings, null, 2)}\n` });
}

async function planSkillLinks(config, bundle, codexHome, claudeHome, links, blockers) {
  const selection = record(record(config.skills).selection);
  if (selection.mode !== undefined && selection.mode !== "all" && selection.mode !== "custom")
    throw new Error("Unknown skill selection; no files changed.");
  if (selection.mode === "custom" && !Array.isArray(selection.skills))
    throw new Error("Invalid custom skill selection; no files changed.");
  const available = (await fs.readdir(bundle, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const selected =
    selection.mode === "custom"
      ? available.filter((name) => selection.skills.includes(name))
      : available;
  for (const name of selected) {
    const source = await fs.realpath(path.join(bundle, name));
    if (!(await stat(path.join(source, "SKILL.md")))?.isFile())
      throw new Error(`Bundle skill has no SKILL.md: ${name}`);
    for (const home of [codexHome, claudeHome]) {
      const target = path.join(home, "skills", name);
      const info = await stat(target);
      if (!info) links.push({ target, source });
      else if (!info.isSymbolicLink() || (await canonical(target)) !== source)
        blockers.push(`Preserving conflicting skill path: ${target}`);
    }
  }
  // Check skill parent links too: never populate a wholesale personal link.
  for (const home of [codexHome, claudeHome]) {
    const info = await stat(path.join(home, "skills"));
    if (info && !info.isDirectory())
      blockers.push(`Use a dedicated skills directory: ${path.join(home, "skills")}`);
  }
  return selected;
}

async function applyProvisioning(writes, links) {
  for (const { file, content } of writes) {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, content, { mode: 0o600 });
  }
  for (const { target, source } of links) {
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.symlink(source, target, "dir");
  }
}

/** Bundle-only provisioning. Does not start/reload a daemon or authenticate a CLI. */
export async function setupProviderHomes({
  paseoHome = path.join(repoRoot, ".dev/slp-home"),
  codexHome = path.join(repoRoot, ".dev/codex-home"),
  claudeHome = path.join(repoRoot, ".dev/claude-home"),
  bundle = path.join(repoRoot, "skills"),
  apply = false,
} = {}) {
  [paseoHome, codexHome, claudeHome] = await dedicatedHomes(paseoHome, codexHome, claudeHome);
  const blockers = [];
  const writes = [];
  const links = [];
  const config = await planPaseoConfig(paseoHome, codexHome, claudeHome, writes, blockers);
  await planProviderConfigs(codexHome, claudeHome, writes, blockers);
  const selected = await planSkillLinks(config, bundle, codexHome, claudeHome, links, blockers);
  const result = {
    mode: apply ? "apply" : "dry-run",
    applied: false,
    homes: { paseoHome, codexHome, claudeHome },
    writes: writes.map(({ file }) => file),
    links: links.map(({ target }) => target),
    selectedSkills: selected,
    blockers,
    prerequisites: [
      "Authenticate each dedicated provider home explicitly; no credentials are copied or inspected.",
      "Keep old provider homes for old native resume handles; no history is migrated.",
      "Provider homes separate user config/state, not OS access, project settings or shared user skills.",
      "No daemon activation, plugin switch, listener, binary change or reload is performed.",
      "Bundle links follow this checkout; rerun dry-run after bundle/selection changes. Existing conflicting paths are preserved.",
    ],
  };
  if (apply && blockers.length === 0) {
    await applyProvisioning(writes, links);
    result.applied = true;
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    const keys = {
      "--paseo-home": "paseoHome",
      "--codex-home": "codexHome",
      "--claude-home": "claudeHome",
    };
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === "--apply") options.apply = true;
      else if (args[i] === "--help") {
        console.log(
          "node slp/setup-provider-homes.mjs [--paseo-home PATH] [--codex-home PATH] [--claude-home PATH] [--apply]\nDefault: dry-run on checkout .dev homes. Apply provisions config/bundle links only; it does not authenticate or activate.",
        );
        process.exit(0);
      } else if (keys[args[i]] && args[i + 1] && !args[i + 1].startsWith("--"))
        options[keys[args[i]]] = args[++i];
      else throw new Error("Unknown option or missing home path. Use --help.");
    }
    const result = await setupProviderHomes(options);
    console.log(JSON.stringify(result, null, 2));
    if (result.blockers.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
