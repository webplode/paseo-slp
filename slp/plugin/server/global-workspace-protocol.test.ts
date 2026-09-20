import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bootstrapGlobalWorkspaceProtocol,
  globalWorkspaceProtocolName,
  resolveGlobalWorkspaceProtocolPath,
  resolvePaseoHome,
} from "./global-workspace-protocol";

const temporaryDirectories: string[] = [];

async function temporaryHome(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "slp-global-protocol-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("global Workspace Protocol bootstrap", () => {
  it("uses PASEO_HOME and defaults to the user's .paseo directory", () => {
    const customHome = path.join(tmpdir(), "custom-paseo-home");
    expect(resolvePaseoHome({ PASEO_HOME: customHome })).toBe(path.resolve(customHome));
    expect(resolvePaseoHome({})).toBe(path.join(homedir(), ".paseo"));
    expect(resolveGlobalWorkspaceProtocolPath({})).toBe(
      path.join(homedir(), ".paseo", globalWorkspaceProtocolName),
    );
  });

  it("creates the global Markdown file once from the bundled template", async () => {
    const paseoHome = await temporaryHome();

    const result = bootstrapGlobalWorkspaceProtocol({ PASEO_HOME: paseoHome });

    expect(result).toEqual({
      path: path.join(paseoHome, globalWorkspaceProtocolName),
      created: true,
    });
    const protocol = await readFile(result.path, "utf8");
    const sourceTemplate = await readFile(
      new URL("./workspace_protocol.md", import.meta.url),
      "utf8",
    );
    expect(protocol).toBe(sourceTemplate);
    expect(protocol).toContain("# SLP Global Workspace Protocol");
    expect(protocol).toContain("Read this file first");
  });

  it("preserves an existing user-owned protocol", async () => {
    const paseoHome = await temporaryHome();
    const protocolPath = path.join(paseoHome, globalWorkspaceProtocolName);
    await writeFile(protocolPath, "# User-owned global protocol\n", "utf8");

    const result = bootstrapGlobalWorkspaceProtocol({ PASEO_HOME: paseoHome });

    expect(result).toEqual({ path: protocolPath, created: false });
    await expect(readFile(protocolPath, "utf8")).resolves.toBe("# User-owned global protocol\n");
  });

  it("fails closed when the global protocol path is not a regular file", async () => {
    const paseoHome = await temporaryHome();
    await mkdir(path.join(paseoHome, globalWorkspaceProtocolName));

    expect(() => bootstrapGlobalWorkspaceProtocol({ PASEO_HOME: paseoHome })).toThrow(
      "is not a regular file",
    );
  });
});
