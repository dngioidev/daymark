# Repeatable Engineering Workflows

This directory contains standardized, step-by-step procedures for common engineering and maintenance tasks in Daymark.

## Workflows Index

| Workflow | File | Description |
| :--- | :--- | :--- |
| **Bug Fix** | [`bug-fix.md`](./bug-fix.md) | End-to-end triage, reproduction, minimal fix, and verification. |
| **Feature Development** | [`feature-development.md`](./feature-development.md) | Structured implementation from schema and types to UI and API. |
| **Code Review** | [`code-review.md`](./code-review.md) | Step-by-step audit against Daymark invariants and code standards. |
| **Regression Testing** | [`regression-testing.md`](./regression-testing.md) | Test scenarios for rollover, historical completion, and markdown round-trips. |
| **Documentation Update** | [`documentation-update.md`](./documentation-update.md) | Keeping docs and configurations aligned with code changes. |
| **Release & QA Handoff** | [`release-handoff.md`](./release-handoff.md) | Verification checklist and package readiness before release. |

## Relationship to Skills
- **Skills** (`.ai-configs/skills/`) define capabilities and procedures that agents can perform autonomously.
- **Workflows** (`.ai-configs/workflows/`) define the sequence of checkpoints and human/agent milestones for end-to-end lifecycle activities.
