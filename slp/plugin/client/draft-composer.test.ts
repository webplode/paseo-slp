import { describe, expect, it } from "vitest";
import {
  filterProfilesForRole,
  retainSelectedDraftProfile,
  toDraftComposerProfile,
} from "./draft-composer";

const profiles = [
  {
    id: "lead-codex",
    name: "Lead Codex",
    provider: "codex",
    model: " gpt-5.4 ",
    thinkingOptionId: "high",
    notes: "[slp:lead]",
  },
  {
    id: "peer-scout",
    name: "Peer Scout",
    provider: "codex",
    notes: "[slp:peer:scout]",
  },
  {
    id: "peer-generic",
    name: "Peer Generic",
    provider: "claude",
    notes: "[slp:peer]",
  },
];

describe("SLP draft composer profile filtering", () => {
  it("retains explicit identity while loading but cannot restore a cleared or changed selection", () => {
    const profile = toDraftComposerProfile(profiles[0]!);
    const selection = { ready: false, profile };
    expect(retainSelectedDraftProfile(selection, profile.id)).toBe(profile);
    expect(retainSelectedDraftProfile(selection, undefined)).toBeUndefined();
    expect(retainSelectedDraftProfile(selection, "another-profile")).toBeUndefined();
    expect(retainSelectedDraftProfile(undefined, profile.id)).toBeUndefined();
  });

  it("filters by provider and role membership", () => {
    expect(filterProfilesForRole(profiles, "lead", null, ["codex"]).map(({ id }) => id)).toEqual([
      "lead-codex",
    ]);
    expect(filterProfilesForRole(profiles, "lead", null, ["claude"]).map(({ id }) => id)).toEqual(
      [],
    );
  });

  it("filters Peer profiles by specialization while retaining generic Peer profiles", () => {
    expect(
      filterProfilesForRole(profiles, "peer", "scout", ["codex", "claude"]).map(({ id }) => id),
    ).toEqual(["peer-scout", "peer-generic"]);
    expect(filterProfilesForRole(profiles, "peer", null, ["codex"])).toEqual([]);
  });

  it("maps the native profile identity without taking over form values", () => {
    expect(
      toDraftComposerProfile({
        ...profiles[0],
        featureValues: { effort: "high" },
      }),
    ).toEqual({
      id: "lead-codex",
      provider: "codex",
      modelId: "gpt-5.4",
      thinkingOptionId: "high",
      featureValues: { effort: "high" },
    });
  });
});
