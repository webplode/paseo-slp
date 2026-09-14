import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const projectMemoryFileSchema = z.object({
  path: z.string(),
  status: z.enum(["ready", "missing", "blocked"]),
});

export const projectMemorySnapshotSchema = z.object({
  workspaceId: z.string(),
  projectRoot: z.string(),
  protocol: projectMemoryFileSchema,
  notebook: projectMemoryFileSchema,
});

export const inspectProjectMemoryRpc = defineRpc({
  name: "project-memory.inspect",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: projectMemorySnapshotSchema,
});

export const bootstrapProjectMemoryRpc = defineRpc({
  name: "project-memory.bootstrap",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: z.object({
    snapshot: projectMemorySnapshotSchema,
    created: z.array(z.enum(["WORKSPACE_PROTOCOL.md", "SUPERVISOR_NOTEBOOK.md"])),
  }),
});
