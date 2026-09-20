# Workspace Protocol

Owner: Human project owner. Version: 2. Reviewed: 2026-09-20.
Readers: Lead, Peer, and Supervisor after `$PASEO_HOME/workspace_protocol.md`.

This file contains only tactics specific to the `paseo-slp` repository.

- Scope: maintain a small fork of upstream Paseo v0.8.0. Carry role profiles and native Antigravity support; preserve ordinary upstream agent workflows.
- Risk and protected areas: role/profile binding, per-agent tool ceilings, Watcher routing, provider boundaries, project-memory bootstrap, and ordinary non-SLP behavior.
- Design: use upstream configuration and provider seams first. Before adding infrastructure, name the observed failure and why a smaller change cannot fix it.
- Ownership hotspots and shared contracts: protocol, client, server lifecycle, provider adapters, and plugin SDK changes need one integration owner and sequenced interface changes.
- Routing delta: Antigravity may serve Peer or Watcher, not Lead or Supervisor; standing profiles do not pin model names.
- Review: provider lifecycle and instruction transport changes need an independent review of a stable candidate. Routine edits need focused verification.
- Tests: establish the production contract before tests. Use the upstream focused test commands; serialize heavy builds and live provider checks. A fake transport proves mapping, not a working provider.
- Tracking: use the current assignment and Git evidence. Add an issue tracker only when this project needs one; none is required to start an agent.
- Evolution: keep novel or materially stronger causal observations in `SUPERVISOR_NOTEBOOK.md` and aggregate recurrence by pattern. Add a rule only for a reproduced problem; remove it when its cost exceeds its benefit. Do not encode this protocol as daemon admission logic.
