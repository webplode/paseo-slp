import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const markdownPath = path.join(
  pluginDirectory,
  "server",
  "workspace_protocol.md"
);
const generatedPath = path.join(
  pluginDirectory,
  "server",
  "workspace-protocol-template.generated.ts"
);
const markdown = await readFile(markdownPath, "utf8");
const generated = `// Generated from workspace_protocol.md. Do not edit by hand.\n// prettier-ignore\nexport const globalWorkspaceProtocolTemplate = ${JSON.stringify(
  markdown
)};\n`;

await writeFile(generatedPath, generated, "utf8");
