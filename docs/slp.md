# Paseo SLP

This fork starts from upstream `v0.8.0`, commit
`b8e24677e12b226c7c38c1c3a40649daa9f1152f`. Its additions are an SLP role/profile plugin and
native Antigravity support. Keep the upstream session, workspace, event, CLI,
and app machinery as the foundation.

This repository is the sole active owner of the SLP fork. `paseo-foundation` and
`paseo-product` are retired development lines: do not start new implementation,
doctrine projection, skill packaging, or activation work there. Preserve their Git
history and any uncommitted local work until it is deliberately reconciled; route all
new Paseo SLP work to this checkout.

## Run from this checkout

Install and authenticate the agent CLIs using their own tools. Build this checkout:

```sh
npm ci
npm run build:server
npm run build:daemon-web-ui
node packages/cli/dist/index.js daemon start --home "$PWD/.dev/slp-home" --listen 127.0.0.1:6781 --web-ui --no-relay
```

Enable plugins for this isolated host in Settings → Plugins, then install the SLP
plugin from this checkout:

```sh
npm run typecheck --prefix slp/plugin
node packages/cli/dist/index.js plugin install "$PWD/slp/plugin" --host 127.0.0.1:6781
```

The plugin requires this fork's v0.8.1 client and daemon, including read-only creation
labels and plugin-bound creation. Unmodified upstream v0.8.0 does not expose creation labels
to that hook. Build the fork before installing this plugin. Plugin source changes need `plugin reload slp`,
not a daemon restart.

### Dedicated provider homes

Use the installed Codex and Claude binaries with separate `CODEX_HOME` and
`CLAUDE_CONFIG_DIR`. Preview the setup before applying it:

```sh
node slp/setup-provider-homes.mjs
node slp/setup-provider-homes.mjs --apply
```

Setup preserves existing configuration and credentials, links the selected Paseo skill bundle,
and blocks a new home binding when stored native sessions would lose their resume history.
The existing `.dev/slp-home` Claude history currently blocks that default setup. Resolve the
resume-home choice before changing it; use a fresh fixture home for isolated verification.
Authenticate each intended provider home with the provider's own CLI. Setup never copies
personal credentials, config, or hooks. Authentication environment supplied to a test process
is temporary and is not delivered home configuration.

Fresh Codex configuration disables native delegation; existing TOML is left unchanged.
SLP session policy pins Codex's native-agent switches off and pins Claude teams off while
denying native delegation tools, including after resume. Watcher also disables Codex native
goals. The homes separate provider configuration and state, not OS or repository access.

## Roles and execution profiles

Turn on **Settings → host → Agents → Enable Paseo tools** for Lead/Supervisor/Watcher
delegation. Upstream defaults tool injection off. Start a new session after enabling
it, or refresh an existing one. The plugin uses those native tools on this host.

1. Configure named profiles in **Settings → host → Agents → Agent profiles**.
   Each holds provider, model, thinking budget, features and task-fit notes.
2. Open **Settings → Plugins → slp → SLP profile roles** and assign each saved profile
   using the Supervisor, Watcher, Lead and Peer tabs. Peer has Engineer, Scout, Architect and
   Reviewer subtabs, each with its own profile toggles. Search filters the list; it
   does not change membership. Model settings remain in the native profile editor.
3. In **New workspace → Chat** or an ordinary workspace draft, choose **SLP role**, then a Peer specialization when
   applicable. Choose an enabled profile in the native Agent Profile picker and enter the
   bounded assignment. Provider, model, thinking, and feature controls remain native task
   overrides. Changing role or provider requires another explicit profile selection.

The same role can use several execution profiles: a cheap scout, a careful reviewer,
or a different provider for UI work. Role membership is stored as `[slp:peer]`,
`[slp:lead]`, `[slp:supervisor]` and `[slp:watcher]` tags on a dedicated first line of upstream
profile notes. Peer specializations use `[slp:peer:engineer]`, `[slp:peer:scout]`,
`[slp:peer:architect]` and `[slp:peer:reviewer]`. A legacy `[slp:peer]` profile is
available to all four; editing a specialization expands that membership into
explicit tags. Removing the last specialization removes Peer membership.
Other role memberships and the profile's prose notes are preserved. There is one
profile catalog, one editor for model settings and one ordinary agent lifecycle.

Lead reads the native `list_profiles` catalog and task-fit notes, chooses a Peer
specialization and matching profile, then calls native `create_agent` with
`slp.role`, `slp.profile` and `slp.subrole` labels and `pluginDependencies: ["slp"]`.
The native draft composer carries the same selection through the ordinary agent lifecycle.
The plugin validates specialization membership and appends its instruction
to the persisted system prompt. Older callers without `slp.subrole` retain generic
Peer behavior.
An SLP Watcher is an ordinary child session of one selected Supervisor with an exact
workspace scope. The server requires exact reporting-owner, workspace-scope and cadence labels
and rejects a duplicate qualified creation. The native draft leaves Watcher selection blocked
until a creation path supplies its complete assignment bounds; no custom launcher collects them.
Once qualified, the Watcher calls the Paseo MCP `create_heartbeat` tool for one idempotently named
native heartbeat; provider-native schedulers and general schedule tools are not part of this flow.
Every sweep discovers
current Leads and Peers in the scope, so later Leads are covered without another launch.
The Watcher pages their persisted canonical evidence without loading their providers and
returns one validated JSON result. Quiet complete sweeps do not notify. Actionable,
partial, or failed results go only to the assigned Supervisor, who verifies the original
references. Scheduled sweeps, lifecycle doorbells and the one bounded format repair use
explicit machine-route markers. A direct Human request such as a period summary stays visible
in the Watcher session and is not reinterpreted as a proactive Supervisor alert. When valid
coverage is absent, the existing direct Supervisor doorbell remains.
A Supervisor creation request can explicitly opt into a delegated Lead-recovery capability;
the task prompt remains the exact lease and must name the incumbent Lead, workspace,
allowed profile bounds, expiry and stop condition.
Provider/model, the verified role-specific `settings.modeId`, and
`settings.thinkingOptionId` remain explicit launch selections;
verified task-specific overrides do not mutate the saved profile. No automatic
model classifier or cost router makes the judgment for the agent.

The plugin validates role membership, injects the canonical role instruction and the
exact global/local protocol paths into `systemPrompt` before the first turn, and chooses
the provider boundary before the runtime starts. Lead, Peer and Supervisor read
`$PASEO_HOME/workspace_protocol.md` first and the exact registered project's root
`WORKSPACE_PROTOCOL.md` second. Watcher receives neither protocol path. Lead, Peer and
Supervisor use the verified unattended/full-access mode.
Watcher fails closed unless SLP knows a provider-enforced no-write configuration:
Codex `read-only`, Antigravity `plan`, or Claude `bypassPermissions` with its SDK
built-in tool set disabled so only the daemon-injected, caller-scoped Paseo MCP tools
remain. Codex and Claude receive exact preapproval for only the enabled Watcher catalog.
Antigravity additionally verifies that its native permission settings contain exact allow
rules for every injected Paseo MCP tool and no matching ask/deny rule; launch fails before
the provider starts when that qualification is absent. Caller-supplied MCP servers are
removed from Watcher launches. This is runtime enforcement, not a claim that instructions
or tool names form an OS sandbox.
Role instructions live in `slp/plugin/server/role-instructions.ts`; the bootstrap template
lives in `slp/plugin/server/workspace_protocol.md`; routing guidance lives beside them in
`configure-role.ts`. The live global file is user-owned after missing-only bootstrap and
is never overwritten by plugin reload. Existing sessions retain their creation prompt on
resume, including restoration without a native conversation handle. A path or role change
therefore applies to fresh sessions instead of silently rewriting an active assignment.
Changing a profile affects future launches. It never rewrites a running agent's role or
budget.

## Skill bundle

The fork adds six workflows to Paseo's existing `skills/` bundle. Four are priority
workflows whose declared triggers are checked before ordinary work:

- `architecture-premise-audit`
- `test-proof-debt-audit`
- `frontend-design`
- `repo-refresh`

Two are review methods:

- `open-code-review-delegate` lets the current Reviewer use OCR for deterministic file
  selection and rule resolution while the Reviewer model performs semantic analysis.
- `triple-review` is explicit-only. Lead may invoke it only when the Human or the
  repository protocol requests three sealed lanes for one stable candidate: two
  heterogeneous semantic Reviewers and one OCR Delegate coverage Reviewer.

Paseo's existing skill reconciliation installs the same bundle into `.agents/skills`,
`.claude/skills`, and `.codex/skills`. The shared `.agents` location supplies providers
that follow the cross-agent convention; native Claude and Codex locations are also
populated. The default `all` selection adopts these skills automatically, while an
existing custom selection remains an explicit Human choice.

Every fresh SLP role prompt tells the agent to check the four priority workflows before
ordinary work. Review-method routing stays role-specific: Lead receives the explicit-only
`triple-review` method, while Reviewer receives `open-code-review-delegate` for assignments
that call for deterministic coverage. Other roles do not receive either routing method.
The two audits still require their named audit scope, and `repo-refresh` remains
explicit-only. These methods remain below the Human assignment, role contract, Workspace
Protocol, ownership, and stop conditions; they grant no authority.

Council and Ultra Review remain absent from the bundle and default SLP policy. Triple
Review does not vote. Lead adjudicates the three handbacks and may request a separately
authorized Council only for a consequential conflict that remains unresolved.

The former role-specific provider aliases and config generator have been removed.
For an existing development home, remove the generated `codex-{role}` and
`antigravity-{role}` aliases after those sessions are no longer needed; stored
sessions keep their old provider identity. New launches use ordinary providers.

## Design boundary

Profiles carry durable behavior. The global Workspace Protocol carries cross-project
rules; `WORKSPACE_PROTOCOL.md` carries repository tactics for Lead, Peer, and Supervisor.
An assignment carries today's objective, ownership, authority, and evidence. Role names
do not belong in daemon admission logic.

An assignment is the ordinary initial prompt for one delegated outcome. Give the
Peer the outcome, owned scope, material exclusions, relevant repository constraints,
verification target, escalation conditions, and expected handback. Use only the
fields the task needs. Paseo already retains the prompt, parentage, workspace,
labels, timeline, and result.

Do not add an assignment service, schema version, digest, receipt, admission gate,
tracker record, or parallel lifecycle. Add machine-readable assignment state only
after a reproduced failure cannot be fixed by the prompt, existing labels, workspace
isolation, tool filtering, or the normal parent/child lifecycle.

Human owns purpose and external decisions. Lead owns project coordination and
acceptance. Peer owns a bounded outcome and independent judgment. Watcher gathers a
bounded attention sample and reports it without directing work or deciding whether to
intervene. Supervisor judges the report, observes reasoning and workflow, asks
evidence-backed questions, and relays Human decisions. It does not become a second
project owner.

Lead, Peer and Supervisor start with the selected full runtime access. Watcher starts
with the qualified provider no-write configuration above and cannot request a mode
switch or permission escalation. Full access for other roles does not widen the
assigned scope or grant acceptance authority.
Roles are behavioral instructions and launch configuration, not a security boundary.
Fresh SLP sessions receive the per-agent Paseo tool ceiling described below. Existing
sessions created without a ceiling retain their previous tool surface.

### Draft composer binding

The SLP draft composer contributes role intent and eligible native profile IDs to the ordinary
workspace composer. It reuses the native provider/model/profile controls: selecting a role filters
that picker, and changing role or provider clears the profile so the user must choose it again.
Model, thinking, and feature edits remain the live draft values and do not get overwritten by the
saved profile. Role intent and filters stay in the existing draft submission store across tab
remounts; a plugin render or teardown error keeps the draft blocked instead of falling through to
ordinary creation.

Every SLP-bound create path carries the same optional generic field:

```ts
pluginDependencies?: readonly string[]
```

SLP sends `pluginDependencies: ["slp"]` together with its labels. The field is accepted by the
workspace composer, SDK, CLI (`--require-plugin slp`), native `create_agent` tool, and `agent.create` hook request. The daemon
checks the declared plugin IDs before creation and fails closed when one is unavailable; hooks cannot
change the list. Clients gate non-empty lists on `server_info.features.pluginDependencies`, so an
older daemon cannot silently create an unbound role session. Omitting the field keeps ordinary
creation unchanged. This is plugin availability binding, not a role admission rule or a session
lease.

See the [approved implementation plan](slp-composer-plan.md) for the bounded handoff and
verification requirements.

## Implemented bicycle scope

Human accepted this scope on 2026-09-10. The per-agent ceiling and SLP role
configuration are implemented in this checkout.

Keep eight pieces: role/profile selection, durable role instructions, Peer
specializations, per-agent Paseo tool ceilings, a small Watcher-to-Supervisor attention route,
upstream parentage/workspaces/finish notifications, a global contract plus thin local
Workspace Protocols, and assignments in ordinary prompts.
Native Antigravity remains within the fork's existing provider scope.

The generic ceiling reuses the existing catalog, session persistence, plugin creation
hook, and provider adapters. Role names and tool-name lists stay inside the plugin.

### Generic per-agent ceiling

`AgentSessionConfig.paseoToolAllowlist` is an optional allowlist available to the
`agent.create` plugin hook and persisted in the existing session record.
An absent allowlist preserves ordinary upstream behavior; an empty list exposes no
Paseo tools. Intersect the list with host/provider restrictions so a plugin cannot
reenable a disabled tool. New tool names stay excluded unless explicitly listed.

Apply the same ceiling to native tool delivery and the agent-scoped MCP route,
including tool dispatch. Preserve it through resume, refresh, and restoration
without a provider conversation handle. The existing `speak` exception must not
bypass an explicit empty ceiling. Unrelated provider tools keep their current behavior.

The owning seams are `packages/protocol/src/agent-types.ts`, the existing
`paseo-tool-policy.ts`, agent launch/persistence, and catalog/MCP delivery. Keep wire
fields optional under the repository compatibility contract. Update the public
plugin reference with the field and its semantics; add no settings UI or service.

### SLP role tool table

The table lives beside `configure-role.ts`. All Peer specializations share the same
empty allowlist.

| Role                       | Paseo tools                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead                       | `list_profiles`, `list_providers`, `list_models`, `inspect_provider`, `create_agent`, `send_agent_prompt`, `get_agent_status`, `list_agents`, `get_agent_activity`, `list_pending_permissions`, `cancel_agent`, `update_agent`, `set_agent_mode`, `create_workspace`, `list_workspaces`, `rename_workspace`, `list_workspace_scripts`, `start_workspace_script`, `stop_workspace_script`, `list_terminals`, `create_terminal`, `capture_terminal`, `send_terminal_keys` |
| Watcher                    | `list_agents`, `get_agent_status`, `get_agent_activity`, `create_heartbeat`, `delete_heartbeat`                                                                                                                                                                                                                                                                                                                                                                         |
| Supervisor                 | `get_agent_status`, `list_agents`, `get_agent_activity`, `list_pending_permissions`, `send_agent_prompt`; a launch with delegated Lead recovery additionally receives profile/provider discovery, `create_agent`, `cancel_agent`, and `update_agent`                                                                                                                                                                                                                    |
| Peer (all specializations) | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Forced process killing, permission replies, and general schedule creation are outside
the defaults. Watcher can only manage its own heartbeat. An ordinary Supervisor cannot create or replace agents. The
Human may opt one launch into Lead recovery; the assignment limits it to one exact
replacement and a missing or ambiguous lease blocks action. Targeting only Lead remains
an instruction. This tool-name ceiling does not implement target authorization or a
filesystem sandbox, and full runtime access remains the selected execution default.

### Watcher attention route

The plugin listens to existing lifecycle events. A completed Lead turn, a failed or
canceled Lead/Peer turn, or a Lead/Peer permission request rings the doorbell for each
Watcher assigned to the source workspace. Completed Peer turns continue through the
ordinary Lead handback path. The signal is a doorbell, not a finding. The Watcher also
runs its incremental sweep from the same native heartbeat session and dynamically lists
covered agents. It returns one strict JSON result: `quiet`, `attention`, `partial`, or
`failed`. The plugin permits one bounded format repair, validates cited agent identities,
and forwards every non-quiet result only to the assigned Supervisor. Malformed output,
unknown references, empty attention evidence, and partial/failed reads cannot become
healthy. A missing, errored, orphaned, or invalidly scoped Watcher preserves the direct
Supervisor doorbell as a fallback.

The Watcher reports evidence and a suspected mechanism but never decides or sends a
correction. Supervisor independently decides whether attention drift, looping, or
another material risk exists. The plugin keeps only in-memory pending signal/report
lists while a Watcher or Supervisor is working, capped at eight items, and drains them
after that turn. The durable evidence and compact Watcher notes live in native agent
history; there is no finding registry, watcher ledger, retry service, classifier service,
or second lifecycle. Native schedule retries are bounded by the existing schedule service.
Archiving the owner Supervisor archives its Watchers even when an open tab would otherwise
detach a child; native target cleanup completes the heartbeat. Explicit reassignment is
stop-and-relaunch with the new owner/scope.

### Project memory bootstrap

SLP has one global contract in Paseo home and project memory at the authoritative root of
each project registered in Paseo:

- `$PASEO_HOME/workspace_protocol.md` holds cross-project authority, ownership, continuity,
  evidence, closure, runtime, and evolution rules read by every Lead, Peer, and Supervisor.
  `slp/plugin/server/workspace_protocol.md` is its missing-only bootstrap template.
- `WORKSPACE_PROTOCOL.md` stays below 40 lines and holds only repository-specific scope,
  risks, design, hotspots, routing, evidence, tests, tracking, anti-patterns, and evolution.
- `SUPERVISOR_NOTEBOOK.md` holds causal observations across that project's workspaces.

On plugin activation, bootstrap the global file, subscribe to native project updates before
listing registered projects, then bootstrap every registered root. A newly registered project
triggers the same local bootstrap even when it has no workspace or agent. Writes are missing-only
and create-only; existing bytes are preserved. A symlink, directory or other blocked target, an
unavailable root, or an unwritable root is reported as a bootstrap failure. No arbitrary cwd or
worktree becomes a project root.

Before an SLP session starts, the creation hook resolves its cwd to a registered project root
(directly or through a registered workspace) and ensures both files exist. An unregistered cwd
fails closed. There is no launch-only project-memory RPC or custom launcher surface.

Lead, Peer, and Supervisor receive the exact global path first and resolved local protocol
path second in their creation instruction. Lead reads both before orchestration, Peer before
project work, and Supervisor before judging a project deviation, relaying a project instruction,
or proposing a protocol change. Watcher receives neither path. A missing local protocol does
not become an admission gate: the role reports the exact gap and continues only work independent
of the missing policy. A missing or blocked notebook makes Supervisor return a complete
`PROPOSED_NOTEBOOK_RECORD` to the Human instead of creating or replacing the file.

When the notebook is ready, every Supervisor bound to that project automatically has
notebook-write authority within the assignment's project scope. It records only novel/material
episodes or materially stronger evidence, aggregates recurrence under the existing pattern, and
preserves disproof. If another Supervisor is concurrently writing, surface that concern in the
handback; do not invent a lock or lease. The notebook does not grant product ownership, Lead
authority, or acceptance.

Structural anti-patterns are a progressive reasoning lens inside the Supervisor launch
instruction and the broad architecture-audit workflow. The full
[catalog](../skills/architecture-premise-audit/references/structural-anti-patterns.md)
is loaded only when that audit identifies a serious structural candidate. Ordinary
coordination guards come first. Repeated workaround,
foundation-versus-local ambiguity, architecture fog, mechanism-free claims, or an
avoidable operational/performance/cognitive tax activate the structural lens. A match
remains a hypothesis; `BORING_STANDARD` and `JUSTIFIED_DEVIATION` are valid outcomes.
The catalog is not copied into every Workspace Protocol and is not a checklist.

The names above are the exact current catalog entries. Review the table when that
catalog changes so newly added tools remain excluded until selected deliberately.
Do not create a signal service, temporary grant system, or tool-policy editor.
Plugin tests cover UI and delegated creation, four-role projection, and unchanged
model/profile selection.

### Verification contract

Review one stable candidate independently through Paseo before activation. Run
focused tests, workspace/plugin typechecks, lint, and required builds serially.
Reuse the isolated development host and preserve its settings. Before any restart,
obtain a fresh idle readback for its agents and workspace scripts.

Verify with real sessions: Lead creates a Peer and receives its finish handback;
Peer has no Paseo tools; an ordinary Supervisor can inspect and send a question but
lacks lifecycle mutations; each qualified Codex, Claude and Antigravity Watcher receives the
same bounded native Paseo catalog and a cited report reaches only the assigned same-workspace Supervisor; a
recovery-enabled Supervisor receives only the additional
bounded tool set; the ceilings survive restoration; and ordinary non-SLP use still
works. Verify the installed build identity, health endpoint, and WebUI root.
Keep source/test results separate from live results. Existing sessions without a
ceiling retain their old configuration; use fresh SLP sessions to adopt this change.

### Stop boundary

Council and Ultra Review remain deferred. Room, semantic classifiers,
additional skill routing, tracker integration, assignment state, generalized no-write machinery,
and protocol admission are outside this implementation. Project memory stays in the two
registered project-root Markdown files above; there is no notebook database, grant service, or second
lifecycle.
Reconsider an item only for a concrete operating failure and a separate scope
decision. This plan creates no new tracker.

## Native Antigravity

The provider runs the installed `agy` CLI directly, using its
[headless stream](https://www.antigravity.google/docs/cli/headless/) and exact
conversation IDs. It discovers models with `agy models`. Provider command and
environment overrides use the ordinary upstream configuration.

Instruction profiles use native agent files in a private temporary directory.
The workspace is passed explicitly so shell tools run in the project rather than
the profile directory. Ordinary profiles expose shell execution, file reading,
searching and editing. A Watcher's `plan` profile omits command and replacement
tools while retaining read/search and its explicit MCP tools. Full access maps to `--dangerously-skip-permissions` and
the native eager command policy. Stop waits for the process to exit and settles
unfinished tool entries before accepting another turn. The private profile disables
inherited customizations, so retired or unrelated machine-global MCP servers are not
projected into the session. Explicit external MCP definitions still map into that
profile: stdio servers keep command/args/env, while HTTP and SSE servers use
Antigravity's `serverUrl` plus headers.

Daemon-owned Paseo tools use the ordinary caller-scoped MCP server injected by Paseo.
Antigravity projects that explicit HTTP MCP definition into its private profile; there is
no `agy-acp`, custom command gateway, or second lifecycle plane. The profile does not
inherit machine-global MCP configuration, including retired Foundation integrations.

Antigravity headless mode otherwise asks before an MCP call, so a Watcher is qualified only
when `~/.gemini/antigravity-cli/settings.json` contains these exact native allow entries and
no matching `permissions.ask` or `permissions.deny` rule:

```json
{
  "permissions": {
    "allow": [
      "mcp(paseo/list_agents)",
      "mcp(paseo/get_agent_status)",
      "mcp(paseo/get_agent_activity)",
      "mcp(paseo/create_heartbeat)",
      "mcp(paseo/delete_heartbeat)"
    ]
  }
}
```

Merge those names with existing settings; do not replace unrelated entries. The adapter reads
and validates the provider-owned file before create or resume. It rejects broad
`mcp(*)`/`mcp(paseo/*)` allow rules as proof of an exact grant, and reports the exact missing
or shadowed rules instead of falling back to interactive prompts or full access. This global
Antigravity setting is not written by SLP.

This adapter accepts text and MCP/Paseo tool injection. It does not expose image input,
native transcript import, or interactive permission replies. Existing
Paseo timelines remain available; stored native conversations resume normally.
SLP policy keeps Antigravity out of Lead and Supervisor. Use it for bounded Peer
work or the Watcher role; use another configured provider for Lead/Supervisor.
These capabilities and limitations are reported by the provider.

## Local verification

The native adapters were verified on 2026-09-10 with Codex CLI 0.154.0 and
Antigravity CLI 1.1.28: real conversations, instructions across restart, native shell
cwd, command cancellation and later turns. The plugin has focused tests for role
selection, injection, task-specific settings, profile mismatch and full-access mode.
Creation hook tests cover read-only labels and restored configuration. The final
checks passed 328 focused core tests, 18 plugin tests, workspace and plugin
typechecks, lint, and a server build. The existing WebUI loads the plugin without
changes to its bundle.

Live checks on the isolated host `127.0.0.1:6781` verified:

- Lead selected an Antigravity Peer with `low` thinking and received its handback.
- Supervisor selected a Codex Lead with `low` thinking and received its handback.
- The native draft composer injected Peer instructions and full access; a per-task `low` override
  left the saved profile's `max` budget unchanged.
- Role membership survived UI reload, and a mismatched role/profile was rejected.
- The native SLP composer remained readable on desktop and a 390px compact viewport.

The implemented ceiling was verified on the same isolated host on 2026-09-11.
Fresh idle readbacks showed no running or starting agents and no active workspace
scripts before each restart. The installed candidate then passed health and WebUI
root checks. Fresh SLP sessions verified the exact Lead and Supervisor catalogs
above, an empty Peer catalog, delegated Lead-to-Peer creation and finish handback,
and preservation of the original three ceilings after daemon restoration. A fresh non-SLP
session with no allowlist discovered and called the ordinary `list_agents` tool;
its provider shell tool remained available. No build was installed into the shared
daemon at `127.0.0.1:6767`.

The attention-trigger and recovery source slice was checked on 2026-09-11 with
25 focused plugin tests, the plugin typecheck, plugin lint, the full workspace
typecheck, formatting and diff checks. It has not yet been activated on the isolated
host; the live evidence above covers the preceding role/tool-ceiling candidate.

The initial Watcher doorbell experiment was replaced on 2026-09-13 by the scoped,
heartbeat-driven reader above. Focused source checks cover passive persisted paging,
stable identity, gaps and failures; strict result validation and repair; scope, duplicate
launch, busy drain, fallback and owner archival; quiet heartbeat notification behavior;
and native Antigravity MCP projection and permission qualification. The isolated host
demonstrated a Codex Watcher launch, heartbeat, incremental cited alert, evidence-backed
resolution/reopening, quiet unchanged repeat, non-interrupting Human period summary and
archive-driven heartbeat completion. A Claude Watcher used the same native tools; its
initial real-model Markdown/prose drift was rejected rather than treated as healthy, while its
subsequent marked heartbeat sweep returned valid raw JSON and completed quietly without another
Supervisor message. Antigravity model discovery succeeded; its Watcher launch first failed closed
with the five exact missing rules.
After those exact rules were explicitly added to this machine's provider settings, a real
`gemini-3.8-flash-low` Watcher in `plan` mode created a quiet one-run heartbeat, called the
native Paseo MCP catalog with no permission prompt, emitted a complete quiet result, repeated
quietly on the scheduled run, and archived with the heartbeat completed. The scheduled prompt
was persisted with its native run ID, and validation recognized Antigravity's
`call_mcp_tool` wrapper as the exact underlying Paseo tool. The assigned Supervisor remained
unchanged for that validated quiet turn. No shared-daemon activation was performed.

This machine's existing Codex model catalog is incompatible with its CLI. The
local `.dev/slp-home/config.json` therefore points Codex at `.dev/codex-home`,
using the existing account authentication and a minimal config. This is a local
test setup, not a change to global Codex configuration or a fork requirement. A
provider home is configuration/state isolation, not an OS sandbox or project
isolation. A future setup path must use the shared binaries, preserve the Paseo
skill bundle, and avoid copying personal hooks, plugins, settings, or credentials.
Do not repoint a main home until authentication and native session-history
continuation have been checked; existing resumes must remain usable.

## Lessons retained

- A required tracker once blocked ordinary work. Keep tracking a project choice.
- A protocol validator turned experimental tactics into permanent gates. Keep
  tactics editable as prose until a reproduced runtime failure needs code.
- SLP interleaved through shared daemon files made upstream integration costly.
  Keep profile content outside the kernel and use existing plugin seams.
- A finish notification once failed to wake Lead. Verify the actual handback
  path; a status label or fake transport is insufficient evidence.
- Parallel test runs created false failures. One owner runs heavy verification.
- Repeated adapters and compatibility branches hid unsupported provider behavior.
  Report actual capabilities and failures; do not advertise what was not proved.

## Sources

The current SLP contract is owned by this document, the global protocol template and role
instructions under `slp/plugin/server/`, the user-owned live global file, and the root
[Workspace Protocol](../WORKSPACE_PROTOCOL.md). Historical books, transcripts, and Demonthorn source material
remain provenance in the retired Foundation repository's Git history; this checkout
does not read them at launch or depend on an adjacent Foundation checkout.

Implementation references: [codex-room-setup at db4e4d7](https://github.com/hoangnb24/codex-room-setup/tree/db4e4d7053f067295b88f9262d0bccfe11685ddf/home/.config/codex-room/overlays)
and [repository-harness at e765792](https://github.com/hoangnb24/repository-harness/tree/e765792b635b4d5e3e5fc0578f82f9ca5dea2681).
Borrow the role boundaries and readable configuration, without importing their
installers or historical runtime machinery.

Keep the later three-role authority model and add Watcher only as a non-authority
attention helper; do not preserve the historical Root and Implementer identities.
The owner explicitly selected native Codex coordination
for this rebuild; use one coordination plane per assignment. The books' proposed
plugin hooks, trackers, classifiers, and councils are possible future mechanisms,
not this fork's implementation checklist. Before porting one, identify a repeated
failure, reuse an upstream primitive, and require the smallest change to remove the
failure. A mechanism that introduces another owner, lifecycle, store, or mandatory
artifact fails that test.
