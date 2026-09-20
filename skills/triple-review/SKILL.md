---
name: triple-review
description: Run a Lead-owned review of one stable high-risk candidate with two sealed heterogeneous semantic Reviewer Peers and one OCR Delegate coverage Reviewer. Use only when the Human or Workspace Protocol explicitly requests Triple Review; do not use for ordinary review, an unstable candidate, or from Peer, Watcher, or Supervisor authority.
---

# Triple Review

Lead alone runs this explicit escalation. Triple Review buys two independent semantic judgments plus deterministic coverage; it is not a vote and does not transfer project acceptance.

## Preconditions

Before creating a lane:

1. Read the applicable `WORKSPACE_PROTOCOL.md` and confirm that the Human or protocol explicitly requested Triple Review.
2. Freeze one reproducible candidate identity: an immutable commit, exact base/head SHAs, or another deterministic snapshot accepted by the assignment. Never review moving worktree bytes.
3. Write one neutral brief with the candidate identity, intended behavior, material constraints, exclusions, and required evidence. Do not seed suspected defects, another lane's findings, or Lead's preferred conclusion.
4. Discover and pin the exact provider, model, and effort for each lane. Semantic lanes A and B must use separate sessions from different provider families. Do not silently substitute a missing route.

If any precondition fails, return the concrete blocker. Do not degrade to fewer lanes and call the result Triple Review.

## Create three sealed Reviewer Peers

Use Paseo's ordinary agent creation route for every lane. Set `slp.role=peer`, the selected `slp.profile`, and `slp.subrole=reviewer`. Do not add another profile registry, lifecycle, or review service.

- **Semantic lane A:** independently falsify the candidate against the neutral brief.
- **Semantic lane B:** perform the same independent semantic review in a separate provider family and session.
- **Coverage lane:** load `open-code-review-delegate`; use OCR for deterministic selection and rule resolution, then perform semantic review with the lane's own model.

All three assignments are no-write review assignments even when their runtime has broader capability. Reviewers do not patch findings, coordinate lanes, or claim acceptance.

Keep the first pass sealed. No lane sees another lane's prompt additions, selected files, findings, or conclusions. The coverage lane's file set is a coverage floor, not a third semantic ballot.

## Require accountable handbacks

Every lane must return:

- the exact candidate and reviewed contract;
- checks run and personally observed evidence;
- findings ordered by severity, uncertainty, and residual risk;
- confirmation that the candidate remained stable.

The coverage lane must also return every selected `(path, status)` as reviewed or skipped with a reason, excluded paths and reasons, rule groups, commands, and coverage rate.

Reject stale or incomplete handbacks. Do not merge evidence across candidate identities or infer approval from silence, lifecycle completion, test status, reviewer count, or coverage alone.

## Adjudicate

Lead compares mechanisms and evidence, not votes. When lanes conflict materially, wait until every sealed handback exists, then write the contradiction as falsifiable claims and return the same neutral contradiction packet only to the conflicting lanes. Ask each lane:

- what evidence would disprove its position;
- whether the opposing mechanism can satisfy the governing constraint;
- what smallest bounded check resolves the conflict;
- whether it yields, narrows, or maintains its claim afterward.

Run or delegate only the smallest decision-changing reproduction. Record the accepted claim, rejected claim, decisive evidence, residual uncertainty, and correction owner. Repeated symptoms sharing one ownership, lifecycle, state, contract, or foundation mechanism require reopening that premise rather than stacking local patches.

When a consequential conflict remains unresolved after Lead adjudication, return the
decision surface to the Human. Open a Council only after a separate explicit Human
authorization; it is not a Triple Review step.

## Return the verdict

Return one compact artifact containing the candidate identity, lane routes and receipts, sealed-pass status, findings, OCR coverage accounting, contradiction checks, Lead's verdict, correction ownership, residual risk, and any Human decision required.

Only Lead may issue `ACCEPT`, `REVISE`, or reopen. The three Reviewers provide evidence; none owns the project verdict.
