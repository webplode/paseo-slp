import { describe, expect, it, vi } from "vitest";
import { registerAttentionTrigger } from "./attention-trigger";

type TestHandler = (event: unknown, context: unknown) => Promise<void>;

function harness() {
  const handlers = new Map<string, TestHandler>();
  const send = vi.fn(async (_agentId: string, _prompt: string) => {});
  const snapshots = new Map<
    string,
    {
      id: string;
      workspaceId: string;
      labels: Record<string, string>;
      status?: "idle" | "running";
      archivedAt?: string | null;
    }
  >([
    ["lead-1", { id: "lead-1", workspaceId: "workspace-1", labels: { "slp.role": "lead" } }],
    ["peer-1", { id: "peer-1", workspaceId: "workspace-1", labels: { "slp.role": "peer" } }],
    [
      "watcher-1",
      {
        id: "watcher-1",
        workspaceId: "workspace-1",
        labels: {
          "slp.role": "watcher",
          "slp.attention": "workspace",
          "slp.watcher.supervisor": "supervisor-1",
          "slp.watcher.workspace": "workspace-1",
        },
      },
    ],
    [
      "supervisor-1",
      {
        id: "supervisor-1",
        workspaceId: "workspace-1",
        labels: { "slp.role": "supervisor", "slp.attention": "workspace" },
      },
    ],
    [
      "supervisor-2",
      {
        id: "supervisor-2",
        workspaceId: "workspace-2",
        labels: { "slp.role": "supervisor", "slp.attention": "workspace" },
      },
    ],
  ]);
  const context = {
    paseo: {
      agents: {
        ref: (id: string) => ({
          refresh: async () => ({ agent: snapshots.get(id) }),
          send: async (prompt: string) => send(id, prompt),
          archive: async () => {
            const snapshot = snapshots.get(id);
            if (snapshot) snapshot.archivedAt = "2026-09-13T00:00:00.000Z";
          },
        }),
        list: async ({
          filter,
        }: {
          filter: { labels: Record<string, string>; includeArchived?: boolean };
        }) => ({
          entries: [...snapshots.values()]
            .filter(
              (snapshot) =>
                (filter.includeArchived !== false || !snapshot.archivedAt) &&
                Object.entries(filter.labels).every(
                  ([name, value]) => snapshot.labels[name] === value,
                ),
            )
            .map((agent) => ({ agent })),
          pageInfo: { nextCursor: null, prevCursor: null, hasMore: false },
        }),
      },
    },
  };
  const server = {
    on: (name: string, handler: TestHandler) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
  };
  registerAttentionTrigger(server as never);
  return { context, handlers, send, snapshots };
}

function turn(agentId: string, outcome: unknown, text = "") {
  return {
    agent: { id: agentId, workspaceId: "workspace-1", title: agentId },
    outcome,
    timeline: text
      ? [
          ...(agentId === "watcher-1"
            ? [{ type: "user_message", text: "SLP Watcher scheduled sweep — machine route." }]
            : []),
          { type: "assistant_message", text },
        ]
      : [],
  };
}

function watcherTurn(text: string, sourceRefs: string[] = []) {
  return {
    agent: { id: "watcher-1", workspaceId: "workspace-1", title: "watcher-1" },
    outcome: { kind: "completed" },
    timeline: [
      { type: "user_message", text: "SLP Watcher scheduled sweep — machine route." },
      {
        type: "tool_call",
        callId: "list-1",
        name: "mcp__paseo__list_agents",
        status: "completed",
        error: null,
        detail: { type: "unknown", input: {}, output: { entries: ["lead-1", "peer-1"] } },
      },
      {
        type: "tool_call",
        callId: "activity-1",
        name: "mcp__paseo__get_agent_activity",
        status: "completed",
        error: null,
        detail: {
          type: "unknown",
          input: { agentId: "lead-1" },
          output: { rows: sourceRefs.map((sourceRef) => ({ sourceRef })) },
        },
      },
      { type: "assistant_message", text },
    ],
  };
}

function watcherResult(overrides: Record<string, unknown> = {}) {
  const status = overrides.status ?? "quiet";
  const sourceRefs = (overrides.sourceRefs as string[] | undefined) ?? [];
  const events =
    overrides.events ??
    (status === "attention" && sourceRefs[0]
      ? [
          {
            trigger: "stall",
            class: "report",
            agentId: "lead-1",
            role: "lead",
            what: "A blocker appeared.",
            quote: "The work is blocked.",
            sourceRefs,
            where: "Lead activity",
            whyItMayMatter: "Delivery may be blocked.",
          },
        ]
      : []);
  return JSON.stringify({
    status,
    coverage: "complete",
    summary: "No relevant change.",
    sourceRefs,
    changed: "",
    impact: "",
    unknowns: [],
    question: "",
    state: "lead-1 epoch:1; no unresolved observations",
    ...overrides,
    events,
  });
}

describe("SLP attention trigger", () => {
  it("wakes a same-workspace Watcher after a Lead turn without declaring a finding", async () => {
    const { context, handlers, send } = harness();
    await handlers.get("agent.turn_ended")?.(turn("lead-1", { kind: "completed" }), context);

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("watcher-1");
    expect(send.mock.calls[0]?.[1]).toContain("doorbells, not findings");
    expect(send.mock.calls[0]?.[1]).toContain("lead-1");
  });

  it("covers a newly created Lead in scope and excludes an unrelated workspace", async () => {
    const { context, handlers, send, snapshots } = harness();
    snapshots.set("lead-new", {
      id: "lead-new",
      workspaceId: "workspace-1",
      labels: { "slp.role": "lead" },
    });
    await handlers.get("agent.turn_ended")?.(turn("lead-new", { kind: "completed" }), context);
    expect(send.mock.calls[0]?.[0]).toBe("watcher-1");
    expect(send.mock.calls[0]?.[1]).toContain("lead-new");

    send.mockClear();
    snapshots.set("lead-other", {
      id: "lead-other",
      workspaceId: "workspace-2",
      labels: { "slp.role": "lead" },
    });
    await handlers.get("agent.turn_ended")?.(
      {
        ...turn("lead-other", { kind: "completed" }),
        agent: { id: "lead-other", workspaceId: "workspace-2", title: "lead-other" },
      },
      context,
    );
    expect(send.mock.calls.some((call) => call[0] === "watcher-1")).toBe(false);
    expect(send.mock.calls[0]?.[0]).toBe("supervisor-2");
  });

  it("does not wake on an ordinary completed Peer turn", async () => {
    const { context, handlers, send } = harness();
    await handlers.get("agent.turn_ended")?.(turn("peer-1", { kind: "completed" }), context);
    expect(send).not.toHaveBeenCalled();
  });

  it("routes a validated attention result only to the assigned Supervisor", async () => {
    const { context, handlers, send } = harness();
    await handlers.get("agent.turn_ended")?.(turn("lead-1", { kind: "completed" }), context);
    send.mockClear();

    await handlers.get("agent.turn_ended")?.(
      watcherTurn(
        watcherResult({
          status: "attention",
          sourceRefs: ["lead-1:epoch-1:3"],
          events: [
            {
              trigger: "struggle",
              class: "log",
              agentId: "lead-1",
              role: "lead",
              what: "A failed approach repeated after correction.",
              quote: "That didn't work; retrying the same command.",
              sourceRefs: ["lead-1:epoch-1:3"],
              where: "lead activity",
              whyItMayMatter: "The work may be looping.",
            },
          ],
          changed: "A failed approach repeated after correction.",
          impact: "Delivery is blocked.",
          question: "Should the Lead reconsider this approach?",
        }),
        ["lead-1:epoch-1:3"],
      ),
      context,
    );

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("supervisor-1");
    expect(send.mock.calls[0]?.[1]).toContain("inspect the cited original evidence independently");
    expect(send.mock.calls[0]?.[1]).toContain("lead-1:epoch-1:3");
    expect(send.mock.calls[0]?.[1]).toContain("ATTENTION (log): struggle in lead-1 (lead)");
  });

  it("validates Codex dot-qualified Paseo tool names", async () => {
    const { context, handlers, send } = harness();
    const event = watcherTurn(
      watcherResult({
        status: "attention",
        sourceRefs: ["lead-1:epoch-1:3"],
        changed: "A new blocker appeared.",
        impact: "Delivery is blocked.",
        question: "Should the Supervisor inspect it?",
      }),
      ["lead-1:epoch-1:3"],
    );
    for (const item of event.timeline) {
      if (item.type === "tool_call") {
        item.name = (item.name ?? "").replace("mcp__paseo__", "paseo.");
      }
    }

    await handlers.get("agent.turn_ended")?.(event, context);

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("supervisor-1");
    expect(send.mock.calls[0]?.[1]).toContain("SLP Watcher report");
    expect(send.mock.calls[0]?.[1]).not.toContain("failed evidence validation");
  });

  it("validates Antigravity call_mcp_tool wrappers on a no-user creation turn", async () => {
    const { context, handlers, send } = harness();
    const event = watcherTurn(
      watcherResult({
        status: "attention",
        sourceRefs: ["lead-1:epoch-1:3"],
        changed: "A new blocker appeared.",
        impact: "Delivery is blocked.",
        question: "Should the Supervisor inspect it?",
      }),
      ["lead-1:epoch-1:3"],
    );
    event.timeline.shift();
    for (const item of event.timeline) {
      if (item.type !== "tool_call") continue;
      const toolName = item.name?.includes("list_agents") ? "list_agents" : "get_agent_activity";
      item.name = "call_mcp_tool";
      item.detail = {
        ...item.detail,
        input: { ServerName: "paseo", ToolName: toolName, Arguments: item.detail?.input ?? {} },
      } as never;
    }

    await handlers.get("agent.turn_ended")?.(event, context);

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("supervisor-1");
    expect(send.mock.calls[0]?.[1]).toContain("SLP Watcher report");
    expect(send.mock.calls[0]?.[1]).not.toContain("failed evidence validation");
  });

  it("recognizes a scheduled sweep marker inside the native system wrapper", async () => {
    const { context, handlers, send } = harness();
    const event = watcherTurn(
      watcherResult({
        status: "attention",
        sourceRefs: ["lead-1:epoch-1:3"],
        changed: "A new blocker appeared.",
        impact: "Delivery is blocked.",
        question: "Should the Supervisor inspect it?",
      }),
      ["lead-1:epoch-1:3"],
    );
    event.timeline[0] = {
      type: "user_message",
      text: "<paseo-system>\nSchedule fired (id=test, run=test).\nSLP Watcher scheduled sweep — machine route.\n</paseo-system>",
    };

    await handlers.get("agent.turn_ended")?.(event, context);

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("supervisor-1");
    expect(send.mock.calls[0]?.[1]).toContain("SLP Watcher report");
  });

  it("does not disturb the Supervisor when the Watcher returns NO_ACTION", async () => {
    const { context, handlers, send } = harness();
    await handlers.get("agent.turn_ended")?.(turn("lead-1", { kind: "completed" }), context);
    send.mockClear();

    await handlers.get("agent.turn_ended")?.(watcherTurn(watcherResult()), context);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not require activity reads for Lead and Peer sessions that are archived", async () => {
    const { context, handlers, send, snapshots } = harness();
    snapshots.get("lead-1")!.archivedAt = "2026-09-13T00:00:00.000Z";
    snapshots.get("peer-1")!.archivedAt = "2026-09-13T00:00:00.000Z";
    const event = watcherTurn(watcherResult());
    event.timeline = event.timeline.filter(
      (item) => item.type !== "tool_call" || !item.name?.includes("get_agent_activity"),
    );

    await handlers.get("agent.turn_ended")?.(event, context);

    expect(send).not.toHaveBeenCalled();
  });

  it("parses only the final assistant response and ignores provider reasoning text", async () => {
    const { context, handlers, send } = harness();
    const event = watcherTurn(watcherResult());
    event.timeline.push({ type: "reasoning", text: "This is not part of the result." } as never);

    await handlers.get("agent.turn_ended")?.(event, context);

    expect(send).not.toHaveBeenCalled();
  });

  it("keeps a direct Human report visible without proactive routing", async () => {
    const { context, handlers, send } = harness();
    await handlers.get("agent.turn_ended")?.(
      {
        agent: { id: "watcher-1", workspaceId: "workspace-1", title: "watcher-1" },
        outcome: { kind: "completed" },
        timeline: [
          { type: "user_message", text: "Summarize last night." },
          { type: "assistant_message", text: "Human-readable historical report." },
        ],
      },
      context,
    );

    expect(send).not.toHaveBeenCalled();
  });

  it("queues one doorbell while the Watcher is busy and drains it after that turn", async () => {
    const { context, handlers, send, snapshots } = harness();
    snapshots.get("watcher-1")!.status = "running";
    await handlers.get("agent.turn_ended")?.(turn("lead-1", { kind: "completed" }), context);
    expect(send).not.toHaveBeenCalled();

    snapshots.get("watcher-1")!.status = "idle";
    await handlers.get("agent.turn_ended")?.(watcherTurn(watcherResult()), context);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("watcher-1");
  });

  it("repairs malformed output once and then reports explicit coverage failure", async () => {
    const { context, handlers, send } = harness();
    await handlers.get("agent.turn_ended")?.(
      turn("watcher-1", { kind: "completed" }, "not-json"),
      context,
    );
    expect(send.mock.calls[0]?.[0]).toBe("watcher-1");
    expect(send.mock.calls[0]?.[1]).toContain("Repair it once");
    send.mockClear();

    await handlers.get("agent.turn_ended")?.(
      turn("watcher-1", { kind: "completed" }, "still-not-json"),
      context,
    );
    expect(send.mock.calls[0]?.[0]).toBe("supervisor-1");
    expect(send.mock.calls[0]?.[1]).toContain("Coverage is failed");
  });

  it("rejects fabricated complete coverage without a reader call and does not format-repair it", async () => {
    const { context, handlers, send } = harness();
    await handlers.get("agent.turn_ended")?.(
      turn("watcher-1", { kind: "completed" }, watcherResult()),
      context,
    );

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("supervisor-1");
    expect(send.mock.calls[0]?.[1]).toContain("without a completed list_agents read");
    expect(send.mock.calls[0]?.[1]).not.toContain("Repair it once");
  });

  it("rejects a source reference that was not supplied by get_agent_activity", async () => {
    const { context, handlers, send } = harness();
    await handlers.get("agent.turn_ended")?.(
      watcherTurn(
        watcherResult({
          status: "attention",
          sourceRefs: ["lead-1:epoch-1:99"],
          changed: "A claimed blocker appeared.",
          impact: "Delivery may be blocked.",
          question: "Should this be inspected?",
        }),
      ),
      context,
    );

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("supervisor-1");
    expect(send.mock.calls[0]?.[1]).toContain("was not present in supplied get_agent_activity");
  });

  it("suppresses an unchanged non-quiet observation only when native history matches", async () => {
    const { context, handlers, send } = harness();
    const previous = watcherResult({
      status: "partial",
      coverage: "partial",
      changed: "A history gap appeared.",
      state: "lead-1 epoch:3; unresolved history gap",
    });
    const current = watcherTurn(
      watcherResult({
        status: "partial",
        coverage: "partial",
        changed: "",
        state: "lead-1 epoch:3; unresolved history gap",
      }),
    );
    current.timeline.unshift(
      { type: "user_message", text: "Earlier sweep." },
      { type: "assistant_message", text: previous },
    );

    await handlers.get("agent.turn_ended")?.(current, context);

    expect(send).not.toHaveBeenCalled();
  });

  it("routes a non-quiet empty change without matching native history as failed", async () => {
    const { context, handlers, send } = harness();
    await handlers.get("agent.turn_ended")?.(
      watcherTurn(watcherResult({ status: "partial", coverage: "partial", changed: "" })),
      context,
    );

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("supervisor-1");
    expect(send.mock.calls[0]?.[1]).toContain("failed change validation");
  });

  it("archives owned Watchers when their Supervisor is archived", async () => {
    const { context, handlers, snapshots } = harness();
    await handlers.get("agent.archived")?.(
      { agent: { id: "supervisor-1", workspaceId: "workspace-1", title: "Supervisor" } },
      context,
    );
    expect(snapshots.get("watcher-1")?.archivedAt).toBe("2026-09-13T00:00:00.000Z");
  });

  it("falls back to the same-workspace Supervisor when no Watcher is active", async () => {
    const { context, handlers, send, snapshots } = harness();
    snapshots.delete("watcher-1");
    await handlers.get("agent.turn_ended")?.(turn("lead-1", { kind: "completed" }), context);

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("supervisor-1");
    expect(send.mock.calls[0]?.[1]).toContain("no Watcher is active");
  });
});
