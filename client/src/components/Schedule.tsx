// Scheduled games: a live countdown and an "add to calendar" file.
import { useEffect, useState } from 'react';
import { tr } from '../i18n';

export function untilText(at: number, now = Date.now()) {
  const s = Math.round((at - now) / 1000);
  if (s <= 0) return s > -3 * 3600 ? 'starting now' : 'started';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `in ${d} d ${h} h`;
  if (h) return `in ${h} h ${String(m).padStart(2, '0')} min`;
  if (m >= 10) return `in ${m} min`;
  return `in ${m}:${String(s % 60).padStart(2, '0')}`;
}

export function Countdown({ at }: { at: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  return <span className="countdown" title={new Date(at).toLocaleString()}>🕰 {new Date(at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · <b>{untilText(at)}</b></span>;
}

/** Download an .ics file so the game appears in the player's own calendar. */
export function downloadIcs(name: string, at: number, link: string) {
  const fmt = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/[\;,]/g, m => `\\${m}`).replace(/\n/g, '\\n');
  const ics = [
    tr("BEGIN:VCALENDAR"), tr("VERSION:2.0"), tr("PRODID:-//Clocktower Nights//EN"), tr("BEGIN:VEVENT"),
    tr("UID:{at}-{x}@clocktower-nights", { at, x: Math.random().toString(36).slice(2) }), tr("DTSTAMP:{x}", { x: fmt(Date.now()) }),
    tr("DTSTART:{x}", { x: fmt(at) }), tr("DTEND:{x}", { x: fmt(at + 3 * 3600_000) }),
    tr("SUMMARY:{x}", { x: esc(`Blood on the Clocktower: ${name}`) }), tr("DESCRIPTION:{x}", { x: esc(`Join the game: ${link}`) }), tr("URL:{link}", { link }),
    tr("BEGIN:VALARM"), tr("TRIGGER:-PT15M"), tr("ACTION:DISPLAY"), tr("DESCRIPTION:{x} starts in 15 minutes", { x: esc(name) }), tr("END:VALARM"),
    tr("END:VEVENT"), tr("END:VCALENDAR"),
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = `${name.replace(/[^\w-]+/g, '_') || 'game'}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** <input type="datetime-local"> value ↔ timestamp (local time). */
export const toLocalInput = (t: number | null) => {
  if (!t) return '';
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};
export const fromLocalInput = (v: string) => (v ? new Date(v).getTime() : null);
