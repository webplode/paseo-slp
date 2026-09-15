import { mkdtemp, mkdir, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bootstrapProjectMemory,
  inspectProjectMemory,
  projectMemoryInstructions,
  resolveProjectMemoryRoot,
} from "./project-memory";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "paseo-slp-memory-"));
  const context = {
    paseo: {
      workspaces: {
        ref: () => ({
          refresh: async () => ({ projectRootPath: root, workspaceDirectory: root }),
        }),
        list: async () => ({
          entries: [{ projectRootPath: root, workspaceDirectory: root }],
        }),
      },
    },
  } as never;
  return { root, context };
}

describe("SLP project memory", () => {
  it("bootstraps missing project files without overwriting them", async () => {
    const { root, context } = await fixture();
    expect(await inspectProjectMemory({ workspaceId: "workspace-1" }, context)).toMatchObject({
      protocol: { status: "missing" },
      notebook: { status: "missing" },
    });
    const first = await bootstrapProjectMemory({ workspaceId: "workspace-1" }, context);
    expect(first.created).toEqual(["WORKSPACE_PROTOCOL.md", "SUPERVISOR_NOTEBOOK.md"]);
    const protocolPath = path.join(root, "WORKSPACE_PROTOCOL.md");
    const original = await readFile(protocolPath, "utf8");
    expect((await bootstrapProjectMemory({ workspaceId: "workspace-1" }, context)).created).toEqual(
      [],
    );
    expect(await readFile(protocolPath, "utf8")).toBe(original);
  });

  it("fails closed when a target path is not a regular file", async () => {
    const { root, context } = await fixture();
    await mkdir(path.join(root, "SUPERVISOR_NOTEBOOK.md"));
    await expect(bootstrapProjectMemory({ workspaceId: "workspace-1" }, context)).rejects.toThrow(
      "not a regular file",
    );
  });

  it("binds memory to the project root instead of a worktree directory", async () => {
    const { root } = await fixture();
    const worktree = path.join(root, "worktrees", "change-a");
    await mkdir(worktree, { recursive: true });
    const worktreeContext = {
      paseo: {
        workspaces: {
          ref: () => ({
            refresh: async () => ({ projectRootPath: root, workspaceDirectory: worktree }),
          }),
        },
      },
    } as never;

    const result = await bootstrapProjectMemory(
      { workspaceId: "worktree-workspace" },
      worktreeContext,
    );
    const canonicalRoot = await realpath(root);
    expect(result.snapshot.projectRoot).toBe(canonicalRoot);
    expect(result.snapshot.notebook.path).toBe(path.join(canonicalRoot, "SUPERVISOR_NOTEBOOK.md"));
  });

  it("projects exact paths and progressive structural guidance by role", async () => {
    const { root, context } = await fixture();
    await bootstrapProjectMemory({ workspaceId: "workspace-1" }, context);
    const supervisor = projectMemoryInstructions("supervisor", root);
    expect(supervisor).toContain(path.join(root, "SUPERVISOR_NOTEBOOK.md"));
    expect(supervisor).toContain("BORING_STANDARD");
    expect(supervisor).toContain("boundary/proof laundering");
    expect(supervisor).toContain("do not hold the project notebook-writer lease");
    expect(projectMemoryInstructions("supervisor", root, true)).toContain(
      "hold the project notebook-writer lease",
    );
    expect(projectMemoryInstructions("lead", root)).toContain("Read");
    expect(projectMemoryInstructions("peer", root)).toBe("");
  });

  it("fails closed instead of treating an unbound worktree as a project root", async () => {
    const { root } = await fixture();
    const unknown = path.join(root, "unknown-worktree");
    await mkdir(unknown);
    await expect(
      resolveProjectMemoryRoot(unknown, {
        workspaces: {
          list: async () => ({ entries: [] }),
        },
      } as never),
    ).rejects.toThrow("cannot bind workspace directory");
  });
});
