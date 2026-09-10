import { readFile } from "node:fs/promises";

const providers = {};
for (const role of ["supervisor", "lead", "peer"]) {
  const systemPrompt = await readFile(new URL(`./profiles/${role}.md`, import.meta.url), "utf8");
  for (const provider of ["codex", "antigravity"]) {
    providers[`${provider}-${role}`] = {
      extends: provider,
      label: `${provider} · ${role}`,
      systemPrompt,
      defaultModeId: "full-access",
      ...(role === "peer" ? { paseoTools: { enabled: false } } : {}),
    };
  }
}

process.stdout.write(`${JSON.stringify({ version: 1, agents: { providers } }, null, 2)}\n`);
