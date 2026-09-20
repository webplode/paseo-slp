---
name: open-code-review-delegate
description: "Use open-code-review (OCR) as deterministic support for a host-agent code review: OCR selects reviewable files and resolves rules while the agent performs all semantic review. Use when a review should be driven by the current agent without configuring an OCR LLM endpoint."
license: Apache-2.0
metadata:
  author: alibaba
  homepage: https://github.com/alibaba/open-code-review
  version: "1.0.0-paseo.1"
---

# Open Code Review Delegate

Use OCR only for deterministic file selection and rule resolution. The host agent owns every semantic judgment, finding, and uncertainty statement.

Respect the current assignment and role. This skill grants no write, dependency-installation, orchestration, or acceptance authority. A Reviewer reports findings and never patches the candidate.

## Establish the target

Prefer an immutable commit or exact base/head pair supplied by the assignment. Record that identity before inspection. If the assignment requires a stable candidate but only moving workspace bytes are available, return the blocker instead of implying that the result covers a stable artifact.

Run preview from the repository root or pass `--repo`:

```bash
ocr delegate preview --format json [--from <base> --to <head>] [--commit <sha>] [--exclude <patterns>]
```

Workspace preview is valid only when the assignment permits review of current workspace changes:

```bash
ocr delegate preview --format json
```

Do not install or upgrade OCR unless the assignment authorizes dependency changes. If the command is unavailable, return a concrete `DEPENDENCY_REQUEST` or blocker.

## Resolve rules

Pass every reviewable path from preview to the rule resolver, in bounded batches when necessary:

```bash
ocr delegate rule --format json <path1> <path2> ...
```

Rules may be grouped by identical content. Preserve which `(path, status)` entries each rule group covers.

## Inspect the candidate

Use preview's exact mode and refs to obtain diffs:

```bash
# Range mode
git diff <merge-base>..<head> -- <path>

# Commit mode
git show <sha> -- <path>

# Workspace mode, tracked path
git diff HEAD -- <path>
```

Read an untracked file directly; its entire content is new. Inspect additional context when required to establish reachability, contracts, callers, tests, or impact. OCR output is a coverage floor, not a semantic conclusion or a ceiling on relevant context.

Create a checklist keyed by `(path, status)`. The same path can appear more than once, for example after staged deletion and untracked recreation. Account for every previewed entry as `reviewed` or `skipped` with a concrete reason. Do not stop after the first finding.

## Report

Report only evidence-backed findings. For each finding include:

- path and the tightest useful line range;
- severity and category;
- the failing mechanism and impact;
- the evidence or bounded verification that supports it.

Discard likely false positives. Separate confirmed defects from uncertainty.

End with:

- exact candidate identity and preview mode;
- commands run and rule groups applied;
- `total_files`, `reviewed_files`, `skipped_files`, and `coverage_rate`;
- every skipped `(path, status)` and reason;
- excluded files and OCR's reasons;
- whether the candidate identity remained unchanged.

Coverage alone is not approval. If the candidate changed during review, mark the handback stale and do not combine evidence from the different snapshots.

## Compatibility

`--format` requires OCR v1.9.0 or later. If and only if OCR reports `unknown flag: --format`, rerun the affected command without that flag and consume its text output directly. Do not parse text as JSON or invent missing fields. For any other failure, stop that OCR workflow and report the exact error.

`--background-file` rejects raw files over 1 MiB and sanitized content over 8000 characters. Do not silently truncate an oversized source. Either supply a faithful, shell-safe bounded summary with `--background`, or omit OCR background and read the source directly during semantic review.
