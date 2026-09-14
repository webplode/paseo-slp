import { describe, expect, it } from "vitest";
import { parseWatcherResult } from "./watcher-result";

const ids = new Set(["lead-1"]);
const base = {
  status: "quiet",
  coverage: "complete",
  summary: "No relevant change.",
  sourceRefs: [],
  events: [],
  changed: "",
  impact: "",
  unknowns: [],
  question: "",
  state: "lead-1 epoch-1:4; no unresolved issues",
};

describe("Watcher result validation", () => {
  it("accepts a complete quiet result", () => {
    expect(parseWatcherResult(JSON.stringify(base), ids)).toEqual(
      expect.objectContaining({ ok: true }),
    );
  });

  it("does not turn malformed, empty, or partial output into healthy", () => {
    expect(parseWatcherResult("", ids)).toEqual(expect.objectContaining({ ok: false }));
    expect(parseWatcherResult(JSON.stringify({ ...base, coverage: "partial" }), ids)).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(
      parseWatcherResult(JSON.stringify({ ...base, status: "attention", sourceRefs: [] }), ids),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("rejects references not supplied by covered evidence", () => {
    expect(
      parseWatcherResult(
        JSON.stringify({
          ...base,
          status: "attention",
          sourceRefs: ["other:epoch-1:3"],
        }),
        ids,
      ),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("accepts a trigger event with the canonical class and matching evidence", () => {
    expect(
      parseWatcherResult(
        JSON.stringify({
          ...base,
          status: "attention",
          sourceRefs: ["lead-1:epoch-1:3"],
          events: [
            {
              trigger: "coordination",
              class: "report",
              agentId: "lead-1",
              role: "lead",
              what: "Lead edited production code.",
              quote: "I patched src/service.ts.",
              sourceRefs: ["lead-1:epoch-1:3"],
              where: "activity around 14:20; src/service.ts",
              whyItMayMatter: "Coordination and implementation ownership may be combined.",
            },
          ],
        }),
        new Map<string, "lead" | "peer">([["lead-1", "lead"]]),
      ),
    ).toEqual(expect.objectContaining({ ok: true }));
  });

  it("rejects the wrong class, role, or evidence union for a trigger event", () => {
    const event = {
      trigger: "destructive",
      class: "report",
      agentId: "lead-1",
      role: "peer",
      what: "A destructive command was proposed.",
      quote: "git reset --hard",
      sourceRefs: ["lead-1:epoch-1:3"],
      where: "activity around 14:20",
      whyItMayMatter: "Work may be lost.",
    };
    expect(
      parseWatcherResult(
        JSON.stringify({
          ...base,
          status: "attention",
          sourceRefs: ["lead-1:epoch-1:3"],
          events: [event],
        }),
        new Map<string, "lead" | "peer">([["lead-1", "lead"]]),
      ),
    ).toEqual(expect.objectContaining({ ok: false }));

    expect(
      parseWatcherResult(
        JSON.stringify({
          ...base,
          status: "attention",
          sourceRefs: ["lead-1:epoch-1:4"],
          events: [{ ...event, class: "urgent", role: "lead" }],
        }),
        new Map<string, "lead" | "peer">([["lead-1", "lead"]]),
      ),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("keeps accepting legacy Watcher results without events", () => {
    const { events: _events, ...legacy } = base;
    expect(parseWatcherResult(JSON.stringify(legacy), ids)).toEqual(
      expect.objectContaining({ ok: true }),
    );
  });
});
