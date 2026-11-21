// Private notes on other players ("claims Chef", "suspicious"…). Stored only in this browser,
// per game, and never sent to the server.
import { useSyncExternalStore } from 'react';

export interface PlayerNote { mark: '' | 'trust' | 'suspect' | 'unsure'; text: string }
export const MARKS: { id: PlayerNote['mark']; icon: string; label: string }[] = [
  { id: 'trust', icon: '🟢', label: 'Trust' },
  { id: 'suspect', icon: '🔴', label: 'Suspect' },
  { id: 'unsure', icon: '❓', label: 'Unsure' },
];
export const MARK_ICON: Record<string, string> = Object.fromEntries(MARKS.map(m => [m.id, m.icon]));

type Notes = Record<string, PlayerNote>;
const cache = new Map<string, Notes>();
const listeners = new Set<() => void>();
const key = (gameId: string) => `botc:pnotes:${gameId}`;

function load(gameId: string): Notes {
  let n = cache.get(gameId);
  if (!n) {
    try { n = JSON.parse(localStorage.getItem(key(gameId)) ?? '{}') as Notes; } catch { n = {}; }
    cache.set(gameId, n);
  }
  return n;
}

export function setPlayerNote(gameId: string, playerId: string, note: Partial<PlayerNote>) {
  const all = { ...load(gameId) };
  const next: PlayerNote = { ...{ mark: '' as const, text: '' }, ...all[playerId], ...note };
  next.text = next.text.slice(0, 80);
  if (!next.mark && !next.text.trim()) delete all[playerId]; else all[playerId] = next;
  cache.set(gameId, all);
  try { localStorage.setItem(key(gameId), JSON.stringify(all)); } catch { /* storage full or blocked */ }
  listeners.forEach(l => l());
}

export function usePlayerNotes(gameId: string): Notes {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => load(gameId));
}
