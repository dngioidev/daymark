// Test-only seeded operations and an evidence-based edit-survival oracle.
import type { TaskItem } from '../../types/daymark';
import { addBacklogItem, editBacklogItem, pickBacklogItem, visibleBacklog } from '../../utils/backlog';
import { createFolder, moveNote, renameFolder } from '../../utils/noteFolders';
import { canonicalJson, sameValue } from '../merge';
import { fromEntities, toEntities, type VaultData } from '../syncClient';
import type { Device } from './devices';

export function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

type Field = { entity: string; field: string; value: unknown };
export interface LedgerEdit extends Field {
  order: number;
  device: string;
  /** Actual serial rig submission order, independent of the device timestamp. */
  submittedAt?: number;
  successors: number[];
  /** Habit edits: whether the editing device already saw the habit removed. */
  sawRemoved?: boolean;
  /** Note edits: the whole note content on the editing device after the edit (identifies its conflict copy). */
  noteContent?: string;
  /** Restores the value this device last synced, so the merge sees no change from it. */
  restoresSyncedValue?: boolean;
}
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whole-token match: 'Text A-5' must not be found inside 'Text A-55'. */
const hasToken = (text: string, token: string) =>
  new RegExp(`(?<![A-Za-z0-9-])${escapeRegex(token)}(?![A-Za-z0-9-])`).test(text);
const keyOf = (field: Field) => `${field.entity}\0${field.field}`;

/** User data only; timestamps/order are merge metadata, not user edits. */
function fields(vault: VaultData): Map<string, Field> {
  const result = new Map<string, Field>();
  const put = (entity: string, field: string, value: unknown) => {
    const entry = { entity, field, value };
    result.set(keyOf(entry), entry);
  };
  const object = (entity: string, value: object) => {
    for (const [field, v] of Object.entries(value)) {
      if (['id', 'order', 'updatedAt', 'createdAt', 'historyLog'].includes(field)) continue;
      put(entity, field, v);
    }
    if ('historyLog' in value) {
      for (const event of (value.historyLog ?? []) as TaskItem['historyLog']) put(entity, `history:${event.id}`, event);
    }
  };
  for (const doc of vault.docs) {
    for (const heading of doc.headings) {
      // An empty heading text is the default, not a user edit.
      if (heading.notesContent) put(`heading:${doc.date}:${heading.name}`, 'notesContent', heading.notesContent);
      for (const task of heading.items) { put(`task:${task.id}`, '$exists', true); object(`task:${task.id}`, task); }
    }
  }
  for (const note of vault.notes) { put(`note:${note.id}`, '$exists', true); object(`note:${note.id}`, note); }
  const settings = (value: object, path = '') => {
    for (const [field, v] of Object.entries(value)) {
      if (['syncConfig', 'simulatedToday'].includes(field)) continue;
      const next = path ? `${path}.${field}` : field;
      if (v && typeof v === 'object' && !Array.isArray(v)) settings(v, next);
      else put('settings', next, v);
    }
  };
  settings(vault.settings);
  for (const habit of vault.habits.habits) object(`habit:${habit.id}`, habit);
  for (const day of vault.habits.days) for (const [id, tick] of Object.entries(day.ticks)) put(`tick:${day.date}:${id}`, 'done', tick.done);
  for (const item of vault.backlog.items) object(`backlog:${item.id}`, item);
  for (const folder of vault.notemeta.folders) put(`folder:${folder.path}`, '$exists', !folder.removed);
  return result;
}

/** Compare all persisted data, normalizing collection order and legacy-only omissions. */
export function normalizeVault(vault: VaultData, opts: { legacy?: boolean } = {}): string {
  const copy = structuredClone(vault);
  // A legacy device never holds alertDays (no opinion); modern devices are compared in full.
  if (opts.legacy) delete copy.settings.alertDays;
  copy.settings.simulatedToday = '';
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
    return value;
  };
  return canonicalJson(normalize(copy));
}

export class EditLedger {
  readonly edits: LedgerEdit[] = [];
  readonly log: string[] = [];
  private clock = 0;
  private snapshots = new Map<string, Map<string, Field>>();
  private server = new Map<string, unknown>();
  private deletions = new Map<number, Map<string, Field>>();

  edit(device: Device, label: string, change: (vault: VaultData) => void): void {
    const before = fields(device.vault);
    const next = structuredClone(device.vault);
    change(next);
    device.edit(() => next);
    const after = fields(next);
    const changes: LedgerEdit[] = [];
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const previous = before.get(key);
      const field = after.get(key) ?? { ...previous!, value: previous?.field === '$exists' ? false : undefined };
      if (sameValue(previous?.value, field.value)) continue;
      // Entity deletion is one operation, not a separate clear of every field.
      if (!after.has(key) && !after.has(`${field.entity}\0$exists`) && /^(task|note):/.test(field.entity) && field.field !== '$exists') continue;
      const edit: LedgerEdit = { ...field, order: ++this.clock, device: device.name, successors: [] };
      if ((field.field === '$exists' && field.value === false) || (field.field === 'removedOn' && field.value)) this.deletions.set(edit.order, before);
      if (field.entity.startsWith('habit:')) edit.sawRemoved = Boolean(before.get(`${field.entity}\0removedOn`)?.value);
      if (field.entity.startsWith('note:')) edit.noteContent = next.notes.find(n => `note:${n.id}` === field.entity)?.content;
      // A deliberate edit overwrites exactly the value this device actually saw.
      for (const old of this.edits) {
        const observed = before.get(keyOf(old));
        const deletesEntity = edit.field === '$exists' && edit.value === false && old.entity === edit.entity;
        if ((keyOf(old) === key || deletesEntity) && observed && sameValue(observed.value, old.value)) old.successors.push(edit.order);
      }
      this.edits.push(edit);
      changes.push(edit);
    }
    this.log.push(`${device.name} ${label}: ${canonicalJson(changes.map(({ entity, field, value, order }) => ({ order, entity, field, value })))}`);
  }

  async sync(device: Device) {
    const submitted = ++this.clock;
    const local = fields(device.vault);
    const oldServer = fields(fromEntities(this.server, device.vault.settings));
    const outcome = await device.sync();
    const synced = this.snapshots.get(device.name);
    for (const edit of this.edits) if (edit.device === device.name && edit.submittedAt === undefined && sameValue(local.get(keyOf(edit))?.value, edit.value)) {
      edit.submittedAt = submitted;
      // An edit that restores the value this device last synced is no change the server can see (a toggle twice).
      if (synced && sameValue(synced.get(keyOf(edit))?.value, edit.value)) edit.restoresSyncedValue = true;
    }
    this.snapshots.set(device.name, fields(device.vault));
    for (const [key, value] of outcome.serverValues) {
      if (value === null) { this.server.delete(key); continue; }
      // A legacy device only ever sees settings without alertDays; that is "no opinion", not a removal on the server.
      const previous = this.server.get(key) as { alertDays?: unknown } | undefined;
      const incoming = value as { alertDays?: unknown };
      if (key === 'settings' && previous?.alertDays !== undefined && incoming && typeof incoming === 'object' && !('alertDays' in incoming)) {
        this.server.set(key, { ...incoming, alertDays: previous.alertDays });
      } else this.server.set(key, value);
    }
    const resolved = fields(fromEntities(this.server, device.vault.settings));
    this.log.push(`${device.name} sync #${submitted} pushed=${outcome.pushed} conflicts=${canonicalJson(outcome.conflicts)}`);
    for (const old of this.edits) {
      const key = keyOf(old);
      const winner = resolved.get(key)?.value;
      if (sameValue(winner, old.value)) continue;
      if (!sameValue(local.get(key)?.value, old.value) && !sameValue(oldServer.get(key)?.value, old.value)) continue;
      // A conflict must refer to this entity/field, not just some other push in the batch.
      const reported = outcome.conflicts.some(message => {
        if (old.entity === 'settings') return message.includes(`field "${old.field}"`);
        // Task and backlog messages name only the entity, so the field itself must show a
        // real disagreement: this device and the server held different values for it.
        if ((old.entity.startsWith('task:') || old.entity.startsWith('backlog:')) &&
            sameValue(local.get(key)?.value, oldServer.get(key)?.value)) return false;
        const title = local.get(`${old.entity}\0title`)?.value ?? oldServer.get(`${old.entity}\0title`)?.value;
        if (old.entity.startsWith('task:')) return message.includes(`task "${title}"`);
        if (old.entity.startsWith('backlog:')) return message.includes(`Backlog item "${title}"`);
        if (old.entity.startsWith('habit:')) {
          const name = local.get(`${old.entity}\0name`)?.value ?? oldServer.get(`${old.entity}\0name`)?.value;
          return message.includes(`Habit "${name}"`);
        }
        return false; // Notes preserve text in visible conflict copies instead.
      });
      if (!reported) continue;
      for (const successor of this.edits) {
        if (keyOf(successor) !== key || successor.device === old.device || successor.value === undefined || !sameValue(successor.value, winner)) continue;
        // A later submitted incoming edit or a later-created timestamp winner.
        // Both are rig event orders, never wall-clock comparisons.
        if (successor.order > old.order || (successor.submittedAt ?? 0) > (old.submittedAt ?? submitted)) old.successors.push(successor.order);
      }
    }
    return outcome;
  }

  losses(vault: VaultData): Omit<LedgerEdit, 'successors'>[] {
    const final = fields(vault);
    const byOrder = new Map(this.edits.map(edit => [edit.order, edit]));
    const survives = (edit: LedgerEdit, visited = new Set<number>()): boolean => {
      if (visited.has(edit.order)) return false;
      const actual = final.get(keyOf(edit));
      if (actual && sameValue(actual.value, edit.value)) return true;
      if (edit.restoresSyncedValue) return true;
      if (edit.field === '$exists' && edit.value === false && !actual) return true;
      if (edit.field === '$exists' && edit.value === false && actual?.value === true && /^(task|note):/.test(edit.entity)) {
        // Deletes may legitimately lose to an edit the deleting device never saw.
        // An unchanged resurrection is still a failure, as is a lost edit.
        const observed = this.deletions.get(edit.order)!;
        if (this.edits.some(other => other.entity === edit.entity && other.field !== '$exists' &&
          other.device !== edit.device && !sameValue(observed.get(keyOf(other))?.value, other.value) &&
          sameValue(final.get(keyOf(other))?.value, other.value))) return true;
      }
      if (edit.value === undefined && !actual) return true;
      if (edit.entity.startsWith('heading:') && edit.field === 'notesContent' && typeof actual?.value === 'string' &&
        typeof edit.value === 'string' && edit.value !== '' && hasToken(actual.value, edit.value)) return true; // both versions kept
      if (edit.entity.startsWith('note:') && ['content', 'folder', 'title'].includes(edit.field)) {
        const id = edit.entity.slice(5);
        const originalTitle = this.edits.find(e => e.entity === edit.entity && e.field === 'title')?.value;
        const copyTitle = `${originalTitle} (conflict copy)`;
        if (vault.notes.some(note => {
          if (edit.field === 'content') return (note.id === id || note.title === copyTitle) && hasToken(note.content, String(edit.value));
          if (note.id === id) return sameValue(note[edit.field as 'folder' | 'title'], edit.value);
          // A copy only vouches for the edit it was made from: it must carry that device's note text.
          return edit.field === 'folder' && note.title === copyTitle && edit.noteContent !== undefined &&
            note.content === edit.noteContent && note.folder === edit.value;
        })) return true;
      }
      if (edit.entity.startsWith('habit:') && edit.field !== 'removedOn' && !edit.sawRemoved && final.get(`${edit.entity}\0removedOn`)?.value) {
        // Only an edit the remover had not seen can lose to the removal.
        const unseen = this.edits.some(removal => removal.entity === edit.entity && removal.field === 'removedOn' && removal.value &&
          removal.device !== edit.device && !sameValue(this.deletions.get(removal.order)?.get(keyOf(edit))?.value, edit.value));
        if (unseen) return true;
      }
      const nextVisited = new Set(visited).add(edit.order);
      return edit.successors.some(order => survives(byOrder.get(order)!, nextVisited));
    };
    return this.edits.filter(edit => !survives(edit)).map(({ successors: _successors, ...edit }) => edit);
  }
}

export function randomEdit(rng: () => number, device: Device, ledger: EditLedger): void {
  const choose = <T>(values: T[]): T | undefined => values[Math.floor(rng() * values.length)];
  const operation = Math.floor(rng() * 24);
  const serial = ledger.log.length + 1;
  const token = `${device.name}-${serial}`;
  const date = '2026-10-24';
  // Fixed, increasing operation timestamps: replay does not depend on machine speed.
  const stamp = new Date(Date.UTC(2026, 9, 24, 10, 0, serial)).toISOString();
  ledger.edit(device, `op=${operation} ${token}`, v => {
    const doc = v.docs[0];
    const task = choose(doc.headings.flatMap(h => h.items));
    const note = choose(v.notes.filter(n => !n.title.endsWith('(conflict copy)')));
    const habit = choose(v.habits.habits.filter(h => !h.removedOn));
    const item = choose(visibleBacklog(v.backlog));
    const folder = choose(v.notemeta.folders.filter(f => !f.removed));
    const addTask = () => {
      let heading = doc.headings.find(h => h.name === 'Work');
      if (!heading) { heading = { name: 'Work', items: [], notesContent: '' }; doc.headings.push(heading); }
      heading.items.push({ id: `task-${token}`, title: `Task ${token}`, status: 'not-started', createdDate: date,
        originalNoteDate: date, heading: 'Work', order: heading.items.length + 1, historyLog: [] });
    };
    const addNote = () => v.notes.push({ id: `note-${token}`, title: `Note ${token}`, content: `Text ${token}`, folder: 'Work', tags: [], createdAt: stamp, updatedAt: stamp });
    switch (operation) {
      case 0: addTask(); break;
      case 1: if (task) task.title = `Title ${token}`; else addTask(); break;
      case 2:
        if (task) { for (const h of doc.headings) h.items = h.items.filter(t => t.id !== task.id); doc.removedTaskIds = [...new Set([...(doc.removedTaskIds ?? []), task.id])]; }
        else addTask();
        break;
      case 3:
        if (task) {
          task.status = task.status === 'done' ? 'not-started' : 'done';
          if (task.status === 'done') task.completedDate = date; else delete task.completedDate;
          task.historyLog.push({ id: `history-${token}`, date, timestamp: stamp, action: 'status_changed', details: token });
        } else addTask();
        break;
      case 4: if (note) { note.content = `Text ${token}`; note.updatedAt = stamp; } else addNote(); break;
      case 5: if (note) v.notes = moveNote(v.notes, note.id, folder?.path ?? `Folder-${token}`, stamp); else addNote(); break;
      case 6: v.notemeta = createFolder(v.notemeta, `Folder-${token}`, stamp); break;
      case 7:
        if (folder) { const renamed = renameFolder(v.notes, v.notemeta, folder.path, `Renamed-${token}`, stamp)!; v.notes = renamed.notes; v.notemeta = renamed.meta; }
        else v.notemeta = createFolder(v.notemeta, `Folder-${token}`, stamp);
        break;
      case 8: v.settings.agingThresholds.attentionDays = 3 + serial; break;
      case 9: v.settings.agingThresholds.criticalDays = 7 + serial; break;
      case 10: v.habits.habits.push({ id: `habit-${token}`, name: `Habit ${token}`, order: v.habits.habits.length + 1, addedOn: date, warnAfterDays: 3, updatedAt: stamp }); break;
      case 11: if (habit) { habit.name = `Habit edit ${token}`; habit.updatedAt = stamp; } break;
      case 12: if (habit) { habit.removedOn = date; habit.updatedAt = stamp; } break;
      case 13:
        if (habit) { const day = v.habits.days.find(d => d.date === date)!; day.ticks[habit.id] = { done: !day.ticks[habit.id]?.done, at: stamp }; }
        break;
      case 14: v.backlog = addBacklogItem(v.backlog, { title: `Backlog ${token}`, category: 'Work' }, stamp, `backlog-${token}`); break;
      case 15: if (item) v.backlog = editBacklogItem(v.backlog, item.id, { title: `Backlog edit ${token}` }, stamp); else v.backlog = addBacklogItem(v.backlog, { title: `Backlog ${token}` }, stamp, `backlog-${token}`); break;
      case 16:
        if (item) { const picked = pickBacklogItem(v.docs, v.backlog, item.id, date, v.settings.defaultHeadings, stamp); if (picked) { v.docs = picked.docs; v.backlog = picked.data; } }
        else v.backlog = addBacklogItem(v.backlog, { title: `Backlog ${token}` }, stamp, `backlog-${token}`);
        break;
      case 17: if (note) v.notes = v.notes.filter(n => n.id !== note.id); else addNote(); break;
      case 18: {
        let heading = doc.headings.find(h => h.name === 'Work');
        if (!heading) { heading = { name: 'Work', items: [], notesContent: '' }; doc.headings.push(heading); }
        heading.notesContent = `Journal ${token}`;
        break;
      }
      case 19:
        if (task) {
          const target = task.heading === 'Work' ? 'Home' : 'Work';
          for (const h of doc.headings) h.items = h.items.filter(t => t.id !== task.id);
          let heading = doc.headings.find(h => h.name === target);
          if (!heading) { heading = { name: target, items: [], notesContent: '' }; doc.headings.push(heading); }
          task.heading = target;
          heading.items.push(task);
        } else addTask();
        break;
      case 20: v.settings.agingThresholds.enabled = !v.settings.agingThresholds.enabled; break;
      case 21: v.settings.timeZone = ['America/Los_Angeles', 'Europe/Paris', 'Asia/Tokyo'][serial % 3]; break;
      case 22: case 23: {
        // A legacy device cannot see or write alertDays.
        if (device.name === 'legacy') { v.settings.agingThresholds.criticalDays = 7 + serial; break; }
        const days = ['all', 'weekdays', 'weekend'] as const;
        const current = v.settings.alertDays ?? {};
        const key = operation === 22 ? 'tasks' : 'habits';
        // Like the Settings UI, write only the changed key.
        v.settings.alertDays = { ...current, [key]: days[(days.indexOf(current[key] ?? 'all') + 1 + (serial % 2)) % 3] };
        break;
      }
    }
    if (operation < 4) doc.updatedAt = stamp;
  });
}
