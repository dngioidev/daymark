# Universal Agent Rules

This directory contains the canonical behavioral, safety, engineering, and verification rules for all AI coding agents working on the Daymark repository.

## Rule Index

1. [**`general-behavior.md`**](./general-behavior.md)
   - Understanding context, minimal surgical interventions, strict realism, ambiguity handling.
2. [**`repository-safety.md`**](./repository-safety.md)
   - Secret protection, data preservation, destructive command prevention, dependency and Git safety.
3. [**`engineering-standards.md`**](./engineering-standards.md)
   - Architecture layer separation, strict types (`src/types/daymark.ts`), Daymark HTML metadata invariants, idempotent rollover, Tailwind palette discipline, full-width desktop layout.
4. [**`testing-and-verification.md`**](./testing-and-verification.md)
   - Evidence-based verification, targeted testing, failure investigation, standard commands.
5. [**`completion-report.md`**](./completion-report.md)
   - 4-part completion report required for all completed tasks (What Changed, Key Decisions, Verification & Checks, Limitations & Follow-Up).

## Precedence & Resolution
All agents must observe the instruction hierarchy documented in [`.ai-configs/README.md`](../README.md#instruction-hierarchy--precedence). Rules in this directory represent the authoritative baseline for repository engineering.
