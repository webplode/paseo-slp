import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  bootstrapProjectMemory,
  projectMemoryInstructions,
  resolveProjectMemoryRoot,
  startProjectMemoryBootstrap,
} from "./project-memory";

interface Project {
  projectId: string;
  projectRootPath: string;
}

function project(projectRootPath: string, projectId = "project-1"): Project {
  return { projectId, projectRootPath };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "paseo-slp-memory-"));
  return { root, project: project(root) };
}

describe("SLP project memory", () => {
  it("backfills every registered project on activation without a workspace", async () => {
    const { root, project: registeredProject } = await fixture();
    const subscribe = vi.fn().mockReturnValue(() => undefined);
    const paseo = {
      projects: {
        subscribe,
        list: vi.fn().mockResolvedValue({ projects: [registeredProject] }),
      },
    } as never;

    const registration = startProjectMemoryBootstrap(paseo);
    await registration.ready;

    expect(subscribe).toHaveBeenCalledOnce();
    const protocol = await readFile(path.join(root, "WORKSPACE_PROTOCOL.md"), "utf8");
    expect(protocol).toContain("# Workspace Protocol");
    expect(protocol).toContain("only repository-specific tactics");
    expect(protocol.trimEnd().split("\n").length).toBeLessThanOrEqual(40);
    expect(protocol).not.toContain("Runtime full access");
    await expect(readFile(path.join(root, "SUPERVISOR_NOTEBOOK.md"), "utf8")).resolves.toContain(
      "# Supervisor Notebook",
    );
    await registration.cleanup();
  });

  it("bootstraps a project added after activation without a workspace or agent", async () => {
    const initial = await fixture();
    const added = await fixture();
    let onProjectUpdate: ((update: unknown) => void) | undefined;
    const paseo = {
      projects: {
        subscribe: vi.fn((handler: (update: unknown) => void) => {
          onProjectUpdate = handler;
          return () => {
            onProjectUpdate = undefined;
          };
        }),
        list: vi.fn().mockResolvedValue({ projects: [initial.project] }),
      },
    } as never;

    const registration = startProjectMemoryBootstrap(paseo);
    await registration.ready;
    onProjectUpdate?.({ kind: "upsert", project: added.project });
    await vi.waitFor(async () => {
      await expect(
        readFile(path.join(added.root, "WORKSPACE_PROTOCOL.md"), "utf8"),
      ).resolves.toContain("# Workspace Protocol");
    });
    await registration.cleanup();
  });

  it("subscribes before the initial list and removes the SDK subscription at cleanup", async () => {
    const { project: registeredProject } = await fixture();
    const order: string[] = [];
    const unsubscribe = vi.fn(() => order.push("unsubscribe"));
    const paseo = {
      projects: {
        subscribe: vi.fn((handler: (update: unknown) => void) => {
          order.push("subscribe");
          void handler;
          return unsubscribe;
        }),
        list: vi.fn(async () => {
          order.push("list");
          return { projects: [registeredProject] };
        }),
      },
    } as never;

    const registration = startProjectMemoryBootstrap(paseo);
    await registration.ready;
    expect(order.slice(0, 2)).toEqual(["subscribe", "list"]);
    await registration.cleanup();
    expect(order).toContain("unsubscribe");
  });

  it("preserves existing bytes and is race-safe for concurrent missing-only writes", async () => {
    const { root } = await fixture();
    const protocolPath = path.join(root, "WORKSPACE_PROTOCOL.md");
    const original = "Human-authored protocol\n";
    await writeFile(protocolPath, original, "utf8");

    await Promise.all([bootstrapProjectMemory(root), bootstrapProjectMemory(root)]);

    await expect(readFile(protocolPath, "utf8")).resolves.toBe(original);
    await expect(readFile(path.join(root, "SUPERVISOR_NOTEBOOK.md"), "utf8")).resolves.toContain(
      "# Supervisor Notebook",
    );
  });

  it("reports directory and symlink targets as blocked", async () => {
    const directoryTarget = await fixture();
    await mkdir(path.join(directoryTarget.root, "SUPERVISOR_NOTEBOOK.md"));
    await expect(bootstrapProjectMemory(directoryTarget.root)).rejects.toThrow(
      path.join(directoryTarget.root, "SUPERVISOR_NOTEBOOK.md"),
    );

    const symlinkTarget = await fixture();
    const outside = path.join(symlinkTarget.root, "outside.md");
    await writeFile(outside, "do not touch", "utf8");
    await symlink(outside, path.join(symlinkTarget.root, "SUPERVISOR_NOTEBOOK.md"));
    await expect(bootstrapProjectMemory(symlinkTarget.root)).rejects.toThrow(
      path.join(symlinkTarget.root, "SUPERVISOR_NOTEBOOK.md"),
    );
    await expect(readFile(outside, "utf8")).resolves.toBe("do not touch");
  });

  it("resolves one registered root for worktrees without bootstrapping their cwd", async () => {
    const { root, project: registeredProject } = await fixture();
    const worktreeA = path.join(root, "worktrees", "a");
    const worktreeB = path.join(root, "worktrees", "b");
    await mkdir(worktreeA, { recursive: true });
    await mkdir(worktreeB, { recursive: true });
    const paseo = {
      projects: {
        list: vi.fn().mockResolvedValue({ projects: [registeredProject] }),
      },
      workspaces: {
        list: vi.fn().mockResolvedValue({
          entries: [
            {
              projectId: registeredProject.projectId,
              workspaceDirectory: worktreeA,
            },
            {
              projectId: registeredProject.projectId,
              workspaceDirectory: worktreeB,
            },
          ],
        }),
      },
    } as never;

    await expect(resolveProjectMemoryRoot(worktreeA, paseo)).resolves.toBe(await realpath(root));
    await expect(resolveProjectMemoryRoot(worktreeB, paseo)).resolves.toBe(await realpath(root));
    await bootstrapProjectMemory(root);
    await expect(readFile(path.join(worktreeA, "WORKSPACE_PROTOCOL.md"), "utf8")).rejects.toThrow();
    await expect(
      readFile(path.join(worktreeB, "SUPERVISOR_NOTEBOOK.md"), "utf8"),
    ).rejects.toThrow();
  });

  it("binds a registered project root directly when no workspace exists", async () => {
    const { root, project: registeredProject } = await fixture();
    const paseo = {
      projects: {
        list: vi.fn().mockResolvedValue({ projects: [registeredProject] }),
      },
      workspaces: {
        list: vi.fn(() => {
          throw new Error("workspace listing must not be used for a direct project root");
        }),
      },
    } as never;

    await expect(resolveProjectMemoryRoot(root, paseo)).resolves.toBe(await realpath(root));
  });

  it("projects the global-then-local protocol order to every project role but Watcher", async () => {
    const { root } = await fixture();
    const globalProtocolPath = path.join(root, ".paseo", "workspace_protocol.md");
    await bootstrapProjectMemory(root);

    for (const role of ["lead", "peer", "supervisor"] as const) {
      const instructions = projectMemoryInstructions(role, root, globalProtocolPath);
      const localProtocolPath = path.join(root, "WORKSPACE_PROTOCOL.md");
      expect(instructions).toContain(globalProtocolPath);
      expect(instructions).toContain(localProtocolPath);
      expect(instructions.indexOf(globalProtocolPath)).toBeLessThan(
        instructions.indexOf(localProtocolPath),
      );
    }
    expect(projectMemoryInstructions("watcher", root, globalProtocolPath)).toBe("");
  });

  it("gives every bound Supervisor notebook-write authority without a label or lease", async () => {
    const { root } = await fixture();
    const instructions = projectMemoryInstructions(
      "supervisor",
      root,
      path.join(root, ".paseo", "workspace_protocol.md"),
    );
    expect(instructions).toContain("automatically hold notebook-write authority");
    expect(instructions).toContain("Preserve hypotheses, outcomes, and disproof");
    expect(instructions).toContain("concurrent-writer concern");
    expect(instructions).not.toContain("notebook-writer lease");
    expect(instructions).not.toContain("do not hold");
  });
});
