import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceDraftSubmissionStore } from "./workspace-draft-submission-store";

const { storageValues } = vi.hoisted(() => ({ storageValues: new Map<string, string>() }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storageValues.set(key, value);
    },
    removeItem: (key: string) => {
      storageValues.delete(key);
    },
  },
}));

beforeEach(async () => {
  await useWorkspaceDraftSubmissionStore.persist.rehydrate();
});

afterEach(() => {
  useWorkspaceDraftSubmissionStore.setState({
    pendingByDraftId: {},
    setupByDraftId: {},
    pluginSelectionsByDraftId: {},
  });
  storageValues.clear();
});

describe("workspace draft plugin selections", () => {
  it("restores generic binding identity after storage hydration without persisting pending messages", async () => {
    const selections = {
      "plugin:controls": {
        ready: true,
        labels: { role: "bounded", profile: "native-profile" },
        dependencies: ["plugin"],
        profileIds: ["native-profile"],
        profile: {
          id: "native-profile",
          provider: "codex",
          thinkingOptionId: "low",
          featureValues: { toggle: true },
        },
      },
    };
    const store = useWorkspaceDraftSubmissionStore.getState();
    store.setDraftPluginSelections({ draftId: "draft-a", selections });
    store.setPending({
      serverId: "host",
      workspaceId: "workspace",
      draftId: "draft-a",
      text: "pending",
      attachments: [],
      cwd: "/fixture",
      provider: "codex",
      clientMessageId: "message",
      timestamp: 1,
    });
    const saved = storageValues.get("workspace-draft-plugin-selections");
    expect(saved).toBeDefined();
    expect(Object.keys(JSON.parse(saved!).state)).toEqual(["pluginSelectionsByDraftId"]);
    useWorkspaceDraftSubmissionStore.setState({
      pluginSelectionsByDraftId: {},
      pendingByDraftId: {},
    });
    storageValues.set("workspace-draft-plugin-selections", saved!);
    await useWorkspaceDraftSubmissionStore.persist.rehydrate();
    expect(useWorkspaceDraftSubmissionStore.getState().pluginSelectionsByDraftId).toEqual({
      "draft-a": selections,
    });
    expect(useWorkspaceDraftSubmissionStore.getState().pendingByDraftId).toEqual({});
    expect(useWorkspaceDraftSubmissionStore.persist.hasHydrated()).toBe(true);
  });

  it("persists incomplete intent and removes its saved binding when the draft is cleared", async () => {
    const selections = {
      controls: {
        ready: false,
        dependencies: ["plugin"],
        labels: { role: "bounded" },
        error: "Choose a profile.",
      },
    };
    useWorkspaceDraftSubmissionStore
      .getState()
      .setDraftPluginSelections({ draftId: "draft-a", selections });
    const saved = storageValues.get("workspace-draft-plugin-selections")!;
    useWorkspaceDraftSubmissionStore.setState({ pluginSelectionsByDraftId: {} });
    storageValues.set("workspace-draft-plugin-selections", saved);
    await useWorkspaceDraftSubmissionStore.persist.rehydrate();
    expect(
      useWorkspaceDraftSubmissionStore.getState().pluginSelectionsByDraftId["draft-a"],
    ).toEqual(selections);
    useWorkspaceDraftSubmissionStore.getState().clearDraftPluginSelections({ draftId: "draft-a" });
    expect(
      JSON.parse(storageValues.get("workspace-draft-plugin-selections")!).state
        .pluginSelectionsByDraftId,
    ).toEqual({});
  });

  it("keeps selections isolated by draft id", () => {
    const store = useWorkspaceDraftSubmissionStore.getState();
    store.setDraftPluginSelections({
      draftId: "draft-a",
      selections: { roles: { ready: false, labels: { role: "lead" } } },
    });
    store.setDraftPluginSelections({
      draftId: "draft-b",
      selections: { roles: { ready: true, labels: { role: "peer" } } },
    });

    expect(useWorkspaceDraftSubmissionStore.getState().pluginSelectionsByDraftId).toEqual({
      "draft-a": { roles: { ready: false, labels: { role: "lead" } } },
      "draft-b": { roles: { ready: true, labels: { role: "peer" } } },
    });

    useWorkspaceDraftSubmissionStore.getState().clearDraftPluginSelections({ draftId: "draft-a" });
    expect(useWorkspaceDraftSubmissionStore.getState().pluginSelectionsByDraftId).toEqual({
      "draft-b": { roles: { ready: true, labels: { role: "peer" } } },
    });
  });

  it("ignores blank draft ids without touching existing selections", () => {
    useWorkspaceDraftSubmissionStore.getState().setDraftPluginSelections({
      draftId: "draft-a",
      selections: { roles: { ready: true } },
    });
    useWorkspaceDraftSubmissionStore.getState().setDraftPluginSelections({
      draftId: "  ",
      selections: { roles: { ready: false } },
    });

    expect(useWorkspaceDraftSubmissionStore.getState().pluginSelectionsByDraftId).toEqual({
      "draft-a": { roles: { ready: true } },
    });
  });
});
