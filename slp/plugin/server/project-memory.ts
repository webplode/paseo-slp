import { lstat, lstatSync, realpath, writeFile } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import type { PluginServerActivationContext } from "@getpaseo/plugin/server";
import type { Role } from "../shared/roles";

type PaseoApi = PluginServerActivationContext["paseo"];
type PaseoProject = Awaited<ReturnType<PaseoApi["projects"]["list"]>>["projects"][number];

export const workspaceProtocolName = "WORKSPACE_PROTOCOL.md";
export const supervisorNotebookName = "SUPERVISOR_NOTEBOOK.md";

const lstatAsync = promisify(lstat);
const realpathAsync = promisify(realpath);
const writeFileAsync = promisify(writeFile);

export interface ProjectMemoryFile {
  path: string;
  status: "ready" | "missing" | "blocked";
}

export interface ProjectMemorySnapshot {
  projectRoot: string;
  protocol: ProjectMemoryFile;
  notebook: ProjectMemoryFile;
}

export interface ProjectMemoryBootstrapResult {
  snapshot: ProjectMemorySnapshot;
  created: Array<typeof workspaceProtocolName | typeof supervisorNotebookName>;
}

export interface ProjectMemoryBootstrapRegistration {
  ready: Promise<void>;
  cleanup(): Promise<void>;
}

type ProjectLookupApi = Pick<PaseoApi, "projects" | "workspaces">;

function inline(value: string): string {
  return value.replaceAll("`", "'").replaceAll("\n", " ").trim();
}

function workspaceProtocolTemplate(projectRoot: string): string {
  const projectName = inline(path.basename(projectRoot) || "project");
  return `# Workspace Protocol — ${projectName}

Owner: Human project owner. Version: 1. Applies to: \`${inline(projectRoot)}\`.
Readers: Lead, Peer, and Supervisor after \`$PASEO_HOME/workspace_protocol.md\`.

This file holds only repository-specific tactics. It supplements the global contract and assignments.

- Scope and user outcome: unclassified.
- Risk and protected areas: unclassified; read existing repository instructions and current bytes before mutation.
- Architecture and design delta: none recorded.
- Ownership hotspots and shared contracts: none recorded.
- Routing delta: none recorded.
- Evidence and acceptance delta: current diff plus focused verification; add observable product proof when the outcome requires it.
- Tests and operations: use the repository's existing focused commands; serialize shared or heavy resources.
- Tracking and status source: current assignment and Git evidence; no issue tracker selected.
- Repository anti-patterns: none recorded.
- Evolution: record causal evidence in \`${supervisorNotebookName}\`; propose the smallest local rule with a review or removal trigger.
`;
}

function supervisorNotebookTemplate(projectRoot: string): string {
  return `# Supervisor Notebook — ${inline(path.basename(projectRoot) || "project")}

Scope: durable causal learning for \`${inline(projectRoot)}\` across its Paseo workspaces.
Owner: Human project owner. Writer: the currently assigned Supervisor.

This notebook records only novel or material coordination episodes, recurring anti-patterns,
recovery, and protocol experiments. It is not a transcript, task tracker, product decision log,
or acceptance authority. Aggregate repeated evidence under the same pattern. Keep suspected
mechanisms as hypotheses until evidence supports them, and preserve later disproof.

## Record shape

\`\`\`text
Pattern / episode:
Scope + date:
Observation:
Evidence:
Suspected mechanism: <hypothesis | unknown>
Impact / cost:
Open question for Lead:
Recovery / intervention:
Outcome:
Pattern status: <one-off | repeated | durable | disproved>
Recommendation / protocol candidate: <smallest correction | none>
Human decision needed:
\`\`\`

## Material records

No material records yet.
`;
}

async function state(filePath: string) {
  try {
    const stats = await lstatAsync(filePath);
    return {
      path: filePath,
      status: stats.isFile() ? ("ready" as const) : ("blocked" as const),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { path: filePath, status: "missing" as const };
    }
    return { path: filePath, status: "blocked" as const };
  }
}

async function resolveProjectRootPath(projectRootPath: string): Promise<string> {
  let root: string;
  try {
    root = await realpathAsync(projectRootPath);
  } catch (error) {
    throw new Error(`Registered project root is unavailable: ${projectRootPath}`, { cause: error });
  }
  let stats;
  try {
    stats = await lstatAsync(root);
  } catch (error) {
    throw new Error(`Registered project root is unavailable: ${projectRootPath}`, { cause: error });
  }
  if (!stats.isDirectory()) {
    throw new Error(`Registered project root is not a directory: ${projectRootPath}`);
  }
  return root;
}

async function snapshot(projectRoot: string): Promise<ProjectMemorySnapshot> {
  const protocolPath = path.join(projectRoot, workspaceProtocolName);
  const notebookPath = path.join(projectRoot, supervisorNotebookName);
  const [protocol, notebook] = await Promise.all([state(protocolPath), state(notebookPath)]);
  return { projectRoot, protocol, notebook };
}

async function createMissing(filePath: string, content: string): Promise<boolean> {
  try {
    await writeFileAsync(filePath, content, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o644,
    });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw new Error(`Unable to bootstrap project memory file ${filePath}`, {
      cause: error,
    });
  }
}

export async function bootstrapProjectMemory(
  projectRootPath: string,
): Promise<ProjectMemoryBootstrapResult> {
  const root = await resolveProjectRootPath(projectRootPath);
  const before = await snapshot(root);
  if (before.protocol.status === "blocked" || before.notebook.status === "blocked") {
    const blocked = [before.protocol, before.notebook].find((file) => file.status === "blocked");
    throw new Error(
      `Project memory path is blocked or not a regular file: ${blocked?.path ?? root}`,
    );
  }
  const created: Array<typeof workspaceProtocolName | typeof supervisorNotebookName> = [];
  if (
    before.protocol.status === "missing" &&
    (await createMissing(before.protocol.path, workspaceProtocolTemplate(root)))
  ) {
    created.push(workspaceProtocolName);
  }
  if (
    before.notebook.status === "missing" &&
    (await createMissing(before.notebook.path, supervisorNotebookTemplate(root)))
  ) {
    created.push(supervisorNotebookName);
  }
  const after = await snapshot(root);
  if (after.protocol.status === "blocked" || after.notebook.status === "blocked") {
    const blocked = [after.protocol, after.notebook].find((file) => file.status === "blocked");
    throw new Error(
      `Project memory path is blocked or not a regular file: ${blocked?.path ?? root}`,
    );
  }
  return { snapshot: after, created };
}

function fileStatus(filePath: string): "ready" | "missing" | "blocked" {
  try {
    return lstatSync(filePath).isFile() ? "ready" : "blocked";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "blocked";
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logBootstrapFailure(project: PaseoProject, error: unknown): void {
  console.error(
    `[SLP] Project memory bootstrap failed for ${project.projectId} at ${
      project.projectRootPath
    }: ${describeError(error)}`,
  );
}

export function startProjectMemoryBootstrap(
  paseo: Pick<PaseoApi, "projects">,
): ProjectMemoryBootstrapRegistration {
  let disposed = false;
  const pending = new Set<Promise<void>>();

  const schedule = (project: PaseoProject): void => {
    if (disposed) return;
    let task!: Promise<void>;
    task = bootstrapProjectMemory(project.projectRootPath)
      .then((result) => {
        if (result.created.length > 0) {
          console.log(
            `[SLP] Bootstrapped ${result.created.join(
              ", ",
            )} for registered project ${project.projectId}`,
          );
        }
        return undefined;
      })
      .catch((error) => logBootstrapFailure(project, error))
      .finally(() => pending.delete(task));
    pending.add(task);
  };

  const unsubscribe = paseo.projects.subscribe((update) => {
    if (update.kind === "upsert") schedule(update.project);
  });
  const ready = Promise.resolve()
    .then(() => paseo.projects.list())
    .then(({ projects }) => {
      for (const project of projects) schedule(project);
      return Promise.all(pending);
    })
    .then(() => undefined)
    .catch((error) => {
      console.error(`[SLP] Registered project memory backfill failed: ${describeError(error)}`);
    });

  return {
    ready,
    async cleanup() {
      disposed = true;
      unsubscribe();
      await ready;
      await Promise.all(pending);
    },
  };
}

export function projectMemoryInstructions(
  role: Role,
  cwd: string,
  globalProtocolPath: string,
): string {
  const root = path.resolve(cwd);
  const protocolPath = path.join(root, workspaceProtocolName);
  const notebookPath = path.join(root, supervisorNotebookName);
  const protocol = fileStatus(protocolPath);
  const notebook = fileStatus(notebookPath);
  if (role === "watcher") return "";
  let readerAction =
    "Read it before judging a project deviation, relaying a project instruction, or proposing a protocol change.";
  if (role === "lead") {
    readerAction =
      "Read it before orchestration and carry the relevant constraints into each Peer assignment.";
  } else if (role === "peer") {
    readerAction =
      "Read it before project work and apply its tactics inside the exact assignment; ask Lead when a local rule or missing constraint affects the outcome.";
  }
  const protocolInstruction =
    protocol === "ready"
      ? `## Workspace protocols

Read the global protocol at \`${globalProtocolPath}\` first. Then read the
project-local protocol at \`${protocolPath}\`. ${readerAction}`
      : `## Workspace protocols

Read the global protocol at \`${globalProtocolPath}\` first. The project-local protocol
at \`${protocolPath}\` is ${protocol}. Report the exact bootstrap gap and do not invent
repository policy. Continue only work that does not depend on the missing local policy.`;
  if (role === "lead" || role === "peer") return protocolInstruction;
  const writeInstruction = `You automatically hold notebook-write authority for this bound project.
When the notebook is ready, read the relevant existing pattern before writing. Record only a novel
or material episode or materially stronger evidence, and aggregate recurrence under the existing
pattern. Preserve hypotheses, outcomes, and disproof. If another Supervisor is concurrently
writing, surface the concurrent-writer concern in your handback; do not invent a lock or lease.`;
  return `${protocolInstruction}

## Project causal memory

Supervisor Notebook: \`${notebookPath}\` (${notebook}).

${writeInstruction}
If the notebook is missing or blocked, return a PROPOSED_NOTEBOOK_RECORD with Pattern / episode,
Scope + date, Observation, Evidence, Suspected mechanism, Impact / cost, Open question for Lead,
Recovery / intervention, Outcome, Pattern status, Recommendation / protocol candidate, and Human
decision needed. Never create or replace the file from an agent turn.

Use structural anti-patterns progressively. Start with ordinary coordination guards. Use the
structural lens only when evidence shows repeated workaround, foundation-versus-local ambiguity,
architecture fog, a mechanism-free claim, or avoidable operational/performance/cognitive tax.
Check wrong product category or archetype, weak-foundation accommodation, bent code shape,
overengineering, local-excellence trap, and boundary/proof laundering. Treat every match as a
hypothesis and actively check exonerating evidence. Report BORING_STANDARD or JUSTIFIED_DEVIATION
when the mechanism and ownership fit the product constraint; do not use the lens as a checklist.`;
}

export async function resolveProjectMemoryRoot(
  cwd: string,
  paseo: ProjectLookupApi,
): Promise<string> {
  const canonicalCwd = await realpathAsync(cwd);
  const { projects } = await paseo.projects.list();
  const projectRoots = new Map<string, string>();
  for (const project of projects) {
    try {
      projectRoots.set(project.projectId, await resolveProjectRootPath(project.projectRootPath));
    } catch {
      // An unavailable registered project cannot establish identity for this launch.
    }
  }

  const directMatches = [...projectRoots.values()].filter((root) => root === canonicalCwd);
  if (directMatches.length === 1) return directMatches[0]!;
  if (directMatches.length > 1) {
    throw new Error(`SLP project memory is ambiguous for registered project directory ${cwd}.`);
  }

  const { entries } = await paseo.workspaces.list();
  const matches = new Set<string>();
  for (const entry of entries) {
    try {
      if ((await realpathAsync(entry.workspaceDirectory)) === canonicalCwd) {
        const root = projectRoots.get(entry.projectId);
        if (root) matches.add(root);
      }
    } catch {
      // A stale workspace cannot establish project identity for this launch.
    }
  }
  if (matches.size === 1) return [...matches][0]!;
  if (matches.size > 1) {
    throw new Error(`SLP project memory is ambiguous for workspace directory ${cwd}.`);
  }
  throw new Error(`SLP cannot bind ${cwd} to a registered Paseo project root.`);
}
