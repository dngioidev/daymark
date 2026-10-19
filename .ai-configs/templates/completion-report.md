# Task Completion Report Template

Use this template to format the final summary for any engineering or maintenance task, ensuring compliance with [`.ai-configs/rules/completion-report.md`](../rules/completion-report.md).

---

## 1. What Changed
- **Files Modified / Created / Removed**:
  - `path/to/file1`: Description of change.
  - `path/to/file2`: Description of change.
- **Summary**:
  - Concise narrative of functional, structural, and behavioral changes.

## 2. Important Implementation Decisions
- **Architectural & Design Choices**:
  - Key rationale for decisions made.
- **Assumptions Disclosed**:
  - Disclose any reasonable assumptions made for low-risk details.
- **Invariants Preserved**:
  - Note how Daymark invariants (data sovereignty, comment tags, rollover idempotency, Tailwind palette, full-width desktop) were maintained.

## 3. Verification & Checks Executed
- **Executed Checks**:
  - `command-name`: Outcome, exit code, summary of output.
- **Unexecuted Checks**:
  - List any checks that were not run or could not run, with specific rationale (e.g. environment constraints, no running server).

## 4. Known Limitations & Follow-Up Work
- **Limitations & Edge Cases**:
  - Any remaining limitations or potential regression areas.
- **Open Questions**:
  - Questions requiring user or stakeholder input.
- **Recommended Next Steps**:
  - Follow-up enhancements or future work items.
