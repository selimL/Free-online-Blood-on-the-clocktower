// Gestures (emotes): tiny transient events from the server, kept for a few seconds so both
// the 2D seats and the 3D figures can show them. Nothing here is game state.
import { useSyncExternalStore } from 'react';
import { socket, act } from './net';
import { EMOTES, type EmoteEvent, type EmoteId } from '../../shared/types';

export const EMOTE_MS = 2600;
export const EMOTE_ICON: Record<string, string> = Object.fromEntries(EMOTES.map(e => [e.id, e.icon]));

let recent: Record<string, EmoteEvent> = {};
const listeners = new Set<() => void>();
const subs = new Set<(e: EmoteEvent) => void>();
const notify = () => listeners.forEach(l => l());

socket.on('emote', (e: EmoteEvent) => {
  const local = { ...e, ts: Date.now() }; // local clock, so expiry does not depend on clock skew
  recent = { ...recent, [e.id]: local };
  notify();
  subs.forEach(fn => fn(local));
  setTimeout(() => {
    if (recent[e.id] === local) { const next = { ...recent }; delete next[e.id]; recent = next; notify(); }
  }, EMOTE_MS);
});

/** Current gesture per person id (only while it is showing). */
export const useEmotes = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => recent);

/** For the 3D scenes: called once per incoming gesture. */
export function onEmote(fn: (e: EmoteEvent) => void) { subs.add(fn); return () => { subs.delete(fn); }; }

export function sendEmote(kind: EmoteId) { void act('emote', { kind }); }
