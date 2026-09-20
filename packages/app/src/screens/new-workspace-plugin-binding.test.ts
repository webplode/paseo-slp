import { describe, expect, it } from "vitest";
import type { ResolvedDraftComposerSelection } from "@/plugins/draft-composer-core";
import {
  buildNewWorkspacePluginDraftId,
  resolveNewWorkspacePluginSelection,
} from "./new-workspace-plugin-binding";

describe("New workspace plugin binding", () => {
  it("keeps host, project, and route draft identity isolated without a workspace id", () => {
    const base = buildNewWorkspacePluginDraftId({
      serverId: "host-a",
      projectViewKey: "host-a:project-a",
      draftId: "draft-a",
    });

    expect(
      buildNewWorkspacePluginDraftId({
        serverId: "host-a",
        projectViewKey: "host-a:project-a",
        draftId: "draft-a",
      }),
    ).toBe(base);
    expect(
      buildNewWorkspacePluginDraftId({
        serverId: "host-b",
        projectViewKey: "host-b:project-a",
        draftId: "draft-a",
      }),
    ).not.toBe(base);
    expect(
      buildNewWorkspacePluginDraftId({
        serverId: "host-a",
        projectViewKey: "host-a:project-b",
        draftId: "draft-a",
      }),
    ).not.toBe(base);

    // Both route drafts use the same host and project/cwd; the route draft is
    // still part of the persisted binding identity.
    const sameCwdDraftA = buildNewWorkspacePluginDraftId({
      serverId: "host-a",
      projectViewKey: "host-a:/fixture/repo",
      draftId: "route-draft-a",
    });
    const sameCwdDraftB = buildNewWorkspacePluginDraftId({
      serverId: "host-a",
      projectViewKey: "host-a:/fixture/repo",
      draftId: "route-draft-b",
    });
    expect(sameCwdDraftA).not.toBe(sameCwdDraftB);

    const fabricatedWorkspaceId = "workspace-fabricated-for-new-screen";
    expect(base).not.toContain(fabricatedWorkspaceId);
  });

  it("carries a complete profile binding and metadata into creation", () => {
    const selection: ResolvedDraftComposerSelection = {
      labels: { "slp.role": "peer", "slp.subrole": "reviewer" },
      dependencies: ["slp"],
      profileIds: ["fixture-review"],
      profile: { id: "fixture-review", provider: "codex", modelId: "fixture-model" },
    };

    expect(
      resolveNewWorkspacePluginSelection({
        selection,
        selectionError: null,
        provider: "codex",
      }),
    ).toEqual({ ready: true, ...selection });
  });

  it("blocks incomplete, stale, and provider-mismatched bindings", () => {
    expect(() =>
      resolveNewWorkspacePluginSelection({
        selection: { labels: { "slp.role": "lead" } },
        selectionError: "Choose an SLP profile.",
        provider: "codex",
      }),
    ).toThrow("Choose an SLP profile.");

    expect(() =>
      resolveNewWorkspacePluginSelection({
        selection: {
          profile: { id: "fixture-review", provider: "claude" },
          labels: { "slp.role": "peer" },
        },
        selectionError: null,
        provider: "codex",
      }),
    ).toThrow("no longer matches");
  });

  it("leaves an ordinary launch unbound when no plugin has a selection", () => {
    expect(
      resolveNewWorkspacePluginSelection({
        selection: null,
        selectionError: null,
        provider: "codex",
      }),
    ).toBeUndefined();
  });
});
