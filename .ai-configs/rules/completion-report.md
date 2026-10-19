# Completion Report Standard

At the conclusion of every engineering task, the agent must deliver a clear, evidence-based summary structured into the following four sections:

## 1. What Changed
- A concise list of files created, modified, or removed.
- High-level summary of the functional and structural modifications made.

## 2. Important Implementation Decisions
- Rationale behind key architectural, design, or algorithmic choices.
- Trade-offs evaluated and conventions followed.
- Disclosure of any assumptions made for low-risk details.

## 3. Verification & Checks Executed
- Commands executed to verify the change (e.g. type checks, build commands, test runs, validation scripts).
- Concrete outcomes and evidence of success (exit codes, error counts, build output).
- Explicit disclosure of any checks that were not run or could not be run, along with the reason.

## 4. Known Limitations & Follow-Up Work
- Any known limitations, edge cases, or potential regression risks.
- Unresolved questions requiring user or team feedback.
- Recommended next steps or future enhancements.
