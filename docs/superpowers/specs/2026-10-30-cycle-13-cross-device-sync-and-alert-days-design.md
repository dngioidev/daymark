# Cycle 13: cross-device sync verification and alert counting days

## Intent and why

Version 1.9.1 fixed a real data bug: a task finished on one device was reopened by a stale device. Two sync problems in two days (the 1.9.0 build and one task bug) show that the sync path has more untested corners. The owner's goal is confidence: every kind of data that syncs between devices must arrive without loss, and when two devices edit the same thing, the conflict must be resolved without silently dropping an edit.

The cycle also adds one small feature: the owner chooses which days of the week count when alerts and warnings measure age.

## Part 1: sync verification and fixes

### Goal

Find, with tests, every place where data can be lost or devices can end up different, and fix them. Cover every synced entity: daily documents and tasks, standalone notes, settings, habits and habit days, backlog, note metadata (folders, dismissed pairs), and the pictures inside notes.

### Starting points found by reading the code (unconfirmed until tested)

1. **Settings** merge as one block. If two devices change different settings, the incoming device's whole settings object wins and the other device's change is lost. Fix: merge per field, and report a conflict only when both devices changed the same field.
2. **Habits and backlog items** merge whole-item by timestamp. Edits to different fields of the same item on two devices cannot both survive. Fix: merge per field where the data allows it.
3. **Device clocks** decide winners for habits, backlog, ticks and folders. A device with a wrong clock would win every conflict. Decide and document a protection (the builder chooses; for example, comparing against server receive time or capping future timestamps).
4. **Notes** keep the server copy and save the other as a "conflict copy". Not tested: delete on one device against edit on another, folder rename against move, a note edited offline for a long time.
5. **Server**: not tested: two devices syncing at the same moment, a sync that fails halfway and is retried, a third device joining during a conflict.
6. **Convergence**: no test proves that devices always end up identical. Add a randomized test: random edits on three devices, random sync order and offline gaps, then assert that all devices are identical and no edit that should survive is missing.

### Pictures inside notes (must not lose)

Pictures sync as files named by content hash, referenced from the note text as `daymark-asset:<hash>`; the server keeps them apart from the synced entities. The existing e2e checks one happy path. Add tests for: an upload that fails or is interrupted and is retried; a note that arrives before its picture; a missing or damaged file on the server; a picture over the 1.5 MB limit (the user must see a clear failure, not a silently missing picture); deleting a note and what happens to its pictures; a third device that joins later and receives notes plus pictures; backup and restore keeping the references working.

### Non-goals

- Background photos stay on the device where they were chosen. The owner said they do not need to sync. The receiving device must not break (no error, a clean fallback); confirm this with a test but do not build photo sync.
- No new sync protocol or server rewrite unless a test proves the current one cannot be made safe.

### Anti-goals

- A fix that makes a test pass by discarding one side's change.
- A merge rule that is deterministic on one device but gives a different result on another (devices must converge).
- Changing the stored data format in a way that breaks a device still on 1.9.1.

## Part 2: alert counting days

### Behaviour (the owner's decisions)

- Two separate choices, not shared: one for **task aging** (the carried-task attention bar and the "over N days old" count), one for **habit warnings** (missed days).
- Each choice has three values: **weekday** (Monday to Friday), **weekend** (Saturday and Sunday), **all week**. The default for both is **all week**, which is today's behaviour.
- The choice sets which days **count toward age**. A task's days-old and a habit's missed-days only go up on counted days.
- Alerts are **not hidden** on days that do not count. The attention bar and the habit warnings still show; only the age stays where it was. Example: a task carried over on Friday with weekday counting is still 1 day old on Monday morning, not 3.
- The choices are synced settings, shown in Settings next to the existing aging thresholds.

### Non-goals

- No per-weekday custom picker (such as "Tuesday and Thursday"). The three values only.
- No change to when tasks roll over or carry forward.

### Builder's calls (marked as calls, not owner decisions)

- "Weekday" means Monday to Friday; Saturday belongs to "weekend". The owner wrote "monday to friday/saturday", so this reading is a guess that the owner can reverse.
- The settings are new fields on the synced settings object, so the settings merge fix in Part 1 must land first or together, otherwise one device's change can overwrite another's.

### More builder's calls (from the builder check; the owner can reverse any of them)

- **Age is computed, not stored.** `calculateTaskAge` (tasks) and `missedDays` (habits, `src/utils/habits.ts`) already work from dates. The new rule filters the days they count. No stored data changes, so the alert part has no sync-format impact.
- **Switching the setting recomputes ages immediately**, for existing tasks and habits too, because age is computed.
- **A day is the device's local calendar day**, as everywhere else in the app.
- **Age = the number of counted days after the carry date, up to and including today.** This matches the Friday example above (carried Friday, weekday counting: 1 day old on Monday). A task carried on Saturday with weekday counting is 0 days old on Saturday and Sunday and 1 on Monday. (An earlier draft said Monday would be 0; that contradicted the Friday example and is corrected here.)
- **Habits:** only counted days can add to "missed days". An uncounted day neither adds a miss nor breaks a run of misses. Streaks are unchanged; they depend only on ticks.
- **Part 1 is bounded by the listed scenarios.** Release gate: every scenario in this document has a test, the randomized convergence test passes on fixed seeds, and nothing found by the audit is left unfixed or unlisted. If the audit finds a large problem, Part 2 may ship first on its own (it needs only the settings merge fix).
- **Convergence oracle:** the test needs explicit resolution rules. An edit counts as surviving if its value is in the final state, or in a conflict copy or conflict note that the user is shown. A value overwritten by a conflicting edit to the same field is a legitimate overwrite and is reported as a conflict, not a loss. Deletes never beat edits, with one existing exception kept on purpose: removing a habit beats an edit of that habit (reported as a conflict).
- **Clock skew:** client-side protection is preferred. A small server change (stamping receive time) is allowed if the client alone cannot do it.
- **Pictures over 1.5 MB:** the insert is refused with a visible message and the note text gets no dangling reference. **Deleting a note** does not delete its picture files in this cycle (they may be shared, or needed for undo and conflict copies); only a test that nothing breaks is required.

## Constraints

- Follow `CLAUDE.md` and the repository invariants: markdown comment format, rollover idempotency in `src/utils/lifecycleEngine.ts`, stone palette tokens, types from `src/types/daymark.ts`, `max-w-[1800px]` desktop width.
- Heavy suites run one at a time (`--maxWorkers=2` for vitest).
- **Owner decision: old versions must keep syncing without data loss.** A device on 1.9.1 or earlier must sync correctly with updated devices in both directions. Any new synced field is optional, is ignored harmlessly by an old device, and must not be stripped or reset when an old device pushes its copy back (an old device re-syncing must not erase what an updated device wrote). Missing alert-day settings mean **all week**. A test must sync an old-format device against an updated one.
- Commits are authored as `dngioidev`. Release, push and deploy only on the owner's request.

## Left to the builder

- Exact merge rules for each field, as long as they are deterministic and lose no edit that should survive.
- Clock-skew protection design.
- How the randomized convergence test generates and replays edits (seeded, so a failure can be reproduced).
- Where in Settings the two new choices sit and their labels.
- Release number: either a patch or a minor bump, to be decided at release time.
