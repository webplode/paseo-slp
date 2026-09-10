# Paseo SLP

This fork starts from upstream `v0.8.0`, commit
`b8e24677e12b226c7c38c1c3a40649daa9f1152f`. Its additions are role profiles and
native Antigravity support. Keep the upstream session, workspace, event, CLI,
and app machinery as the foundation.

## Run from this checkout

Install and authenticate Codex and Antigravity CLI (`agy`) using their own tools.
Build the checkout, then generate a config for a fresh local home:

```sh
npm ci
npm run build:server
npm run build:daemon-web-ui
mkdir -p .dev/slp-home
node slp/config.mjs > .dev/slp-home/config.json
node packages/cli/dist/index.js daemon start --home "$PWD/.dev/slp-home" --listen 127.0.0.1:6781 --web-ui --no-relay
```

Open `http://127.0.0.1:6781`. Select a role provider such as `codex-lead` or
`antigravity-peer` in the ordinary provider picker. CLI runs use the same aliases:

```sh
node packages/cli/dist/index.js --host 127.0.0.1:6781 run --provider codex-peer --cwd /path/to/project 'Inspect the project and report findings. Do not edit files.'
```

`slp/config.mjs` only prints JSON; it does not install software, change global
configuration, or restart a daemon. For an existing home, merge its
`agents.providers` entries into the existing config instead of replacing the file.
Edit the three canonical files in `slp/profiles/` and regenerate the config to
change future agents. Existing sessions retain their creation instructions on
resume. Models remain discoverable and selectable at launch.

## Design boundary

Profiles carry durable behavior. `WORKSPACE_PROTOCOL.md` carries repository
tactics for Lead. An assignment carries today's objective, ownership, authority,
and evidence. Role names do not belong in daemon admission logic.

Human owns purpose and external decisions. Lead owns project coordination and
acceptance. Peer owns a bounded outcome and independent judgment. Supervisor
observes reasoning and workflow, asks evidence-backed questions, and relays Human
decisions. It does not become a second project owner.

All three profiles start with full runtime access as requested by this fork's
owner. A no-write assignment remains an instruction, not a sandbox guarantee.
Full access does not widen the assigned scope or grant acceptance authority.

## Native Antigravity

The provider runs the installed `agy` CLI directly, using its
[headless stream](https://www.antigravity.google/docs/cli/headless/) and exact
conversation IDs. It discovers models with `agy models`. Provider command and
environment overrides use the ordinary upstream configuration.

Instruction profiles use native agent files in a private temporary directory.
The workspace is passed explicitly so shell tools run in the project rather than
the profile directory. The profile exposes shell execution, file reading,
searching, and editing. Full access maps to `--dangerously-skip-permissions` and
the native eager command policy. Stop waits for the process to exit and settles
unfinished tool entries before accepting another turn.

This adapter accepts text. It does not expose MCP/Paseo tool injection, image
input, native transcript import, or interactive permission replies. Existing
Paseo timelines remain available; stored native conversations resume normally.
Use `codex-lead` when coordination requires Paseo tools and `antigravity-peer`
for bounded Antigravity work. These limitations are reported as provider
capabilities, not filled in with another gateway.

## Local verification

Verified on 2026-09-10 with Codex CLI 0.154.0 and Antigravity CLI 1.1.28:
353 focused tests, workspace typechecks, lint, server build, and WebUI build.
The isolated daemon at `127.0.0.1:6781` passed health and WebUI checks. Real
Codex (`gpt-5.6-luna`, max) and Antigravity sessions retained role instructions
and conversation IDs across turns and a daemon restart. Native shell cwd,
active-command cancellation, terminal tool status, and the next turn were checked.
Restoring an agent without a native handle also retained exactly one role prompt.

This machine's existing Codex model catalog is incompatible with its CLI. The
local `.dev/slp-home/config.json` therefore points Codex at `.dev/codex-home`,
using the existing account authentication and a minimal config. This is a local
test setup, not a change to global Codex configuration or a fork requirement.

## Lessons retained

- A required tracker once blocked ordinary work. Keep tracking a project choice.
- A protocol validator turned experimental tactics into permanent gates. Keep
  tactics editable as prose until a reproduced runtime failure needs code.
- SLP interleaved through shared daemon files made upstream integration costly.
  Keep profile content outside the kernel and use existing provider seams.
- A finish notification once failed to wake Lead. Verify the actual handback
  path; a status label or fake transport is insufficient evidence.
- Parallel test runs created false failures. One owner runs heavy verification.
- Repeated adapters and compatibility branches hid unsupported provider behavior.
  Report actual capabilities and failures; do not advertise what was not proved.

## Sources

The owner's three references live in the adjacent Foundation checkout:

- [Giáo Án Herdr — First edition](../../paseo-foundation/references/Gi%C3%A1o%20%C3%81n%20Herdr%20-%20First%20edition.pdf): a small coordination protocol, open questions, independent sessions, one writer, proportional evidence.
- [Unowned Decisions](../../paseo-foundation/docs/books/ai-agent-orchestration-doctrine.en.md): three instruction layers, attention over ceremony, tests after owned contracts, and the downstream failure analysis in chapters 16–19.
- [Demonthorn deep dive](../../paseo-foundation/references/demonthorn-agent-orchestration-deep-dive.md): the later Supervisor/Lead/Peer model and thin repository tactics.

Implementation references: [codex-room-setup at a38c5ce](https://github.com/hoangnb24/codex-room-setup/tree/a38c5ceaa0e30aa709a917136fdeaa6de2925993/home/.config/codex-room/overlays)
and [repository-harness at e765792](https://github.com/hoangnb24/repository-harness/tree/e765792b635b4d5e3e5fc0578f82f9ca5dea2681).
Borrow the role boundaries and readable configuration, without importing their
installers or historical runtime machinery.

Use the later three-role model rather than preserving the historical Root and
Implementer identities. The owner explicitly selected native Codex coordination
for this rebuild; use one coordination plane per assignment. The books' proposed
plugin hooks, trackers, classifiers, and councils are possible future mechanisms,
not this fork's implementation checklist.
