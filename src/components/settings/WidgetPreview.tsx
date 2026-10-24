import React from 'react';
import type { WidgetStyle } from '../../types/daymark';
import { parseHex } from '../../utils/color';
import { resolveWidgetColors, WidgetAppColors } from '../../utils/widgetStyle';

/** HTML approximation: Android controls the final size and launcher backdrop. */
export function WidgetPreview({ style, app, kind = 'tasks' }: { style: WidgetStyle; app: WidgetAppColors | null; kind?: 'tasks' | 'habits' }) {
  const c = resolveWidgetColors(style, app);
  const fontFamily = { sans: 'sans-serif', serif: 'serif', mono: 'monospace' }[style.font];
  const textSize = { s: 11, m: 13, l: 15, xl: 17 }[style.size];
  const sizeOffset = textSize - 13;
  const accentText = resolveWidgetColors({ ...style, mode: 'custom', background: c.accent, text: 'auto' }, null).text;
  const tasks = [
    { title: 'Plan the week', section: 'Work', done: false, age: '3d' },
    { title: 'Read a chapter', section: 'Personal', done: false, age: '' },
    { title: 'Send the invoice', section: 'Work', done: true, age: '' },
  ].filter((task) => style.show.done || !task.done);
  const habits = [
    { title: 'Drink water', done: true, streak: '3 days' },
    { title: 'Read a chapter', done: false, streak: '2 days' },
    { title: 'Stretch', done: false, streak: '' },
  ];
  return <div role="img" aria-label="Widget preview" className="w-full max-w-sm p-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800">
    <div style={{ fontFamily, color: c.text, backgroundColor: `rgb(${parseHex(c.bg)!.join(' ')} / ${c.bgAlpha})`, borderRadius: { square: 4, round: 16, extra: 28 }[style.corners], padding: 12 }}>
      <div className="flex items-center gap-2">
        <span style={{ backgroundColor: c.accent === '#f59e0b' ? '#d97706' : c.accent, width: 8, height: 8, borderRadius: 2 }} />
        <strong style={{ fontSize: 14 + sizeOffset }}>{kind === 'habits' ? 'Habits' : 'Today'}</strong>
        <span style={{ color: c.muted, fontSize: 12 + sizeOffset }} className="flex-1">2 left · 1 done</span>
        {kind === 'tasks' && style.show.quickAdd && <span aria-label="New task" style={{ backgroundColor: c.accent, color: accentText, borderRadius: 18, width: 36, height: 36, fontSize: 22 + sizeOffset, textAlign: 'center', lineHeight: '36px' }}>+</span>}
      </div>
      <div style={{ marginTop: 6, fontSize: textSize }}>
        {kind === 'habits' ? habits.map((habit) => <div key={habit.title} className="flex items-center gap-2" style={{ height: style.density === 'compact' ? 24 : 30 }}>
          <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 5, backgroundColor: habit.done ? c.accent : c.muted, color: habit.done ? accentText : c.bg, textAlign: 'center' }}>{habit.done ? '✓' : ''}</span>
          <span className="flex-1 truncate">{habit.title}</span>
          {style.show.streaks && habit.streak && <span style={{ color: c.muted, fontSize: 12 + sizeOffset }}>{habit.streak}</span>}
        </div>) : tasks.map((task, index) => <React.Fragment key={task.title}>
          {style.show.sections && tasks[index - 1]?.section !== task.section && <div className="flex items-center" style={{ color: c.muted, fontSize: 12 + sizeOffset, height: textSize + 5 }}>{task.section}</div>}
          <div className="flex items-center gap-2" style={{ height: style.density === 'compact' ? 24 : 30 }}>
            <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 5, backgroundColor: task.done ? '#16a34a' : '#44403c' }} />
            <span className="flex-1 truncate" style={{ color: task.done ? c.muted : c.text }}>{task.title}</span>
            {style.show.age && task.age && <span style={{ color: c.accent, fontSize: 12 + sizeOffset }}>{task.age}</span>}
          </div>
        </React.Fragment>)}
      </div>
    </div>
  </div>;
}
