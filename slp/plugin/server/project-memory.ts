import { lstat, lstatSync, realpath, writeFile } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { bootstrapProjectMemoryRpc, inspectProjectMemoryRpc } from "../shared/project-memory";
import type { Role } from "../shared/roles";

export const workspaceProtocolName = "WORKSPACE_PROTOCOL.md";
export const supervisorNotebookName = "SUPERVISOR_NOTEBOOK.md";

const lstatAsync = promisify(lstat);
const realpathAsync = promisify(realpath);
const writeFileAsync = promisify(writeFile);

function inline(value: string): string {
  return value.replaceAll("`", "'").replaceAll("\n", " ").trim();
}

function workspaceProtocolTemplate(projectRoot: string): string {
  const projectName = inline(path.basename(projectRoot) || "project");
  return `# Workspace Protocol — ${projectName}

Owner: Human project owner. Version: 1. Applies to: \`${inline(projectRoot)}\`.
Readers: Lead; Supervisor only when asked to audit or improve this protocol.

- Risk and protected areas: unclassified. Lead reads existing repository instructions and current bytes before mutation.
- Default topology: Lead handles an exact tiny task or delegates the smallest useful Peer set when independent judgment is needed.
- Ownership: one writer owns each moving or coupled scope; concurrent writers use separate worktrees.
- Routing: discover available profiles, providers, models, modes, and budgets before pinning one assignment; do not silently substitute.
- Evidence: inspect the current diff and focused verification; lifecycle status and a passing test are not project acceptance.
- Escalation: use REOPEN_REQUEST, DEPENDENCY_REQUEST, or BLOCKED with evidence and the exact decision needed.
- Human decisions: Human keeps product, portfolio, cost, external-effect, security, data-loss, and irreversible decisions.
- Repository anti-patterns: none recorded yet. Add one only after a reproduced project-specific failure and include a review/removal trigger.
- Evolution: Supervisor records novel or materially stronger causal evidence in \`${supervisorNotebookName}\`; it proposes protocol changes and never applies its own proposal while merely observing.
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
    return { path: filePath, status: stats.isFile() ? ("ready" as const) : ("blocked" as const) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { path: filePath, status: "missing" as const };
    }
    return { path: filePath, status: "blocked" as const };
  }
}

async function resolveProjectRoot(
  workspaceId: string,
  { paseo }: PluginHandlerContext,
): Promise<string> {
  const workspace = await paseo.workspaces.ref(workspaceId).refresh();
  if (!workspace?.projectRootPath) {
    throw new Error(`Workspace ${workspaceId} is unavailable or has no project root.`);
  }
  return realpathAsync(workspace.projectRootPath);
}

async function snapshot(workspaceId: string, projectRoot: string) {
  const protocolPath = path.join(projectRoot, workspaceProtocolName);
  const notebookPath = path.join(projectRoot, supervisorNotebookName);
  const [protocol, notebook] = await Promise.all([state(protocolPath), state(notebookPath)]);
  return { workspaceId, projectRoot, protocol, notebook };
}

export async function inspectProjectMemory(
  { workspaceId }: RpcInput<typeof inspectProjectMemoryRpc>,
  context: PluginHandlerContext,
) {
  const root = await resolveProjectRoot(workspaceId, context);
  return snapshot(workspaceId, root);
}

async function createMissing(filePath: string, content: string): Promise<boolean> {
  try {
    await writeFileAsync(filePath, content, { encoding: "utf8", flag: "wx", mode: 0o644 });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

export async function bootstrapProjectMemory(
  { workspaceId }: RpcInput<typeof bootstrapProjectMemoryRpc>,
  context: PluginHandlerContext,
) {
  const root = await resolveProjectRoot(workspaceId, context);
  const before = await snapshot(workspaceId, root);
  if (before.protocol.status === "blocked" || before.notebook.status === "blocked") {
    throw new Error("Project memory path exists but is not a regular file.");
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
  return { snapshot: await snapshot(workspaceId, root), created };
}

function fileStatus(filePath: string): "ready" | "missing" | "blocked" {
  try {
    return lstatSync(filePath).isFile() ? "ready" : "blocked";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "blocked";
  }
}

export function projectMemoryInstructions(role: Role, cwd: string, notebookWriter = false): string {
  const root = path.resolve(cwd);
  const protocolPath = path.join(root, workspaceProtocolName);
  const notebookPath = path.join(root, supervisorNotebookName);
  const protocol = fileStatus(protocolPath);
  const notebook = fileStatus(notebookPath);
  if (role === "peer" || role === "watcher") return "";
  if (role === "lead") {
    return protocol === "ready"
      ? `## Project protocol\n\nRead \`${protocolPath}\` before orchestration. Extract only the constraints relevant to each Peer assignment.`
      : `## Project protocol\n\n\`${protocolPath}\` is ${protocol}. Do not invent repository policy; tell the Human that SLP project-memory bootstrap is owed.`;
  }
  const writeInstruction = notebookWriter
    ? `You hold the project notebook-writer lease. When the notebook is ready, read the relevant
existing pattern before writing. Record only a novel or material episode or materially stronger
evidence, and aggregate recurrence under the existing pattern. Preserve hypotheses, outcomes, and disproof.`
    : `You do not hold the project notebook-writer lease. Never edit the notebook; return a
PROPOSED_NOTEBOOK_RECORD to the Human when an episode merits durable capture.`;
  return `## Project causal memory

Workspace Protocol: \`${protocolPath}\` (${protocol}).
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
  paseo: Pick<PluginHandlerContext["paseo"], "workspaces">,
): Promise<string> {
  const canonicalCwd = await realpathAsync(cwd);
  const { entries } = await paseo.workspaces.list();
  const matches: string[] = [];
  for (const entry of entries) {
    try {
      if (
        (await realpathAsync(entry.workspaceDirectory)) === canonicalCwd &&
        entry.projectRootPath
      ) {
        matches.push(await realpathAsync(entry.projectRootPath));
      }
    } catch {
      // A stale workspace cannot establish project identity for this launch.
    }
  }
  const projectRoots = [...new Set(matches)];
  if (projectRoots.length === 1) return projectRoots[0]!;
  if (projectRoots.length > 1) {
    throw new Error(`SLP project memory is ambiguous for workspace directory ${cwd}.`);
  }
  throw new Error(`SLP cannot bind workspace directory ${cwd} to a project root.`);
}
