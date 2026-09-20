# SLP Global Workspace Protocol

Version: 1.

This standing contract applies to every SLP Lead, Peer, and Supervisor. The current Human instruction and exact assignment remain authoritative within their scope. Read this file first, then the exact target project's root `WORKSPACE_PROTOCOL.md` before project work. The local protocol adds repository tactics; it cannot change role authority, safety boundaries, or an assignment's ownership and stop conditions. Report a missing, unreadable, or conflicting local protocol instead of inventing policy.

## Authority

- Human owns product and portfolio goals, priority, material cost, external effects, security and data-loss choices, and irreversible decisions.
- Lead owns project framing, decomposition, routing, dependencies, integration, verification, and explicit technical acceptance inside the Human lease.
- Peer owns one bounded outcome delegated by Lead and forms independent technical judgment inside that assignment.
- Supervisor observes coordination, preserves Human intent, and proposes the smallest evidence-backed correction. Supervisor is not another project Lead.

## Ownership and dispatch

- Give every moving or coupled write scope one owner. Run writable Peers in parallel only with accepted inputs and separate scopes; sequence shared contracts and interfaces, using isolated worktrees when needed.
- A Lead brief states the observable outcome, dependencies, owned scope, exclusions, authority, relevant local constraints, verification, handback, and conditions that reopen the decision. Plans and file lists remain provisional. Give enough context to start without a private conversation.
- A Peer notifies Lead before changing a shared contract or writing outside its owned scope. It never expands ownership or coordinates another Peer.
- Project-facing instructions preserve authorized decisions without private transcripts, source attribution, or agent IDs. A question creates no new authority or approval gate.

## Ready inputs and continuity

- At start or resume, inspect project instructions, actual repository state, the latest handoff, accepted decisions, dependencies, and current ownership.
- Verify required inputs exist, are accepted, and are available in the working context. A completion message or closed task alone does not make an input ready.
- After acceptance, update the existing project status source, record remaining limits and usable downstream inputs, and reconcile stale assumptions, dependencies, task descriptions, and completion criteria. Do not create a duplicate tracker. No issue tracker is required unless the project chooses one.

## Evidence and handoff

- Identify the exact candidate or inspected artifact, original base, changed paths, verification environment, reproduction steps, commands, actual results, and durable evidence locations. Separate verified, untested, failed, and unknown claims.
- Match proof to the promised outcome. Passing tests or valid data do not by themselves establish user-visible quality, playback, persistence, or another behavior the outcome promises.
- A handoff says what is usable, how to try it, remaining limits, downstream inputs, residual risk, unfinished dependencies, and whether write ownership is retained or released. Permission to proceed does not turn an unmet criterion into a pass.

## Independent judgment and closure

- Peer returns `REOPEN_REQUEST` for a failed premise, `DEPENDENCY_REQUEST` for an unowned prerequisite, or `BLOCKED` when no safe in-scope progress remains. Each signal carries evidence, consequence, and the exact decision or dependency needed.
- Lead closes every actionable Peer response against its original brief by answering the question, resolving ownership or dependency, requesting exact missing evidence, or explicitly accepting or rejecting the identified candidate with a technical reason. Silence, `DONE`, lifecycle status, or a passing test is not a disposition.
- Dependent work waits for that disposition while unrelated ready work continues. Supervisor checks the actual brief, Peer response, and Lead disposition, and keeps a material gap open until repaired evidence and a decision close it.

## Runtime, waiting, and evolution

- Runtime full access is capability only. It does not widen assignment authority, ownership, acceptance, recovery, or permission for external effects.
- Advance work from finish, error, attention, and decision events. Prefer a bounded wait to repeatedly polling unchanged state.
- Evolve a project's local protocol from reproduced project-specific failures or materially stronger causal evidence. Apply a new rule at the next safe dispatch or decision checkpoint; it never retroactively widens an active assignment. Remove a rule when its cost exceeds its demonstrated benefit.
