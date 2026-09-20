import { describe, expect, it } from "vitest";
import type { PluginDraftComposerSelection } from "@getpaseo/plugin/client";
import {
  invalidateDraftComposerSelection,
  resolveDraftComposerSelections,
} from "./draft-composer-core";

describe("draft composer selection resolution", () => {
  it("keeps role filters and dependencies while a profile is incomplete", () => {
    const result = resolveDraftComposerSelections({
      roles: {
        ready: false,
        profileIds: ["profile-lead"],
        dependencies: ["slp"],
        labels: { "role.intent": "lead" },
        error: "Choose a profile",
      },
    });

    expect(result.selection).toEqual({
      profileIds: ["profile-lead"],
      dependencies: ["slp"],
      labels: { "role.intent": "lead" },
    });
    expect(result.error).toBe("Choose a profile");
  });

  it("retains dependency-only metadata from a ready contribution", () => {
    const result = resolveDraftComposerSelections({
      dependency: { ready: true, dependencies: ["example-plugin"] },
    });

    expect(result).toEqual({
      selection: { dependencies: ["example-plugin"] },
      error: null,
    });
  });

  it("does not stale an explicit ordinary placeholder when its plugin is gone", () => {
    expect(resolveDraftComposerSelections({ roles: { ready: true } }, new Set<string>())).toEqual({
      selection: null,
      error: null,
    });
  });

  it("blocks stale selected metadata while preserving the selection intent", () => {
    const result = resolveDraftComposerSelections(
      {
        roles: {
          ready: true,
          profileIds: ["profile-lead"],
          dependencies: ["slp"],
          labels: { "role.intent": "lead" },
        },
      },
      new Set<string>(),
    );

    expect(result.selection).toEqual({
      profileIds: ["profile-lead"],
      dependencies: ["slp"],
      labels: { "role.intent": "lead" },
    });
    expect(result.error).toMatch(/no longer available/);
  });

  it("reports conflicting labels instead of silently overwriting one contribution", () => {
    const result = resolveDraftComposerSelections({
      first: { ready: true, labels: { "role.intent": "lead" } },
      second: { ready: true, labels: { "role.intent": "peer" } },
    });

    expect(result.selection).toEqual({ labels: { "role.intent": "lead" } });
    expect(result.error).toContain("role.intent");
  });

  it("preserves labels, filters, and dependencies when invalidating a contribution", () => {
    const selection: PluginDraftComposerSelection = {
      ready: true,
      profile: { id: "profile-lead", provider: "codex" },
      profileIds: ["profile-lead"],
      dependencies: ["slp"],
      labels: { "role.intent": "lead" },
    };

    expect(invalidateDraftComposerSelection(selection, "Plugin failed")).toEqual({
      ready: false,
      profileIds: ["profile-lead"],
      dependencies: ["slp"],
      labels: { "role.intent": "lead" },
      error: "Plugin failed",
    });
  });
});
