import { z } from "zod";

export const watcherTriggerClasses = {
  destructive: "urgent",
  "minted API": "report",
  "unapproved trade-off": "report",
  "human needed": "report",
  "check answer": "report",
  framing: "report",
  coordination: "report",
  "over-coordination": "report",
  "acceptance gap": "report",
  "scope drift": "report",
  collision: "report",
  stall: "report",
  "direction change": "log",
  struggle: "log",
  acceptance: "log",
} as const;

const WatcherTriggerSchema = z.enum([
  "destructive",
  "minted API",
  "unapproved trade-off",
  "human needed",
  "check answer",
  "framing",
  "coordination",
  "over-coordination",
  "acceptance gap",
  "scope drift",
  "collision",
  "stall",
  "direction change",
  "struggle",
  "acceptance",
]);

const WatcherEventSchema = z
  .object({
    trigger: WatcherTriggerSchema,
    class: z.enum(["urgent", "report", "log"]),
    agentId: z.string().trim().min(1),
    role: z.enum(["lead", "peer"]),
    what: z.string().trim().min(1).max(1_000),
    quote: z.string().trim().min(1).max(6_000),
    sourceRefs: z.array(z.string().trim().min(1)).min(1).max(20),
    where: z.string().trim().min(1).max(1_000),
    whyItMayMatter: z.string().trim().min(1).max(1_000),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.quote.split(/\r?\n/u).length > 10) {
      context.addIssue({ code: "custom", message: "event quote must not exceed ten lines" });
    }
  });

const WatcherResultSchema = z
  .object({
    status: z.enum(["quiet", "attention", "partial", "failed"]),
    coverage: z.enum(["complete", "partial", "failed"]),
    summary: z.string().trim().min(1).max(2_000),
    sourceRefs: z.array(z.string().trim().min(1)).max(50),
    // COMPAT(watcherTriggerEvents): added in v0.1.0, remove after 2026-12-14 once
    // Watchers created with the earlier result contract are outside support.
    events: z.array(WatcherEventSchema).max(50).default([]),
    changed: z.string().max(2_000),
    impact: z.string().max(2_000),
    unknowns: z.array(z.string().max(1_000)).max(20),
    question: z.string().max(1_000),
    state: z.string().trim().min(1).max(8_000),
  })
  .strict();

export type WatcherResult = z.infer<typeof WatcherResultSchema>;

type WatcherRole = z.infer<typeof WatcherEventSchema>["role"];
type AllowedAgents = ReadonlySet<string> | ReadonlyMap<string, WatcherRole>;

function allowedRole(
  allowedAgents: AllowedAgents,
  agentId: string,
): WatcherRole | null | undefined {
  if (allowedAgents instanceof Map) return allowedAgents.get(agentId);
  return allowedAgents.has(agentId) ? null : undefined;
}

function sourceRefAgentId(ref: string): string | null {
  return /^([^:]+):([^:]+):(\d+)$/.exec(ref)?.[1] ?? null;
}

function validateStatusContract(result: WatcherResult, suppliedEvents: boolean): string | null {
  if (result.status === "quiet" && result.coverage !== "complete") {
    return "quiet requires complete reader coverage";
  }
  if (result.status === "attention" && result.sourceRefs.length === 0) {
    return "attention requires at least one source reference";
  }
  if (suppliedEvents && result.status === "attention" && result.events.length === 0) {
    return "attention requires at least one trigger event";
  }
  if (result.status === "quiet" && result.events.length > 0) {
    return "quiet cannot contain trigger events";
  }
  if (result.status === "partial" && result.coverage !== "partial") {
    return "partial status requires partial coverage";
  }
  if (result.status === "failed" && result.coverage !== "failed") {
    return "failed status requires failed coverage";
  }
  return null;
}

function validateTopLevelReferences(
  result: WatcherResult,
  allowedAgents: AllowedAgents,
): string | null {
  for (const ref of result.sourceRefs) {
    const agentId = sourceRefAgentId(ref);
    if (!agentId || allowedRole(allowedAgents, agentId) === undefined) {
      return `unknown or malformed source reference: ${ref}`;
    }
  }
  return null;
}

function validateEvent(
  event: WatcherResult["events"][number],
  allowedAgents: AllowedAgents,
  eventRefs: Set<string>,
): string | null {
  const role = allowedRole(allowedAgents, event.agentId);
  if (role === undefined) return `trigger event names unknown agent: ${event.agentId}`;
  if (role !== null && role !== event.role) {
    return `trigger event role mismatch for ${event.agentId}: expected ${role}`;
  }
  if (watcherTriggerClasses[event.trigger] !== event.class) {
    return `trigger class mismatch for ${event.trigger}: expected ${watcherTriggerClasses[event.trigger]}`;
  }
  for (const ref of event.sourceRefs) {
    if (sourceRefAgentId(ref) !== event.agentId) {
      return `trigger event cites another agent: ${ref}`;
    }
    eventRefs.add(ref);
  }
  return null;
}

function validateEvents(result: WatcherResult, allowedAgents: AllowedAgents): string | null {
  const eventRefs = new Set<string>();
  for (const event of result.events) {
    const error = validateEvent(event, allowedAgents, eventRefs);
    if (error) return error;
  }
  const resultRefs = new Set(result.sourceRefs);
  if (eventRefs.size !== resultRefs.size || [...eventRefs].some((ref) => !resultRefs.has(ref))) {
    return "top-level sourceRefs must exactly match trigger event references";
  }
  return null;
}

export function parseWatcherResult(
  text: string,
  allowedAgents: AllowedAgents,
): { ok: true; result: WatcherResult } | { ok: false; error: string } {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text.trim());
  } catch {
    return { ok: false, error: "output is not one JSON object" };
  }
  const suppliedEvents =
    typeof decoded === "object" &&
    decoded !== null &&
    !Array.isArray(decoded) &&
    Object.hasOwn(decoded, "events");
  const parsed = WatcherResultSchema.safeParse(decoded);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid result" };
  const result = parsed.data;
  const statusError = validateStatusContract(result, suppliedEvents);
  if (statusError) return { ok: false, error: statusError };
  const referenceError = validateTopLevelReferences(result, allowedAgents);
  if (referenceError) return { ok: false, error: referenceError };
  const eventError = suppliedEvents ? validateEvents(result, allowedAgents) : null;
  if (eventError) return { ok: false, error: eventError };
  return { ok: true, result };
}

function formatWatcherEvent(event: WatcherResult["events"][number]): string {
  let prefix = "ATTENTION";
  if (event.class === "urgent") prefix = "ATTENTION (urgent)";
  if (event.class === "log") prefix = "ATTENTION (log)";
  return [
    `${prefix}: ${event.trigger} in ${event.agentId} (${event.role})`,
    `What: ${event.what}`,
    `Quote: ${event.quote}`,
    `Where: ${event.where}; sources ${event.sourceRefs.join(", ")}`,
    `Why it may matter: ${event.whyItMayMatter}`,
  ].join("\n");
}

export function formatWatcherReport(result: WatcherResult): string {
  return [
    `Status: ${result.status}; coverage: ${result.coverage}`,
    `Summary: ${result.summary}`,
    result.events.length ? result.events.map(formatWatcherEvent).join("\n\n") : "Events: none",
    result.sourceRefs.length
      ? `Sources: ${result.sourceRefs.join(", ")}`
      : "Sources: none available",
    `Changed: ${result.changed || "not established"}`,
    `Impact: ${result.impact || "not established"}`,
    result.unknowns.length ? `Unknowns: ${result.unknowns.join("; ")}` : "Unknowns: none recorded",
    `Question: ${result.question || "Inspect the cited evidence and decide whether intervention is needed."}`,
  ].join("\n");
}
