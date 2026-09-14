# Workspace Protocol

Owner: Human project owner. Version: 1. Reviewed: 2026-09-10.
Readers: Lead; Supervisor when assigned to review or change this protocol.

- Scope: maintain a small fork of upstream Paseo v0.8.0. Carry role profiles and native Antigravity support; preserve ordinary upstream agent workflows.
- Design: use upstream configuration and provider seams first. Before adding infrastructure, name the observed failure and why a smaller change cannot fix it.
- Work: one Peer owns each implementation outcome. Tiny edits may stay with Lead. Concurrent writers use separate worktrees; integration belongs to Lead.
- Routing: discover available providers and models, then pin them in the assignment. Do not pin model names in standing profiles or silently substitute providers.
- Review: provider lifecycle and instruction transport changes need an independent review of a stable candidate. Routine edits need focused verification.
- Tests: establish the production contract before tests. Use the upstream focused test commands; serialize heavy builds and live provider checks. A fake transport proves mapping, not a working provider.
- Authority: assignments grant exact write scope and external actions. Full access is the requested runtime default and does not grant project acceptance or expand that scope.
- Escalation: bring failed premises, dependencies, and blocked prerequisites to Lead with evidence. Human decides changes to product scope, shared live services, and irreversible actions.
- Tracking: use the current assignment and Git evidence. Add an issue tracker only when this project needs one; none is required to start an agent.
- Evolution: keep novel or materially stronger causal observations in `SUPERVISOR_NOTEBOOK.md` and aggregate recurrence by pattern. Add a rule only for a reproduced problem; remove it when its cost exceeds its benefit. Do not encode this protocol as daemon admission logic.
