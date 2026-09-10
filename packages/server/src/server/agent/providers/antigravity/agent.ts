import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import type { ChildProcess } from "node:child_process";
import type { Logger } from "pino";

import type {
  AgentCapabilityFlags,
  AgentClient,
  AgentCreateSessionOptions,
  AgentResumeSessionOptions,
  AgentLaunchContext,
  AgentMode,
  AgentModelDefinition,
  AgentPermissionRequest,
  AgentPermissionResponse,
  AgentPersistenceHandle,
  AgentPromptInput,
  AgentProvider,
  AgentRunOptions,
  AgentRunResult,
  AgentRuntimeInfo,
  AgentSession,
  AgentSessionConfig,
  AgentStreamEvent,
  AgentUsage,
  FetchCatalogOptions,
  ProviderCatalog,
  ProviderRefreshContext,
  ResolveAgentCreateConfigInput,
  ResolveAgentCreateConfigResult,
  AgentCreateConfigUnattendedInput,
  ToolCallDetail,
  ToolCallTimelineItem,
} from "../../agent-sdk-types.js";
import { composeSystemPromptParts } from "../../system-prompt.js";
import {
  checkProviderLaunchAvailable,
  createProviderEnv,
  resolveProviderLaunch,
  type ProviderRuntimeSettings,
  type ResolvedProviderLaunch,
} from "../../provider-launch-config.js";
import { resolveDefaultAgentCreateConfig } from "../../create-agent-mode.js";
import {
  runProviderRefreshActivity,
  raceProviderRefreshAbort,
} from "../../provider-refresh-deadline.js";
import { runProviderTurn } from "../provider-runner.js";
import {
  buildBinaryDiagnosticRows,
  buildCommandResolutionDiagnosticRows,
  formatProviderDiagnostic,
  formatProviderDiagnosticError,
} from "../diagnostic-utils.js";
import { execCommand, spawnProcess } from "../../../../utils/spawn.js";
import { terminateWithTreeKill, type ProcessTerminator } from "../../../../utils/tree-kill.js";

export const ANTIGRAVITY_PROVIDER_ID = "antigravity";
export const ANTIGRAVITY_FULL_ACCESS_MODE_ID = "full-access";
export const ANTIGRAVITY_DEFAULT_MODE_ID = "default";
export const ANTIGRAVITY_ACCEPT_EDITS_MODE_ID = "accept-edits";
export const ANTIGRAVITY_PLAN_MODE_ID = "plan";

const DEFAULT_COMMAND = "agy";
const DEFAULT_PRINT_TIMEOUT = "30m";
const MAX_STDERR_LENGTH = 32 * 1024;

export const ANTIGRAVITY_MODES: AgentMode[] = [
  {
    id: ANTIGRAVITY_FULL_ACCESS_MODE_ID,
    label: "Full Access",
    description: "Run native Antigravity tools without interactive approval prompts.",
    icon: "ShieldOff",
    colorTier: "dangerous",
    isUnattended: true,
  },
  {
    id: ANTIGRAVITY_DEFAULT_MODE_ID,
    label: "Default",
    description: "Use Antigravity's default headless permission behavior.",
    icon: "Shield",
    colorTier: "safe",
  },
  {
    id: ANTIGRAVITY_ACCEPT_EDITS_MODE_ID,
    label: "Accept Edits",
    description: "Let Antigravity accept file edits while retaining its other checks.",
    icon: "ShieldPlus",
    colorTier: "moderate",
  },
  {
    id: ANTIGRAVITY_PLAN_MODE_ID,
    label: "Plan",
    description: "Use Antigravity plan mode for read-only analysis.",
    icon: "ShieldEllipsis",
    colorTier: "planning",
  },
];

const CAPABILITIES: AgentCapabilityFlags = {
  supportsStreaming: true,
  supportsSessionPersistence: true,
  supportsSessionListing: false,
  supportsDynamicModes: false,
  supportsMcpServers: false,
  supportsNativePaseoTools: false,
  supportsReasoningStream: false,
  supportsToolInvocations: true,
};

interface AntigravityProfile {
  name: string;
  addDir: string;
  cleanup(): Promise<void>;
}

interface AntigravityRawStepUpdate {
  conversation_id?: unknown;
  step_index?: unknown;
  state?: unknown;
  step_type?: unknown;
  text_delta?: unknown;
  tool_name?: unknown;
  tool_info?: unknown;
  usage?: unknown;
}

interface AntigravityRawResult {
  conversation_id?: unknown;
  status?: unknown;
  response?: unknown;
  error?: unknown;
  usage?: unknown;
}

interface AntigravityRawEvent {
  event?: unknown;
  conversation_id?: unknown;
  init?: { conversation_id?: unknown };
  step_update?: AntigravityRawStepUpdate;
  result?: AntigravityRawResult;
}

interface ParsedResult {
  status: string;
  response?: string;
  error?: string;
  usage?: AgentUsage;
}

interface ActiveTurn {
  turnId: string;
  child: ChildProcess;
  lines: ReadlineInterface;
  closed: Promise<void>;
  resolveClosed: () => void;
  stderr: string;
  spawnError: Error | null;
  result: ParsedResult | null;
  assistantText: string;
  lastUsageKey: string | null;
  canceled: boolean;
  conversationMismatch: string | null;
  toolCallIds: Map<string, string>;
  runningTools: Map<string, ToolCallTimelineItem>;
  toolCounter: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringifyError(value: unknown): string | undefined {
  const direct = stringValue(value)?.trim();
  if (direct) return direct;
  if (isRecord(value)) {
    const message = stringValue(value.message)?.trim();
    if (message) return message;
  }
  if (value === undefined || value === null) return undefined;
  try {
    const serialized = JSON.stringify(value);
    if (serialized && serialized !== "{}") return serialized;
  } catch {
    // Use String below when the provider returns a non-JSON error value.
  }
  const fallback = String(value).trim();
  return fallback || undefined;
}

function toUsage(value: unknown): AgentUsage | undefined {
  if (!isRecord(value)) return undefined;
  const inputTokens = numberValue(value.input_tokens);
  const cachedInputTokens = numberValue(value.cache_read_tokens);
  const outputTokens = numberValue(value.output_tokens);
  if (inputTokens === undefined && cachedInputTokens === undefined && outputTokens === undefined) {
    return undefined;
  }
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
}

function parseRawEvent(line: string): AntigravityRawEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  return parsed as AntigravityRawEvent;
}

function profilePolicyForMode(modeId: string): "sandbox" | "auto" | "eager" {
  if (modeId === ANTIGRAVITY_FULL_ACCESS_MODE_ID) return "eager";
  if (modeId === ANTIGRAVITY_ACCEPT_EDITS_MODE_ID) return "auto";
  return "sandbox";
}

function profileNameForInstructions(instructions: string): string {
  return `paseo-${createHash("sha256").update(instructions).digest("hex").slice(0, 20)}`;
}

function buildProfileContents(name: string, instructions: string, modeId: string): string {
  return [
    "---",
    `name: ${name}`,
    "description: Paseo native Antigravity session instructions",
    "tools:",
    "  - run_command",
    "  - view_file",
    "  - replace_file_content",
    "  - grep_search",
    `commandExecutionPolicy: ${profilePolicyForMode(modeId)}`,
    "---",
    "",
    instructions,
    "",
  ].join("\n");
}

async function materializeProfile(
  config: AgentSessionConfig,
  modeId: string,
  temporaryRoot: string | undefined,
): Promise<AntigravityProfile | null> {
  const instructions = composeSystemPromptParts(
    config.systemPrompt,
    config.daemonAppendSystemPrompt,
  );
  if (!instructions) return null;

  const parent = temporaryRoot ?? tmpdir();
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const addDir = await mkdtemp(join(parent, "paseo-antigravity-"));
  const name = profileNameForInstructions(instructions);
  const profilePath = join(addDir, ".agents", "agents", name, "agent.md");
  try {
    await mkdir(dirname(profilePath), { recursive: true, mode: 0o700 });
    await writeFile(profilePath, buildProfileContents(name, instructions, modeId), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    await rm(addDir, { recursive: true, force: true });
    throw error;
  }

  return {
    name,
    addDir,
    cleanup: async () => {
      await rm(addDir, { recursive: true, force: true });
    },
  };
}

function promptToText(prompt: AgentPromptInput): string {
  if (typeof prompt === "string") return prompt;
  const unsupported = prompt.filter((block) => block.type !== "text");
  if (unsupported.length > 0) {
    throw new Error("Native Antigravity currently accepts text prompts only");
  }
  return prompt.map((block) => (block.type === "text" ? block.text : "")).join("\n");
}

function parseModels(stdout: string, provider: AgentProvider): AgentModelDefinition[] {
  const models: AgentModelDefinition[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || !line.includes("\t")) continue;
    const [id, label] = line.split("\t", 2);
    const modelId = id?.trim();
    if (!modelId || seen.has(modelId)) continue;
    seen.add(modelId);
    models.push({
      provider,
      id: modelId,
      label: label?.trim() || modelId,
      isDefault: models.length === 0,
      thinkingOptions: ["low", "medium", "high"].map((effort) => ({ id: effort, label: effort })),
    });
  }
  return models;
}

function toolDetail(toolInfo: unknown): ToolCallDetail {
  if (!isRecord(toolInfo)) {
    return { type: "unknown", input: toolInfo ?? {}, output: null };
  }
  return {
    type: "unknown",
    input: toolInfo.parameters ?? toolInfo.input ?? toolInfo.args ?? toolInfo,
    output: toolInfo.output ?? toolInfo.result ?? toolInfo.error ?? null,
  };
}

function toolCallStatus(
  state: string | undefined,
): "running" | "completed" | "failed" | "canceled" {
  if (state === "ACTIVE" || state === "RUNNING") return "running";
  if (state === "ERROR" || state === "FAILED") return "failed";
  if (state === "CANCELED" || state === "CANCELLED") return "canceled";
  return "completed";
}

function buildToolTimelineItem(
  turn: ActiveTurn,
  update: AntigravityRawStepUpdate,
): ToolCallTimelineItem | null {
  const toolInfo = isRecord(update.tool_info) ? update.tool_info : undefined;
  const name = stringValue(update.tool_name) ?? stringValue(toolInfo?.name) ?? "antigravity_tool";
  const stepKey =
    typeof update.step_index === "number" || typeof update.step_index === "string"
      ? String(update.step_index)
      : `${name}-${turn.toolCounter++}`;
  const callId = turn.toolCallIds.get(stepKey) ?? `agy-${turn.turnId}-${stepKey}`;
  turn.toolCallIds.set(stepKey, callId);
  const detail = toolDetail(update.tool_info);
  const status = toolCallStatus(stringValue(update.state));
  const base = { type: "tool_call" as const, callId, name, detail };
  if (status === "failed") {
    return {
      ...base,
      status,
      error: stringifyError(toolInfo?.error) ?? "Antigravity tool failed",
    };
  }
  return { ...base, status, error: null };
}

function nativeResultError(result: ParsedResult): string {
  if (result.error) return `Antigravity result ${result.status}: ${result.error}`;
  return `Antigravity result status: ${result.status}`;
}

class AntigravityNativeAgentSession implements AgentSession {
  readonly capabilities = CAPABILITIES;
  readonly features = [];
  private readonly subscribers = new Set<(event: AgentStreamEvent) => void>();
  private activeTurn: ActiveTurn | null = null;
  private closed = false;
  private conversationId: string | null;
  private currentModeId: string;
  private currentModel: string | null;
  private currentThinkingOption: string | null;

  constructor(
    readonly provider: AgentProvider,
    private readonly launch: ResolvedProviderLaunch,
    private readonly config: AgentSessionConfig,
    private readonly env: NodeJS.ProcessEnv,
    private readonly profile: AntigravityProfile | null,
    private readonly logger: Logger,
    private readonly terminateProcess: ProcessTerminator,
    conversationId: string | null,
  ) {
    this.conversationId = conversationId;
    this.currentModeId = config.modeId ?? ANTIGRAVITY_FULL_ACCESS_MODE_ID;
    this.currentModel = config.model ?? null;
    this.currentThinkingOption = config.thinkingOptionId ?? null;
  }

  get id(): string | null {
    return this.conversationId;
  }

  async run(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<AgentRunResult> {
    return await runProviderTurn({
      prompt,
      runOptions: options,
      startTurn: (nextPrompt, nextOptions) => this.startTurn(nextPrompt, nextOptions),
      subscribe: (callback) => this.subscribe(callback),
      getSessionId: () => this.conversationId ?? "",
      reduceFinalText: ({ current, item }) =>
        item.type === "assistant_message" ? current + item.text : current,
    });
  }

  async startTurn(
    prompt: AgentPromptInput,
    options?: AgentRunOptions,
  ): Promise<{ turnId: string }> {
    if (this.closed) throw new Error("Antigravity session is closed");
    if (this.activeTurn) throw new Error("Antigravity session already has an active turn");

    const promptText = promptToText(prompt);
    const turnId = randomUUID();
    const args = this.buildTurnArgs(promptText, options);
    let child: ChildProcess;
    try {
      child = spawnProcess(this.launch.command, args, {
        env: this.env,
        envMode: "internal",
        cwd: this.config.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      this.emit({ type: "turn_started", provider: this.provider, turnId });
      this.emit({
        type: "turn_failed",
        provider: this.provider,
        error: stringifyError(error) ?? "Failed to spawn Antigravity",
        turnId,
      });
      return { turnId };
    }

    const lines = createInterface({ input: child.stdout! });
    let resolveClosed!: () => void;
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    const turn: ActiveTurn = {
      turnId,
      child,
      lines,
      closed,
      resolveClosed,
      stderr: "",
      spawnError: null,
      result: null,
      assistantText: "",
      lastUsageKey: null,
      canceled: false,
      conversationMismatch: null,
      toolCallIds: new Map(),
      runningTools: new Map(),
      toolCounter: 0,
    };
    this.activeTurn = turn;

    child.stdout?.on("error", (error) => {
      this.logger.debug({ err: error, turnId }, "Antigravity stdout stream failed");
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      if (turn.stderr.length >= MAX_STDERR_LENGTH) return;
      turn.stderr += chunk.toString().slice(0, MAX_STDERR_LENGTH - turn.stderr.length);
    });
    lines.on("line", (line) => this.handleStreamLine(turn, line));
    child.once("error", (error) => {
      turn.spawnError = error;
    });
    child.once("close", (code, signal) => this.handleClose(turn, code, signal));

    this.emit({ type: "turn_started", provider: this.provider, turnId });
    return { turnId };
  }

  private buildTurnArgs(prompt: string, options?: AgentRunOptions): string[] {
    const args = [...this.launch.args];
    // AGY otherwise makes the added profile directory the tool working directory.
    args.push("--add-dir", this.config.cwd);
    if (this.profile) {
      args.push("--add-dir", this.profile.addDir, "--agent", this.profile.name);
    }
    if (this.currentModel) args.push("--model", this.currentModel);
    if (this.currentThinkingOption) args.push("--effort", this.currentThinkingOption);
    if (this.conversationId) args.push("--conversation", this.conversationId);
    if (this.currentModeId === ANTIGRAVITY_FULL_ACCESS_MODE_ID) {
      args.push("--dangerously-skip-permissions");
    } else if (this.currentModeId !== ANTIGRAVITY_DEFAULT_MODE_ID) {
      args.push("--mode", this.currentModeId);
    }
    if (options?.outputSchema !== undefined) {
      args.push("--json-schema", JSON.stringify(options.outputSchema));
    }
    args.push(
      "--print",
      prompt,
      "--output-format",
      "stream-json",
      "--print-timeout",
      DEFAULT_PRINT_TIMEOUT,
    );
    return args;
  }

  private handleStreamLine(turn: ActiveTurn, line: string): void {
    const event = parseRawEvent(line);
    if (!event) {
      this.logger.warn({ line, turnId: turn.turnId }, "Dropped malformed Antigravity stream event");
      return;
    }

    const conversationId =
      stringValue(event.conversation_id) ??
      stringValue(event.init?.conversation_id) ??
      stringValue(event.step_update?.conversation_id) ??
      stringValue(event.result?.conversation_id);
    if (conversationId) this.observeConversation(turn, conversationId);

    if (event.event === "step_update" && event.step_update) {
      this.handleStepUpdate(turn, event.step_update);
    }
    if (event.event === "result" && event.result) {
      this.handleResult(turn, event.result);
    }
  }

  private observeConversation(turn: ActiveTurn, conversationId: string): void {
    if (this.conversationId && conversationId !== this.conversationId) {
      turn.conversationMismatch ??= `Antigravity resumed conversation '${conversationId}' instead of expected '${this.conversationId}'`;
      return;
    }
    if (this.conversationId === conversationId) return;
    this.conversationId = conversationId;
    this.emit({ type: "thread_started", provider: this.provider, sessionId: conversationId });
  }

  private handleStepUpdate(turn: ActiveTurn, update: AntigravityRawStepUpdate): void {
    const stepType = stringValue(update.step_type);
    if (stepType === "agent_response") {
      const text = stringValue(update.text_delta);
      if (text) {
        turn.assistantText += text;
        this.emit({
          type: "timeline",
          provider: this.provider,
          turnId: turn.turnId,
          item: { type: "assistant_message", text },
        });
      }
    } else if (stepType === "tool") {
      const tool = buildToolTimelineItem(turn, update);
      if (tool) {
        if (tool.status === "running") turn.runningTools.set(tool.callId, tool);
        else turn.runningTools.delete(tool.callId);
        this.emit({
          type: "timeline",
          provider: this.provider,
          turnId: turn.turnId,
          item: tool,
        });
      }
    }

    // Step usage is per step; only result usage is cumulative for the conversation.
  }

  private handleResult(turn: ActiveTurn, rawResult: AntigravityRawResult): void {
    const status = (stringValue(rawResult.status) ?? "UNKNOWN").toUpperCase();
    const response = stringValue(rawResult.response);
    const suffix = response?.startsWith(turn.assistantText)
      ? response.slice(turn.assistantText.length)
      : undefined;
    if (suffix) {
      turn.assistantText += suffix;
      this.emit({
        type: "timeline",
        provider: this.provider,
        turnId: turn.turnId,
        item: { type: "assistant_message", text: suffix },
      });
    }
    const usage = toUsage(rawResult.usage);
    if (usage) this.emitUsage(turn, usage);
    turn.result = {
      status,
      ...(response === undefined ? {} : { response }),
      ...(stringifyError(rawResult.error) ? { error: stringifyError(rawResult.error) } : {}),
      ...(usage ? { usage } : {}),
    };
  }

  private emitUsage(turn: ActiveTurn, usage: AgentUsage): void {
    const key = JSON.stringify(usage);
    if (turn.lastUsageKey === key) return;
    turn.lastUsageKey = key;
    this.emit({ type: "usage_updated", provider: this.provider, usage, turnId: turn.turnId });
  }

  private handleClose(turn: ActiveTurn, code: number | null, signal: NodeJS.Signals | null): void {
    turn.lines.close();
    if (this.activeTurn === turn) this.activeTurn = null;
    this.finishRunningTools(turn);
    if (turn.canceled) {
      this.emit({
        type: "turn_canceled",
        provider: this.provider,
        reason: "Interrupted by user",
        turnId: turn.turnId,
      });
    } else {
      if (turn.conversationMismatch) {
        this.emit({
          type: "turn_failed",
          provider: this.provider,
          error: turn.conversationMismatch,
          turnId: turn.turnId,
        });
      } else if (turn.spawnError) {
        this.emit({
          type: "turn_failed",
          provider: this.provider,
          error: turn.spawnError.message,
          ...(turn.stderr.trim() ? { diagnostic: turn.stderr.trim() } : {}),
          turnId: turn.turnId,
        });
      } else if (!turn.result) {
        const exit = signal ? `signal ${signal}` : `code ${code}`;
        this.emit({
          type: "turn_failed",
          provider: this.provider,
          error: turn.stderr.trim() || `Antigravity exited with ${exit} without a result event`,
          ...(turn.stderr.trim() ? { diagnostic: turn.stderr.trim() } : {}),
          turnId: turn.turnId,
        });
      } else if (code !== 0) {
        this.emit({
          type: "turn_failed",
          provider: this.provider,
          error: `Antigravity exited with ${signal ?? code}`,
          turnId: turn.turnId,
        });
      } else if (turn.result.status === "SUCCESS" && this.conversationId) {
        this.emit({
          type: "turn_completed",
          provider: this.provider,
          usage: turn.result.usage,
          turnId: turn.turnId,
        });
      } else if (turn.result.status === "SUCCESS") {
        this.emit({
          type: "turn_failed",
          provider: this.provider,
          error: "Antigravity result omitted conversation_id",
          turnId: turn.turnId,
        });
      } else {
        this.emit({
          type: "turn_failed",
          provider: this.provider,
          error: nativeResultError(turn.result),
          ...(turn.stderr.trim() ? { diagnostic: turn.stderr.trim() } : {}),
          turnId: turn.turnId,
        });
      }
    }
    turn.resolveClosed();
  }

  private finishRunningTools(turn: ActiveTurn): void {
    for (const tool of turn.runningTools.values()) {
      this.emit({
        type: "timeline",
        provider: this.provider,
        turnId: turn.turnId,
        item: turn.canceled
          ? { ...tool, status: "canceled", error: null }
          : { ...tool, status: "failed", error: "Antigravity exited before the tool completed" },
      });
    }
    turn.runningTools.clear();
  }

  subscribe(callback: (event: AgentStreamEvent) => void): () => void {
    this.subscribers.add(callback);
    if (this.conversationId) {
      callback({
        type: "thread_started",
        provider: this.provider,
        sessionId: this.conversationId,
      });
    }
    return () => this.subscribers.delete(callback);
  }

  private emit(event: AgentStreamEvent): void {
    for (const subscriber of this.subscribers) subscriber(event);
  }

  async *streamHistory(): AsyncGenerator<AgentStreamEvent> {
    // Native AGY has no documented machine-readable history replay endpoint.
  }

  async getRuntimeInfo(): Promise<AgentRuntimeInfo> {
    return {
      provider: this.provider,
      sessionId: this.conversationId,
      model: this.currentModel,
      modeId: this.currentModeId,
    };
  }

  async getAvailableModes(): Promise<AgentMode[]> {
    return ANTIGRAVITY_MODES.map((mode) => ({ ...mode }));
  }

  async getCurrentMode(): Promise<string | null> {
    return this.currentModeId;
  }

  async setMode(modeId: string): Promise<void> {
    if (!ANTIGRAVITY_MODES.some((mode) => mode.id === modeId)) {
      throw new Error(`Unsupported Antigravity mode: ${modeId}`);
    }
    if (this.profile) {
      const instructions =
        composeSystemPromptParts(this.config.systemPrompt, this.config.daemonAppendSystemPrompt) ??
        "";
      await writeFile(
        join(this.profile.addDir, ".agents", "agents", this.profile.name, "agent.md"),
        buildProfileContents(this.profile.name, instructions, modeId),
        { encoding: "utf8", mode: 0o600 },
      );
    }
    this.currentModeId = modeId;
  }

  getPendingPermissions(): AgentPermissionRequest[] {
    return [];
  }

  async respondToPermission(_requestId: string, _response: AgentPermissionResponse): Promise<void> {
    throw new Error("Native Antigravity owns permission handling; Paseo cannot respond to it");
  }

  describePersistence(): AgentPersistenceHandle | null {
    if (!this.conversationId) return null;
    return {
      provider: this.provider,
      sessionId: this.conversationId,
      nativeHandle: this.conversationId,
      metadata: {
        ...this.config,
        modeId: this.currentModeId,
        model: this.currentModel ?? undefined,
        thinkingOptionId: this.currentThinkingOption ?? undefined,
      },
    };
  }

  async interrupt(): Promise<void> {
    const turn = this.activeTurn;
    if (!turn) return;
    turn.canceled = true;
    const termination = await this.terminateProcess(turn.child, {
      gracefulSignal: "SIGINT",
      forceSignal: "SIGKILL",
      gracefulTimeoutMs: 2_000,
      forceTimeoutMs: 1_000,
    });
    if (termination === "kill-timeout") {
      throw new Error("Antigravity process did not terminate after cancellation");
    }
    await turn.closed;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.interrupt();
    } finally {
      await this.profile?.cleanup();
      this.subscribers.clear();
    }
  }

  async setModel(modelId: string | null): Promise<void> {
    this.currentModel = modelId?.trim() || null;
  }

  async setThinkingOption(thinkingOptionId: string | null): Promise<void> {
    if (thinkingOptionId && !["low", "medium", "high"].includes(thinkingOptionId)) {
      throw new Error(`Unsupported Antigravity effort: ${thinkingOptionId}`);
    }
    this.currentThinkingOption = thinkingOptionId;
  }
}

export interface AntigravityNativeAgentClientOptions {
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
  providerId?: string;
  label?: string;
  temporaryRoot?: string;
  terminateProcess?: ProcessTerminator;
}

export class AntigravityNativeAgentClient implements AgentClient {
  readonly capabilities = CAPABILITIES;
  readonly provider: AgentProvider;
  private readonly label: string;
  private readonly runtimeSettings?: ProviderRuntimeSettings;
  private readonly temporaryRoot?: string;
  private readonly terminateProcess: ProcessTerminator;

  constructor(private readonly options: AntigravityNativeAgentClientOptions) {
    this.provider = options.providerId ?? ANTIGRAVITY_PROVIDER_ID;
    this.label = options.label ?? "Antigravity";
    this.runtimeSettings = options.runtimeSettings;
    this.temporaryRoot = options.temporaryRoot;
    this.terminateProcess = options.terminateProcess ?? terminateWithTreeKill;
  }

  private async resolveLaunch(): Promise<ResolvedProviderLaunch> {
    return await resolveProviderLaunch({
      commandConfig: this.runtimeSettings?.command,
      defaultBinary: DEFAULT_COMMAND,
    });
  }

  private assertConfig(config: AgentSessionConfig): void {
    if (config.provider !== this.provider) {
      throw new Error(`Cannot create ${config.provider} session with ${this.provider} provider`);
    }
    const modeId = config.modeId ?? ANTIGRAVITY_FULL_ACCESS_MODE_ID;
    if (!ANTIGRAVITY_MODES.some((mode) => mode.id === modeId)) {
      throw new Error(`Unsupported Antigravity mode: ${modeId}`);
    }
    if (config.thinkingOptionId && !["low", "medium", "high"].includes(config.thinkingOptionId)) {
      throw new Error(`Unsupported Antigravity effort: ${config.thinkingOptionId}`);
    }
  }

  async createSession(
    config: AgentSessionConfig,
    launchContext?: AgentLaunchContext,
    _options?: AgentCreateSessionOptions,
  ): Promise<AgentSession> {
    this.assertConfig(config);
    const launch = await this.resolveLaunch();
    const modeId = config.modeId ?? ANTIGRAVITY_FULL_ACCESS_MODE_ID;
    const profile = await materializeProfile(config, modeId, this.temporaryRoot);
    return new AntigravityNativeAgentSession(
      this.provider,
      launch,
      { ...config, provider: this.provider, modeId },
      createProviderEnv({ runtimeSettings: this.runtimeSettings, overlays: [launchContext?.env] }),
      profile,
      this.options.logger,
      this.terminateProcess,
      null,
    );
  }

  async resumeSession(
    handle: AgentPersistenceHandle,
    overrides?: Partial<AgentSessionConfig>,
    launchContext?: AgentLaunchContext,
    _options?: AgentResumeSessionOptions,
  ): Promise<AgentSession> {
    if (handle.provider !== this.provider) {
      throw new Error(`Cannot resume ${handle.provider} handle with ${this.provider} provider`);
    }
    const metadata = isRecord(handle.metadata) ? handle.metadata : {};
    const nestedConfig = isRecord(metadata.config) ? metadata.config : undefined;
    const storedConfig = (nestedConfig ?? metadata) as Partial<AgentSessionConfig>;
    const cwd = overrides?.cwd ?? storedConfig.cwd;
    if (!cwd) throw new Error("Antigravity resume requires the original working directory");
    const conversationId = handle.nativeHandle ?? handle.sessionId;
    if (!conversationId.trim()) throw new Error("Antigravity resume requires a conversation ID");
    const config: AgentSessionConfig = {
      ...storedConfig,
      ...overrides,
      provider: this.provider,
      cwd,
    };
    this.assertConfig(config);
    const launch = await this.resolveLaunch();
    const modeId = config.modeId ?? ANTIGRAVITY_FULL_ACCESS_MODE_ID;
    const profile = await materializeProfile(config, modeId, this.temporaryRoot);
    return new AntigravityNativeAgentSession(
      this.provider,
      launch,
      { ...config, modeId },
      createProviderEnv({ runtimeSettings: this.runtimeSettings, overlays: [launchContext?.env] }),
      profile,
      this.options.logger,
      this.terminateProcess,
      conversationId,
    );
  }

  async fetchCatalog(
    options: FetchCatalogOptions,
    context?: ProviderRefreshContext,
  ): Promise<ProviderCatalog> {
    const launch = await this.resolveLaunch();
    const cwd = options.scope === "workspace" ? options.cwd : undefined;
    const result = await runProviderRefreshActivity(context, "models", () =>
      raceProviderRefreshAbort(
        context?.signal,
        execCommand(launch.command, [...launch.args, "models"], {
          cwd,
          env: createProviderEnv({ runtimeSettings: this.runtimeSettings }),
          envMode: "internal",
          timeout: 30_000,
          maxBuffer: 256 * 1024,
          signal: context?.signal,
        }),
      ),
    );
    return {
      models: parseModels(result.stdout, this.provider),
      modes: ANTIGRAVITY_MODES.map((mode) => ({ ...mode })),
      defaultModeId: ANTIGRAVITY_FULL_ACCESS_MODE_ID,
    };
  }

  async resolveDefaultModeId(): Promise<string> {
    return ANTIGRAVITY_FULL_ACCESS_MODE_ID;
  }

  resolveCreateConfig(input: ResolveAgentCreateConfigInput): ResolveAgentCreateConfigResult {
    return resolveDefaultAgentCreateConfig({
      ...input,
      availableModes: input.availableModes ?? ANTIGRAVITY_MODES,
    });
  }

  isCreateConfigUnattended(input: AgentCreateConfigUnattendedInput): boolean {
    const modeId = input.modeId;
    return modeId === ANTIGRAVITY_FULL_ACCESS_MODE_ID;
  }

  async isAvailable(signal?: AbortSignal, _options?: FetchCatalogOptions): Promise<boolean> {
    try {
      const launch = await this.resolveLaunch();
      const availability = await checkProviderLaunchAvailable(launch, { command: DEFAULT_COMMAND });
      if (signal?.aborted) return false;
      return availability.available;
    } catch {
      return false;
    }
  }

  async getDiagnostic(): Promise<{ diagnostic: string }> {
    try {
      const launch = await this.resolveLaunch();
      const availability = await checkProviderLaunchAvailable(launch, { command: DEFAULT_COMMAND });
      return {
        diagnostic: formatProviderDiagnostic(this.label, [
          ...(await buildCommandResolutionDiagnosticRows(launch, {
            knownBinaryNames: [DEFAULT_COMMAND],
          })),
          ...(await buildBinaryDiagnosticRows(launch, availability)),
        ]),
      };
    } catch (error) {
      return { diagnostic: formatProviderDiagnosticError(this.label, error) };
    }
  }
}
