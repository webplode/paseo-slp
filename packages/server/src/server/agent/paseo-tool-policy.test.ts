import { describe, expect, test } from "vitest";
import type { ProviderPaseoToolsPolicy } from "@getpaseo/protocol/provider-config";

import { isPaseoToolEnabled, resolvePaseoToolPolicy } from "./paseo-tool-policy.js";

describe("Paseo tool policy", () => {
  test("defaults to all Paseo tools and resolves only the exact provider ID", () => {
    const customPolicy = {
      enabled: true,
      disabledTools: ["list_agents"],
    } satisfies ProviderPaseoToolsPolicy;

    expect(
      resolvePaseoToolPolicy("custom-claude", {
        claude: { paseoTools: { enabled: false } },
        "custom-claude": { paseoTools: customPolicy },
      }),
    ).toBe(customPolicy);
    expect(resolvePaseoToolPolicy("other-custom", { claude: { paseoTools: customPolicy } })).toBe(
      undefined,
    );
    expect(isPaseoToolEnabled(undefined, "list_agents")).toBe(true);
  });

  test("applies the provider gate and sparse disabled tools without filtering speak", () => {
    expect(isPaseoToolEnabled({ enabled: false }, "list_agents")).toBe(false);
    expect(isPaseoToolEnabled({ enabled: false }, "speak")).toBe(true);
    expect(
      isPaseoToolEnabled({ enabled: true, disabledTools: ["list_agents"] }, "list_agents"),
    ).toBe(false);
    expect(
      isPaseoToolEnabled({ enabled: true, disabledTools: ["list_agents"] }, "create_agent"),
    ).toBe(true);
  });

  test("applies an optional per-agent ceiling before provider exceptions", () => {
    expect(isPaseoToolEnabled(undefined, "list_agents", undefined)).toBe(true);
    expect(isPaseoToolEnabled(undefined, "speak", undefined)).toBe(true);
    expect(isPaseoToolEnabled(undefined, "list_agents", [])).toBe(false);
    expect(isPaseoToolEnabled(undefined, "speak", [])).toBe(false);
    expect(
      isPaseoToolEnabled({ disabledTools: ["create_agent"] }, "create_agent", [
        "create_agent",
        "list_agents",
      ]),
    ).toBe(false);
    expect(
      isPaseoToolEnabled({ disabledTools: ["create_agent"] }, "list_agents", [
        "create_agent",
        "list_agents",
      ]),
    ).toBe(true);
    expect(isPaseoToolEnabled(undefined, "new_future_tool", ["list_agents"])).toBe(false);
  });
});
