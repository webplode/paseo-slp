import { describe, expect, it, vi } from "vitest";
import contribute from "./index.client";

describe("SLP client contributions", () => {
  it("registers only native draft role selection and profile settings", () => {
    const client = {
      addSettingsScreen: vi.fn(),
      addDraftComposer: vi.fn(),
      addSurface: vi.fn(),
      addSidebarItem: vi.fn(),
      addWorkspacePanel: vi.fn(),
      addCommandCenterItem: vi.fn(),
      openSettings: vi.fn(),
    };

    contribute(client as never);

    expect(client.addSettingsScreen).toHaveBeenCalledOnce();
    expect(client.addDraftComposer).toHaveBeenCalledOnce();
    expect(client.addSurface).not.toHaveBeenCalled();
    expect(client.addSidebarItem).not.toHaveBeenCalled();
    expect(client.addWorkspacePanel).not.toHaveBeenCalled();
    expect(client.addCommandCenterItem).not.toHaveBeenCalled();
  });
});
