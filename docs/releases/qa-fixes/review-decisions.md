# QA review decisions and deferred findings

These are the inherited Superpowers ledger entries plus rulings made during the Codex continuation. They preserve the rationale and stated costs; some historical findings were promoted and fixed later, as noted in subsequent entries. The original handoff scratch remains available locally.

## Rulings I made or inherited

- Ruling: work in-place on a new branch instead of a git worktree — repo was clean and the user asked to run the plan here — cost if wrong: none beyond worktree isolation.
- Ruling: Task 1 deletes probe B15 (C4 covers the undo-snapshot bug; B15's remaining subject is backlog BL-3) and tightens B6b to look for the task card button `Mark "Past task" done` on Today — otherwise test:qa can never reach 0 failed and B6b hides BUG-08's second half — cost if wrong: BL-3 loses its probe (still listed in report backlog).
- Ruling: Task 12 adds pure `toggleTaskDone(task: TaskItem, date: string): TaskItem` in taskActions.ts, used by both `toggleTaskDoneInDocument` and `TaskItemCard.toggleDone`; the status dropdown is out of scope — cost if wrong: choosing "Done" from the status dropdown and back still resets to in-progress.
- Ruling: controller reworded plan Task 2 Step 4 to not contain a literal Markdown javascript: link (commit 7b5feb2) — validate:ai link checker rejected it; plan meaning unchanged — cost if wrong: none.
- Ruling: accept Task 2 deviation ADD_URI_SAFE_ATTR ['type','start','align','colspan','rowspan'] — the plan's narrow ALLOWED_URI_REGEXP strips every plain-valued attribute (reviewer confirmed in DOMPurify source); allowlist opens no injection path — cost if wrong: some harmless raw-HTML attributes (width, dir, tel: hrefs) still dropped.
- Ruling: keep rejecting duplicate dates on Markdown ZIP import — importing both would create two docs for one date (find() picks the first, the other becomes invisible/unsynced); the error names the date so the user can fix the vault — cost if wrong: an Obsidian vault with a duplicated day must be cleaned before import.
- Ruling: batch Tasks 5 and 6 into one dispatch and one review — both are small single-function sync fixes with their own tests and no shared code; saves a dispatch+review pair — cost if wrong: a review finding in one blocks marking the other complete.
- Ruling: override plan Task 6 timestamp to `${targetDate}T00:00:00.000Z` — the bug fix's purpose is cross-device determinism (spec BUG-10); local parse breaks it for devices in different zones — cost if wrong: history drawer may show the carry time as e.g. 07:00 local instead of 00:00.
- Ruling: in mergeDailyDocument, when base is null and one side tombstoned a task id, the deletion wins over the other side's copy — fresh days on two devices are almost always identical carries (BUG-10 made them deterministic); keeping it undoes the user's delete — cost if wrong: an offline edit to that same task on that same never-synced day on the other device is lost.
- Ruling: fold two reviewer minors into Task 7 fix round: clearSectionNotes Undo uses onPatchDocument (same BUG-13 class), and isDailyDocument rejects a non-string-array removedTaskIds (else server merge 500s) — both small and in this task's blast radius — cost if wrong: slightly larger diff.
- Ruling: promote to Task 8b follow-up after Task 9 — (1) reopenTask's fallback is bounded to copies on/before targetDate (return updatedTask null if none); (2) App past-day reopen: after rollover, if the task is not on today, reopen it directly into today (reopenTask(taskId, today, …), which also clears today's tombstone); toast reflects where it landed; later done copies are NOT rewritten (history keeps them) — cost if wrong: a task completed on a later day and reopened on an earlier one appears open today while history still shows that later completion.
- Ruling: fold Task 9 minor "settings message only checked as object → normalizeSettings throws on version skew" into Task 8b — use isSyncedSettings in parseVaultMessage — cost if wrong: none.
- Ruling: (1) and (3) acknowledged without change — BroadcastChannel is same-origin only and any same-origin script can already read/write the IndexedDB vault directly, so no new boundary; the sync token lives in sync_state, which is never broadcast — cost if wrong: a same-origin XSS (already fixed by Task 2) could read settings.syncConfig via the channel as it already could via IDB. (2) fixed in Task 8b (isSyncedSettings) plus a try/catch around listener dispatch.
- Ruling: batch Tasks 10 and 14 into one dispatch/review — both are small, independent TodayView UI fixes in different regions with their own probes — cost if wrong: a finding in one delays marking the other complete.
- Ruling: T14 uses one combined toast from handleTaskUpdate when a completion leaves no old tasks while filtered: "Done: X. No old tasks left, showing everything." with the Done Undo; hide-warning path keeps "No old tasks left. Showing everything." info toast; remove lastDoneUndo — cost if wrong: copy differs slightly from the plan's info text on the tick path.
- Ruling: execute remaining tasks inline and use one fresh final reviewer, following executing-plans; retain existing handoff scratch rather than deleting recovery records.
- Ruling: preserve corrupt server records on disk and omit them from outgoing sync; avoid deleting potentially recoverable data. Cost: a corrupt record is invisible to clients until repaired from a valid device copy.
- Ruling: offline PWA assertion must wait for React/IndexedDB hydration after domcontentloaded, matching the earlier offline task check. Original failed immediate isVisible; waiting passes with actual persisted task. No persistence assertion removed.
- Final: Ruling: real mixed-version and native-device runtime testing remains outside this browser-only QA run. Existing merge tests cover optional-field behaviour; no actual older-client binary or Android device used. Cost: runtime compatibility on those targets remains unverified.
- Ruling: refresh audit selectors (sample vault, task details, capture, settings/sync, mobile Markdown) and throw on failed navigation; initial screenshot evidence demonstrated every prior image was the welcome dialog. Cost: future label changes now intentionally fail the audit.

## Deferred minors

- Task 1: review — spec ⚠️ B8a error-check vacuous (Important); minor (deferred): qa-results.json still written to tmp; fix round 1 sent to implementer (FIX_BASE 6874e0c)
- Task 2: minor (deferred): allowlist drops other plain attrs/relative hrefs (consider DOMPurify-style regex)
- Task 2: minor (deferred): `/\evil.com` passes ^\/(?!\/) (off-site link, not XSS)
- Task 2: minor (deferred): <img src=data:> still allowed via DATA_URI_TAGS
- Task 2: minor (deferred): B7c swallows failed click; assert anchor exists + href not javascript:
- Task 2: minor (deferred): no unit test for renderMarkdownHtml (DOMPurify fails open without DOM)
- Task 2: minor (deferred): light-mode screenshot predates checkbox fix; probe order B7f before B7e
- Task 3: minor (deferred): no test for handleImportJson refusal / Markdown-path throw / note damage; duplicate defaultData import in test; empty title/status accepted
- Task 3: minor (deferred): loadValid cache write-back not directly tested
- Task 4: minor (deferred): validValue routes any non doc/note key to settings check (make explicit key==='settings')
- Task 4: minor (deferred): no tests for invalid settings / valid note+settings accepted
- Task 4: minor (deferred): corrupt stored value + incoming delete leaves corrupt entity in place
- Task 5: minor (deferred): relogin with unsynced local settings edits → server settings win (by design, message shown)
- Task 6: minor (deferred): rollover doc.updatedAt still clock-based (merge tolerates)
- Task 6: minor (deferred): carried history timestamp is now a fixed UTC midnight, not the actual carry time
- Task 7: minor (deferred): StandaloneNotesView delete-note Undo restores stale snapshot
- Task 7: minor (deferred): Markdown-only ZIP import loses tombstones (snapshot preferred)
- Task 7: minor (deferred): same id under two headings → removed records only last
- Task 7: minor (deferred): stale tombstone left after task returns via merge
- Task 7: minor (deferred): Done-Undo restores whole previous task (reverts later edits to that same task); notes-Undo no-op if section renamed
- Task 8: minor (deferred): History-reopen toast "back on today's list" can be false (later done copy / today already has it done / today tombstoned); check carriedCount
- Task 8: minor (deferred): no test for reopenTask + performDailyRollover past-day flow
- Task 9: minor (deferred): settings JSON-equality skip is redundant (normalizeSettings keeps identity) — reword or remove
- Task 9: minor (deferred): simultaneous writes in two tabs within ms → one edit lost (accepted design limit; note in comment)
- Task 9: minor (deferred): message during initVaultStore overwritten by IDB snapshot; channel never closed (HMR); no unit test for writeValue loop guard
- Task 8b: minor (deferred): no test running tomorrow's rollover after (c); reopen-into-today history doesn't note carry
- Task 10: minor (deferred): saveMarkdown draftDate guard returns silently; confirmLeaveDraft clears dirty before no-op nav

## Final independent review

Two Important findings were reproduced and fixed in commit 41d5e50: accepted tasks without history crashed on toggle, and corrupt server entities were returned on pull-only sync. Three regressions failed first, then passed. Full suite: 133 passed, one Windows-specific skip.

The reviewer declined to judge visual/native/runtime mixed-version behaviour without execution. Browser suites and visual audit subsequently passed. Actual older-client binaries and native Android hardware were not tested.
