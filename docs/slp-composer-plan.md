# SLP composer and provider isolation plan

Human approved implementation on 2026-09-16. This checkout owns the work; Product and
Foundation are historical references only.

## Outcome and boundaries

New agent creation offers role selection followed by a native Agent Profile enabled
for that role in the SLP plugin. Peer includes its existing specialization. The
ordinary prompt remains the bounded assignment. Keep one profile catalog, native
creation/lifecycle, and the existing SLP launch hook. Do not add a classifier,
provider priority router, role aliases, assignment schema, receipt, tracker, or
parallel lifecycle.

Core owns the generic draft composer contribution seam, profile selection/filtering,
creation metadata and loaded-plugin requirement, plus generic provider-option
precedence corrections. This is not a plugin-only patch. Role vocabulary, membership,
instructions and role policy stay in `slp/plugin`. Learn native composer presentation
and lifecycle reuse from old Product; do not import its routing/admission machinery.

See [change inventory](slp-change-inventory.md) for additions, maintenance costs and
known limits. The 2026-09-17 Human reproduction exposed an omitted New workspace
entry point. Its correction is now implemented and visible live, with wide
three-role fixture launches and compact UI evidence. Background-race and other
unexercised cases remain explicitly unaccepted in the inventory. Existing
workspace-draft proof and main activation were not acceptance of that entry point.

## Sequence

1. Preserve the pre-existing dirty changes in `docs/slp.md`,
   `slp/plugin/server/configure-role.test.ts`, `role-instructions.ts`, and untracked
   review skills. Record the starting diff. One Peer owns composer/core creation
   and all shared protocol/SDK changes. After an explicit ownership freeze, a
   second Peer may own the independent provider adapter/runtime setup files.
   Never overlap write ownership; one coordinator runs final shared builds/checks.
   If a Peer cannot converge because of context exhaustion, stop it and obtain an
   authoritative idle readback before transferring its exact remaining scope to a
   fresh Peer. Preserve its candidate; do not reset or overlap writers.
2. Add the smallest generic client plugin contribution for draft controls, native
   profile filtering/selection, and submission metadata. Keep teardown, host/workspace
   isolation, and error behavior explicit. Existing ordinary creation remains usable.
   Persist bound draft intent across route remounts and browser reloads alongside
   the native draft. Wait for that map to hydrate before submission; retained draft
   text must not silently outlive its role/profile binding.
3. Register SLP role/subrole choices in the composer. Filter native profiles using
   existing notes membership. Retain the selected profile identity, apply its native
   provider/model/thinking/features, and require a valid explicit selection after a
   role change. Empty membership links to existing configuration; do not auto-route.
4. Reuse shared SLP launch binding for role/profile/subrole and attention labels.
   Preserve native prompts, attachments, parentage, pending creation, and errors.
   Supervisor recovery/notebook remain explicit optional leases. Watcher retains
   its qualified advanced launcher with owner, scope, cadence, expiry, and stop
   condition; do not silently launch a Watcher without those fields.
5. Revalidate profile existence, membership, and provider at creation in the plugin.
   Missing/disabled/mismatched profiles and plugin failure must not create an
   unbound ordinary session. Declare a generic plugin dependency on the launch:
   the real `PluginRuntime.before` pipeline returns the unchanged request when no
   plugin is loaded, so client state alone cannot cover daemon-side unload/failure.
   Reuse creation metadata and runtime availability for that check; keep role
   admission vocabulary out of core. Role stays fixed after creation; later model edits
   do not grant another role or rewrite standing instructions.
6. Use shared Codex/Claude binaries and dedicated provider configuration homes for
   Paseo. Use existing provider overrides (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`), not
   per-role provider aliases. Supply a minimal reproducible setup path; never copy
   personal credentials/config/hooks wholesale. Authentication is an explicit
   prerequisite if the isolated home is not authenticated.
7. Pin native delegation off at the SLP provider boundary: Codex
   `features.multi_agent=false`, `features.multi_agent_v2=false`, and
   `agents.enabled=false`; Claude
   `settings.json` contains `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS="0"`, and
   SDK tool policy disables native subagents as well. Teams off alone is insufficient.
   Check the installed adapter/CLI version and project settings precedence. Persist
   policy through resume/refresh; host defaults and project config must not undo it.
   Keep unrelated capabilities unchanged. Align contradictory native-delegation
   instructions without reverting the existing review-skill changes.
   Qualify configured provider aliases through their declared native base family.
   Current Claude also exposes `SendMessage` as a native child-agent continuation
   path; deny it with `Agent` and legacy `Task`. Codex Watcher alone pins
   `features.goals=false`, because native persisted goals provide continuation
   outside its scoped Paseo heartbeat. Other roles retain goals behavior.
8. Update the owning API reference and SLP setup guide; link this plan from the
   owning SLP doc. Raise plugin requirements when the new client API requires it.
9. Run changed-file focused tests only, package builds before cross-package type
   diagnostics, then typecheck/lint/format. Exercise role changes, empty profiles,
   membership removal, plugin failure/teardown, duplicate names, and normal creation.
   Verify actual rendered desktop and compact composer and launch behavior.
10. Validate effective provider config with minimal harmless sessions, including
    project override/resume behavior. Repointing a provider home must account for
    existing native session history; do not silently invalidate old resume handles.
    Keep source/test evidence separate from live
    runtime evidence. Never restart main port 6767 without a fresh idle readback of
    agents and workspace scripts and the applicable activation authority. Prefer
    an isolated test host for builds and UI proof. Plugin source reload needs no
    daemon restart. Preserve existing home/listen/relay/WebUI settings.

## Doctrine acceptance

Role identity and universal invariants, repository Workspace Protocol, and bounded
assignment remain separate. Human owns purpose and external authority; Lead owns
coordination and acceptance; Peer supplies independent bounded judgment; Supervisor
observes and relays without becoming a second Lead; Watcher only samples attention.
Role selection grants no write ownership, recovery authority, or notebook mandate.
Preserve one write Owner per coupled scope, fresh independent review sessions,
neutral briefs, stable candidate evidence, and explicit Lead acceptance. Do not add
historical Foundation gates to this fork without a reproduced need and Human choice.

Completion means the selected role/profile reaches the existing SLP hook with the
correct labels and effective provider policy, tested UI behavior, and a separately
reported installed/live state. A dropdown or passing mocked test alone is not proof.

## Candidate handback — 2026-09-16

- Upstream stable verification: GitHub's latest published, non-draft,
  non-prerelease release is `v0.8.0` (published 2026-09-10). A fresh
  `git fetch --no-tags upstream refs/tags/v0.8.0` resolved to
  `b8e24677e12b226c7c38c1c3a40649daa9f1152f`, already an ancestor of the
  candidate base. Fetch changed neither the tracked diff nor the working-tree
  inventory; no merge or patch reapplication was needed. The candidate version
  remains `0.8.1`. The version bump preceded this verification incorrectly;
  future updates must verify/fetch the selected stable base before numbering
  downstream changes. Unreleased upstream `main` was not selected.
- Version `0.8.1`, uncommitted candidate on Git base
  `e6db403448d35dc9900bbf02c8ddf3ec131fc99e`; pre-existing changes preserved.
- 470 unique focused tests green; no full suite. Server/WebUI builds, typecheck,
  lint, formatting and final diff check passed.
- Actual wide and `390×844` Cua proof on an isolated daemon with deterministic
  adapters. Lead, Peer Reviewer, Supervisor and ordinary creations reached native
  creation; task overrides and reload binding survived. Membership/teardown
  rejection preserved agent count `3 → 3`. Supervisor attention remained bound.
- Real installed Codex/Claude CLI/SDK recorder proof covered native tool inventory,
  conflicting project settings and resume. This is not authenticated model proof.
- Isolated fixture stopped gracefully; evidence retained under
  `.dev/slp-composer-handoff.MFxSdG/`. Human authorized main activation on
  2026-09-17. Fresh readback at `2026-09-17T05:27:13.435Z` found 76 agents
  idle/closed, 15 active workspaces, and all 40 configured script entries stopped.
  Native SLP-checkout restart completed successfully: main daemon `0.8.1` on
  `127.0.0.1:6767`, PID `62287`, same server ID `srv_H9FX0QRO_xeb` and home
  `/Users/iznogoud/.paseo`, relay disabled and WebUI enabled. Post-restart status
  was reachable, `/api/health` returned `ok`, WebUI root returned HTTP 200, and
  plugin `slp` reported enabled/running. Main `config.json` SHA-256 remained
  `3d78db06eee41ff952be25d18e45d6984f6133e4b8ea136624995c20f1bc7ed8`.
- Dedicated-home setup remains dry-run only: authentication and the existing
  Claude resume-home decision are unresolved. No credentials or history migrated.
  Main restart requires Human permission and a fresh agents/scripts idle readback.
