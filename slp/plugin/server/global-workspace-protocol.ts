import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { globalWorkspaceProtocolTemplate } from "./workspace-protocol-template.generated";

export const globalWorkspaceProtocolName = "workspace_protocol.md";

export interface GlobalWorkspaceProtocolBootstrapResult {
  path: string;
  created: boolean;
}

export function resolvePaseoHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.PASEO_HOME ?? path.join(homedir(), ".paseo");
  let expanded = configured;
  if (configured === "~") {
    expanded = homedir();
  } else if (configured.startsWith(`~${path.sep}`)) {
    expanded = path.join(homedir(), configured.slice(2));
  }
  return path.resolve(expanded);
}

export function resolveGlobalWorkspaceProtocolPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolvePaseoHome(env), globalWorkspaceProtocolName);
}

function assertRegularProtocol(filePath: string): void {
  if (!lstatSync(filePath).isFile()) {
    throw new Error(`SLP global Workspace Protocol path is not a regular file: ${filePath}`);
  }
}

export function bootstrapGlobalWorkspaceProtocol(
  env: NodeJS.ProcessEnv = process.env,
): GlobalWorkspaceProtocolBootstrapResult {
  const paseoHome = resolvePaseoHome(env);
  const filePath = path.join(paseoHome, globalWorkspaceProtocolName);
  mkdirSync(paseoHome, { recursive: true, mode: 0o700 });
  try {
    assertRegularProtocol(filePath);
    return { path: filePath, created: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  try {
    writeFileSync(filePath, globalWorkspaceProtocolTemplate, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o644,
    });
    return { path: filePath, created: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw new Error(`Unable to bootstrap SLP global Workspace Protocol at ${filePath}`, {
        cause: error,
      });
    }
    assertRegularProtocol(filePath);
    return { path: filePath, created: false };
  }
}
