import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import type {
  AgentPersistenceHandle,
  AgentSessionConfig,
  AgentStreamEvent,
} from "../../agent-sdk-types.js";
import { createTestLogger } from "../../../../test-utils/test-logger.js";
import type { ProcessTerminator } from "../../../../utils/tree-kill.js";
import { AntigravityNativeAgentClient } from "./agent.js";

const FAKE_AGY_SOURCE = String.raw`
const fs = require("node:fs");
const path = require("node:path");

const argv = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = argv.indexOf(flag);
  return index === -1 ? null : argv[index + 1] || null;
};
const prompt = valueAfter("--print") || "";
const conversation = valueAfter("--conversation");
const addDirs = [];
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === "--add-dir" && argv[index + 1]) addDirs.push(argv[index + 1]);
}
const profileDir = addDirs[addDirs.length - 1] || null;
const agent = valueAfter("--agent");
let profileText = null;
if (profileDir && agent) {
  try {
    profileText = fs.readFileSync(
      path.join(profileDir, ".agents", "agents", agent, "agent.md"),
      "utf8",
    );
  } catch (error) {
    profileText = "PROFILE_READ_ERROR:" + error.message;
  }
}
fs.appendFileSync(
  process.env.AGY_TEST_LOG,
  JSON.stringify({
    cwd: process.cwd(),
    argv,
    addDirs,
    conversation,
    runtime: process.env.AGY_TEST_RUNTIME || null,
    context: process.env.AGY_TEST_CONTEXT || null,
    profileText,
  }) + "\n",
);

function finish(events, code) {
  for (const event of events) {
    process.stdout.write(JSON.stringify(event) + "\n");
  }
  process.stdout.end(() => process.exit(code || 0));
}

if (argv.includes("models")) {
  process.stdout.write("not-a-model\n");
  process.stdout.write("gemini-flash\tGemini Flash\n");
  process.stdout.write("gemini-pro\t\n");
  process.stdout.write("gemini-flash\tDuplicate\n");
  process.stdout.end(() => process.exit(0));
} else if (prompt === "__WAIT__") {
  const id = conversation || "native-conversation";
  process.on("SIGINT", () => finish([], 0));
  process.stdout.write(JSON.stringify({ event: "init", conversation_id: id }) + "\n");
  process.stdout.write(
    JSON.stringify({
      event: "step_update",
      step_update: {
        conversation_id: id,
        step_index: 1,
        state: "ACTIVE",
        step_type: "tool",
        tool_name: "wait_tool",
        tool_info: { input: { scope: "test" } },
      },
    }) + "\n",
    () => {
      setInterval(() => {}, 1000);
    },
  );
} else if (prompt === "__EXIT__") {
  process.stderr.write("native process failed\n", () => process.exit(23));
} else {
  const id = prompt === "__MISMATCH__" ? "wrong-conversation" : conversation || "native-conversation";
  if (prompt === "__ERROR__") {
    finish([
      { event: "init", conversation_id: id },
      {
        event: "result",
        result: { conversation_id: id, status: "ERROR", error: "native failure" },
      },
    ], 0);
  } else if (prompt === "__MISMATCH__") {
    finish([
      { event: "result", result: { conversation_id: id, status: "SUCCESS", response: "wrong" } },
    ], 0);
  } else if (prompt === "__DELTA__") {
    finish([
      { event: "init", conversation_id: id },
      {
        event: "step_update",
        step_update: { conversation_id: id, step_type: "agent_response", text_delta: "Hel" },
      },
      {
        event: "step_update",
        step_update: { conversation_id: id, step_type: "agent_response", text_delta: "lo" },
      },
      {
        event: "result",
        result: {
          conversation_id: id,
          status: "SUCCESS",
          response: "Hello",
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ], 0);
  } else {
    finish([
      { event: "init", conversation_id: id },
      { event: "result", result: { conversation_id: id, status: "SUCCESS", response: "ok" } },
    ], 0);
  }
}
`;

interface FakeInvocation {
  cwd: string;
  argv: string[];
  addDirs: string[];
  conversation: string | null;
  runtime: string | null;
  context: string | null;
  profileText: string | null;
}

interface FakeCli {
  root: string;
  workspace: string;
  script: string;
  log: string;
  readInvocations(): Promise<FakeInvocation[]>;
}

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createFakeCli(): Promise<FakeCli> {
  const root = await mkdtemp(join(tmpdir(), "paseo-antigravity-contract-"));
  tempRoots.push(root);
  const workspace = await mkdtemp(join(root, "workspace-"));
  const script = join(root, "fake-agy.cjs");
  const log = join(root, "invocations.ndjson");
  await writeFile(script, FAKE_AGY_SOURCE, { encoding: "utf8", mode: 0o700 });
  return {
    root,
    workspace,
    script,
    log,
    async readInvocations() {
      let contents = "";
      try {
        contents = await readFile(log, "utf8");
      } catch {
        return [];
      }
      return contents
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as FakeInvocation);
    },
  };
}

function createClient(fake: FakeCli, options?: { terminateProcess?: ProcessTerminator }) {
  return new AntigravityNativeAgentClient({
    logger: createTestLogger(),
    temporaryRoot: join(fake.root, "profiles"),
    runtimeSettings: {
      command: {
        mode: "replace",
        argv: [process.execPath, fake.script, "--configured-command"],
      },
      env: {
        AGY_TEST_LOG: fake.log,
        AGY_TEST_RUNTIME: "runtime-override",
      },
    },
    ...(options?.terminateProcess ? { terminateProcess: options.terminateProcess } : {}),
  });
}

async function waitForInvocation(
  fake: FakeCli,
  predicate: (invocation: FakeInvocation) => boolean,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await fake.readInvocations()).some(predicate)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for fake Antigravity invocation");
}

function sessionConfig(
  cwd: string,
  overrides: Partial<AgentSessionConfig> = {},
): AgentSessionConfig {
  return { provider: "antigravity", cwd, ...overrides };
}

describe("Antigravity native provider", () => {
  test("uses the command, cwd, and environment overrides for a full-access session", async () => {
    const fake = await createFakeCli();
    const client = createClient(fake);
    const session = await client.createSession(sessionConfig(fake.workspace), {
      env: { AGY_TEST_CONTEXT: "context-override" },
    });

    try {
      await expect(session.run("hello")).resolves.toMatchObject({
        sessionId: "native-conversation",
        finalText: "ok",
      });
      const [invocation] = await fake.readInvocations();
      expect(invocation).toMatchObject({
        cwd: await realpath(fake.workspace),
        runtime: "runtime-override",
        context: "context-override",
      });
      expect(invocation?.argv).toEqual([
        "--configured-command",
        "--add-dir",
        fake.workspace,
        "--dangerously-skip-permissions",
        "--print",
        "hello",
        "--output-format",
        "stream-json",
        "--print-timeout",
        "30m",
      ]);
    } finally {
      await session.close();
    }
  });

  test("keeps custom instructions and the native conversation across resume", async () => {
    const fake = await createFakeCli();
    const client = createClient(fake);
    const instructions = "Keep this exact native instruction.";
    const session = await client.createSession(
      sessionConfig(fake.workspace, { systemPrompt: instructions }),
    );

    let handle: AgentPersistenceHandle | null = null;
    try {
      await session.run("first");
      await session.run("second");
      handle = session.describePersistence();
    } finally {
      await session.close();
    }

    expect(handle).toMatchObject({
      provider: "antigravity",
      sessionId: "native-conversation",
      nativeHandle: "native-conversation",
    });
    const resumed = await client.resumeSession(handle!);
    try {
      await resumed.run("resumed");
    } finally {
      await resumed.close();
    }

    const turns = (await fake.readInvocations()).filter((invocation) =>
      invocation.argv.includes("--print"),
    );
    expect(turns).toHaveLength(3);
    expect(turns.map((invocation) => invocation.conversation)).toEqual([
      null,
      "native-conversation",
      "native-conversation",
    ]);
    expect(turns.every((invocation) => invocation.profileText?.includes(instructions))).toBe(true);
    expect(turns[0]?.argv).toContain("--agent");
  });

  test("treats step update text as deltas and does not duplicate the final response", async () => {
    const fake = await createFakeCli();
    const session = await createClient(fake).createSession(sessionConfig(fake.workspace));

    try {
      await expect(session.run("__DELTA__")).resolves.toMatchObject({
        sessionId: "native-conversation",
        finalText: "Hello",
        timeline: [
          { type: "assistant_message", text: "Hel" },
          { type: "assistant_message", text: "lo" },
        ],
      });
    } finally {
      await session.close();
    }
  });

  test("fails when a resumed turn reports a different native conversation", async () => {
    const fake = await createFakeCli();
    const session = await createClient(fake).createSession(sessionConfig(fake.workspace));

    try {
      await session.run("first");
      await expect(session.run("__MISMATCH__")).rejects.toThrow(
        "resumed conversation 'wrong-conversation' instead of expected 'native-conversation'",
      );
    } finally {
      await session.close();
    }
  });

  test("surfaces native result errors and nonzero exits", async () => {
    const fake = await createFakeCli();
    const session = await createClient(fake).createSession(sessionConfig(fake.workspace));

    try {
      await expect(session.run("__ERROR__")).rejects.toThrow(
        "Antigravity result ERROR: native failure",
      );
      await expect(session.run("__EXIT__")).rejects.toThrow("native process failed");
    } finally {
      await session.close();
    }
  });

  test.skipIf(process.platform === "win32")(
    "settles cancellation after the canceled terminal and accepts a later turn",
    async () => {
      const fake = await createFakeCli();
      const terminator: ProcessTerminator = async (child, options) => {
        child.kill(options.gracefulSignal);
        await new Promise<void>((resolve) => child.once?.("exit", () => resolve()));
        return "terminated";
      };
      const session = await createClient(fake, { terminateProcess: terminator }).createSession(
        sessionConfig(fake.workspace),
      );
      const events: AgentStreamEvent[] = [];
      const unsubscribe = session.subscribe((event) => events.push(event));

      try {
        const waitingTurn = session.run("__WAIT__");
        await waitForInvocation(fake, (invocation) => invocation.argv.includes("__WAIT__"));
        await session.interrupt();
        await expect(waitingTurn).resolves.toMatchObject({ finalText: "" });
        expect(
          events.filter((event) => event.type === "timeline").map((event) => event.item),
        ).toEqual([
          expect.objectContaining({ type: "tool_call", name: "wait_tool", status: "running" }),
          expect.objectContaining({
            type: "tool_call",
            name: "wait_tool",
            status: "canceled",
            error: null,
          }),
        ]);
        expect(events.at(-1)?.type).toBe("turn_canceled");

        await expect(session.run("after-cancel")).resolves.toMatchObject({
          sessionId: "native-conversation",
          finalText: "ok",
        });
      } finally {
        unsubscribe();
        await session.close();
      }
    },
  );

  test("discovers models from native TSV output", async () => {
    const fake = await createFakeCli();
    const client = createClient(fake);

    await expect(
      client.fetchCatalog({ scope: "workspace", cwd: await realpath(fake.workspace), force: true }),
    ).resolves.toMatchObject({
      models: [
        {
          provider: "antigravity",
          id: "gemini-flash",
          label: "Gemini Flash",
          isDefault: true,
        },
        {
          provider: "antigravity",
          id: "gemini-pro",
          label: "gemini-pro",
          isDefault: false,
        },
      ],
    });
    const [invocation] = await fake.readInvocations();
    expect(invocation).toMatchObject({
      cwd: await realpath(fake.workspace),
      runtime: "runtime-override",
    });
    expect(invocation?.argv).toEqual(["--configured-command", "models"]);
  });

  test("rejects image prompts before spawning native Antigravity", async () => {
    const fake = await createFakeCli();
    const session = await createClient(fake).createSession(sessionConfig(fake.workspace));

    try {
      await expect(
        session.run([
          { type: "text", text: "describe this" },
          { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
        ]),
      ).rejects.toThrow("Native Antigravity currently accepts text prompts only");
      expect(await fake.readInvocations()).toEqual([]);
    } finally {
      await session.close();
    }
  });
});
