# SLP change inventory

Coordinator synthesis, 2026-09-18. This inventories the implementation discussed
with the Human, not every historical difference from upstream and not an
independent whole-repository review. The current correction removes the custom launcher,
adds registered-project memory backfill, and exposes the connected SDK only at server
contribution activation. Correction verification has explicit limits below.

## Boundary and verdict

The intended runtime remains one native profile catalog, one native agent lifecycle,
and one SLP creation hook. No classifier, cost router, assignment envelope, binding
receipt service, tracker gate, or second orchestration lifecycle was added in this
candidate. Role choice is metadata and policy selection, not a delegation lease.

The candidate has not become a second orchestration engine, but the client extension
is heavier than a role dropdown alone. The generic composer registry, resolver,
renderer, state persistence and request transport are a maintenance cost. That cost
is justified only by keeping SLP policy outside core and preserving native creation;
it must not grow into a plugin form engine or new workflow framework.

This is not a plugin-only patch. Core/app changes include the generic draft
extension, native profile-picker filtering, creation metadata transport, the loaded
plugin requirement and provider-option precedence. SLP role names, membership and
role-specific policy remain in the plugin. Calling those generic seams core-free
would be inaccurate; keeping their contract narrow is the actual architecture bar.

The initial delivery missed the actual New workspace entry point. Existing workspace
draft proof did not prove that entry point. Daemon version/health/plugin readback
proved activation, not complete UI integration. The coordinator's completion claim
was premature.

The custom SLP launcher is not retained. Its sidebar surface, workspace panel, Command
Center launchers, client launch module, and launch-only project-memory RPCs are removed.
The native draft composer still selects role/profile intent, and Settings still edits
role membership. No custom Watcher or recovery screen replaces the launcher.

The server contribution now receives the already-connected native `PaseoApi` as its
activation context. SLP subscribes to project updates before its initial project list,
backfills every registered project root, and releases that SDK subscription during
contribution cleanup. This is an activation seam, not a project store, router, or side
channel.

## What was added in this candidate

| Addition                                                                   | Owner/layer                                       | Why it exists                                                                                                | Disposition                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `addDraftComposer`, contribution collection/export/types                   | Generic plugin API and app registry               | Upstream composer pills are agent-scoped; role selection happens before an agent exists                      | Keep a narrow draft contribution, not a general form framework                                       |
| Profile-ID filtering and selection callback                                | Native profile picker                             | Reuse saved profiles and retain identity even with duplicate names                                           | Keep; there is no second profile catalog                                                             |
| SLP role/subrole controls and membership filtering                         | `slp/plugin/client/draft-composer.tsx`            | Choose role, then a native profile enabled through existing notes tags                                       | Keep in plugin; reuse on both New workspace and workspace drafts                                     |
| `ComposerSelect` host UI bridge                                            | Generic plugin client UI and app                  | A Settings row is not a composer toolbar control; it misaligned the role picker and reflowed native controls | Reuse the actual `AgentControlTrigger` and menu engine; no separate SLP design system or form engine |
| Selection merge/filter/error resolver                                      | `packages/app/src/plugins/draft-composer-core.ts` | Collect creation metadata and fail closed for stale/incomplete bindings                                      | Multi-contribution conflict/intersection support is anticipatory complexity; avoid expanding it      |
| Runtime/theme/error-boundary renderer                                      | `draft-composer-view.tsx`                         | Render trusted plugin controls using native context and lifecycle                                            | Keep only the host wrapper; reuse existing surface infrastructure                                    |
| Draft selection hook plus persisted selection map                          | `draft-composer.ts`, existing submission store    | A retained prompt must not silently lose its role after remount/reload                                       | Keep one canonical binding map; do not persist a second full composer configuration                  |
| Labels/dependencies through pending and create-request paths               | Native draft/request machinery                    | Preserve role/profile intent when native creation navigates or runs in background                            | Keep; missing New workspace wiring is a correctness defect, not a reason for another lifecycle       |
| `pluginDependencies` optional field, capability bit, SDK/CLI/MCP transport | Generic protocol/client/server                    | The before-hook pipeline otherwise returns unchanged requests when a plugin is absent                        | Keep: without this, unload/failure can create an ordinary unbound session                            |
| Dependency checks before and after creation hooks, immutable hook metadata | Plugin runtime/lifecycle/AgentManager             | Check actual loaded state, including teardown during async hooks and callers without UI                      | Keep boundary checks; no SLP vocabulary belongs in daemon admission code                             |
| Codex native-agent switches and Claude native-tool/team policy             | SLP provider-boundary hook                        | Paseo remains the delegation plane; teams-off alone does not disable Claude subagents                        | Keep for newly bound sessions and their persisted resumes                                            |
| Explicit session-options precedence, recursive/dotted host-default merge   | Codex adapter                                     | Host defaults must not overwrite explicit role/session policy                                                | Keep the generic precedence correction, scoped tests and compatibility evidence                      |
| Watcher-only Codex goals off, including process-start override             | SLP policy and Codex adapter                      | Native autonomous goals bypass the Watcher's assigned heartbeat cadence                                      | Keep; unrelated roles retain goals behavior                                                          |
| Provider-family qualification through configured `extends`                 | SLP hook                                          | Apply policy to declared native aliases without creating role-specific providers                             | Keep qualification only; no alias catalog or custom routing service                                  |
| Dedicated-home provisioning script                                         | `slp/setup-provider-homes.mjs`                    | Seed minimal config and selected skill links using existing provider environment overrides                   | Optional/manual, not a launch gate; never migrate auth/history silently                              |
| Local recorder/provider and UI fixture scripts                             | Proof tooling                                     | Check real installed CLIs/tool inventory and rendered flows without live model calls                         | Test-only, never a shipped lifecycle service                                                         |
| Focused tests, API/setup docs and workspace version synchronization        | Tests/docs/manifests                              | Make modified contracts verifiable and client requirements explicit                                          | Keep owning docs concise; file count includes tests and synchronized manifests                       |

Three new generic draft-composer modules initially totalled 449 lines; the SLP
control was 311 lines, home setup 237, recorder proof 333 and UI proof host 151.
These are pre-correction source sizes, not measures of correctness or total runtime
complexity. Proof/setup scripts are not daemon services. New workspace work can
change these counts; no moving-candidate line total is presented as acceptance.

## Not introduced by this work

The role instructions, membership settings, Watcher heartbeat / attention flow,
project-memory templates and instruction quality rules, and Antigravity integration
already existed at Git base `e6db403448d35dc9900bbf02c8ddf3ec131fc99e`. This candidate
reused them while removing the custom launcher presentation and moving bootstrap identity
to registered project roots. The registered-project backfill and activation API are the
focused lifecycle additions.
The untracked OCR/Triple Review skill packages and review-routing edits were
pre-existing Human changes and were preserved, not invented by this implementation.
Triple Review remains explicit-only; it is not a mandatory role-launch ceremony.

Upstream agent-request receipts already existed. This candidate did not add them;
`pluginDependencies` is a distinct loaded-plugin requirement, not another receipt.

## What to learn from old Product

Old Product passed role choices through native draft controls and reused the saved
Agent Profile application path. Preserve that direct user flow and native task
overrides. Do not import its `role-profile.ts` catalog/receipt DTOs, assignment
envelopes, role-binding services or delegation-admission system to reproduce a
dropdown. Product's own migration separated durable role behavior from model launch
defaults; keep the same conceptual separation without importing migration machinery.

## Remaining risks and reduction opportunities

- New workspace now renders the existing control and carries binding through
  pending and background paths. The background race still lacks accepted end-to-end
  proof; source inspection is not presented as that proof.
- Pre-workspace context must allow an absent workspace ID. Inventing one to fit
  an API would couple plugin behavior to a false runtime identity.
- Persisted binding scope and React component lifetime must use the same draft
  identity. Host plus directory alone cannot distinguish two route drafts in the
  same project; a scoped store key alone does not reset local role state.
- Generic profile snapshots duplicate fields also owned by native form state.
  The selected ID/provider is binding identity; request model/thinking/features
  must come from current native controls, not the cached profile template.
- Multi-plugin merge/conflict handling has no demonstrated second consumer here.
  It is not a router, but is the first place to simplify if its maintenance cost
  grows. Do not add priorities, automatic profile selection or negotiated leases.
- Empty-profile recovery belongs to the plugin: `slp/plugin/index.client.tsx`
  wraps its draft component with the existing `openRoleSettings` callback. The
  generic host wrapper does not need an SLP-specific settings route or RPC.
- Separate config homes are config/state isolation, not an OS sandbox. Main was
  activated without repointing provider homes. Setup is still blocked by Claude
  history/authentication decisions and is not a prerequisite for composer use.
- Native delegation policy is pinned for newly role-bound sessions; activation
  does not retroactively rewrite old sessions' stored creation config.
- The pre-existing role hook chooses full-access for non-Watcher roles, even when
  a saved Peer/Scout profile says read-only. This candidate did not introduce that
  mode selection: `docs/slp.md` records full runtime access as part of the accepted
  bicycle scope. It nevertheless conflicts with the current Scout profile's
  mandatory read-only notes and prevents an unqualified claim that arbitrary
  no-write assignments are daemon-enforced. A read-only profile label or instruction
  alone is not enforcement. If the Human requires runtime-enforced no-write beyond
  Watcher, resolve that exact provider-boundary requirement separately; do not
  silently import generalized assignment/admission machinery to achieve it.
- Earlier 470 focused green tests and recorder/fixture proof do not establish all
  doctrine intent, authenticated production model behavior, or the omitted entry
  point. Keep those evidence boundaries visible instead of adding more gates.
- Activation backfill writes only isolated fixture roots in focused tests. No live
  plugin activation or registered user project was touched here; Lead owns that
  activation readback because it mutates registered project roots.

## Acceptance for the correction

Use the same role/profile contribution and server hook. Exercise Lead, Peer and
Supervisor on New workspace at wide and compact widths, check native task overrides,
pending/background transport, stale membership/teardown, and ordinary empty/terminal
flows. Confirm that no SLP sidebar, workspace-panel, or Command Center launcher is
registered. Focused runtime tests must cover project registration without a workspace,
shared roots across worktrees, existing-byte preservation, race and blocked targets,
Supervisor authority without a notebook label, activation subscription ordering, and
cleanup. Stop at that evidence bar; do not invent a new role router, schema or review
ceremony. Installed state must be reported separately from source/fixture results.

Coordinator presentation readback on 2026-09-18 used Chrome against main
`127.0.0.1:6767`, after the WebUI build and SLP plugin reload. The role trigger now
uses the real native composer control: role/model/thinking/mode were all 28px high
with the same wide-screen baseline. Status guidance stays inside the native menu.
Lead exposed two enabled native profiles, Supervisor four, and Peer/Reviewer three;
native profile selection applied the model/thinking values. At 390 × 844 the
controls and native profile sheet remained usable without horizontal overflow;
Peer wraps when its specialization needs another row. Enter/Arrow navigation,
Escape focus return and expanded state were checked on the final candidate.
No agent was submitted on the Human project. Role was restored to `None`, original
model preferences and viewport were restored, and the original Chrome tab was
refreshed successfully. This is presentation proof, not background-path or new
launch acceptance. It predates the launcher removal and does not prove activation
backfill. The daemon was not restarted.

## Correction handback, 2026-09-17

One Paseo Peer owned the UI correction, then froze and became idle. The coordinator
fixed the two introduced memo dependency omissions and reduced repeated optional
dependency expressions by depending on existing state objects; no new module/hook
or complexity exemption was added for that lint fix. Final targeted lint and app
typecheck are green. The focused binding tests passed 4/4; plugin and WebUI builds
passed. Unchanged earlier green tests were not used as proof of the omitted screen.

The isolated fixture submitted Lead, Peer/Reviewer and Supervisor from the actual
wide New workspace screen. Provider readback showed Codex, `gpt-5.4-mini`, low
thinking and the SLP-selected `full-access` boundary for all three. Persisted labels:

- Lead: `slp.role=lead`, `slp.profile=fixture-lead`.
- Peer: `slp.role=peer`, `slp.profile=fixture-review-codex`, `slp.subrole=reviewer`.
- Supervisor: `slp.role=supervisor`, `slp.profile=fixture-supervisor`,
  `slp.attention=workspace`.

Fixture evidence is retained in `.dev/slp-composer-handoff.8MzjJS`. Its raw provider
config log includes inventory probes and session-local MCP configuration; it is not
a curated public report. No live model authentication or paid calls were used.

Not claimed green: deterministic role-bound background-race creation, fixture
stale-membership/teardown, reload/remount persistence, empty workspace and terminal
creation, or compact Supervisor creation. Full-document `goto` attempts were
discarded as background evidence. Compact UI and Lead/profile interaction were
exercised; the coordinator separately verified compact Peer UI. Test processes and
temporary tabs were closed and viewports reset. Main PID `62287` was not restarted;
its health endpoint remained healthy after the correction. This is bounded UI
delivery and evidence, not unconditional full-workflow/doctrine acceptance.
