import { io } from 'socket.io-client';
import { useSyncExternalStore } from 'react';
import type { GameView, InfoCard, Announcement } from '../../shared/types';
import { dawnBell, deathToll, narrate } from './sound';
import { registerHomebrew } from '../../shared/characters';
import { tr, bindLanguage } from './i18n';

export const socket = io(import.meta.env.VITE_SERVER_URL ?? '/', { transports: ['websocket', 'polling'] });

export interface Alert { id: number; text: string; kind: string }
export interface ChatMsg { id: string; fromId: string; name: string; text: string; ts: number; room: string }
export interface Session { gameId: string; code: string; token: string; id: string }

interface Store {
  view: GameView | null;
  alerts: Alert[];
  chat: ChatMsg[];
  infoPopup: InfoCard | null;
  transition: 'night' | 'day' | 'ended' | null;
  deathFlash: string | null;
  connected: boolean;
  kicked: string | null;
  session: Session | null;
}

let store: Store = { view: null, alerts: [], chat: [], infoPopup: null, transition: null, deathFlash: null, connected: false, kicked: null, session: null };
const listeners = new Set<() => void>();
export function set(patch: Partial<Store>) { store = { ...store, ...patch }; listeners.forEach(l => l()); }
export const getStore = () => store;
export function useStore<T>(sel: (s: Store) => T): T {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => sel(store));
}

let alertId = 0;
export function pushAlert(text: string, kind = 'info') {
  const a = { id: ++alertId, text, kind };
  set({ alerts: [...store.alerts.slice(-4), a] });
  setTimeout(() => set({ alerts: store.alerts.filter(x => x.id !== a.id) }), kind === 'error' ? 4000 : 5000);
}

// ------------------------------------------------------------ sessions (seat tokens) in localStorage
const KEY = 'botc:sessions';
function loadSessions(): Record<string, Session> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}
export function saveSession(s: Session) {
  try { const all = loadSessions(); all[s.code] = s; localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ }
}
export function sessionForCode(code: string): Session | undefined { return loadSessions()[code.toUpperCase()]; }
export function forgetSession(code: string) {
  try { const all = loadSessions(); delete all[code]; localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

// ------------------------------------------------------------ RPC helpers
type Res = { ok: boolean; error?: string; [k: string]: any };
export function rpc(event: string, data: unknown = {}): Promise<Res> {
  return new Promise(resolve => socket.timeout(8000).emit(event, data, (err: unknown, res: Res) => {
    if (err) resolve({ ok: false, error: tr("The server did not respond.") });
    else resolve(res);
  }));
}
export async function act(type: string, data: Record<string, unknown> = {}): Promise<Res> {
  const res = await rpc('action', { type, ...data });
  if (!res.ok && res.error) pushAlert(res.error, 'error');
  return res;
}

export async function rejoin(s: Session) {
  const res = await rpc('game:rejoin', { gameId: s.gameId, token: s.token });
  if (res.ok) set({ session: s, kicked: null });
  else { forgetSession(s.code); }
  return res;
}

// ------------------------------------------------------------ server events
bindLanguage(() => store.view?.language ?? 'en');
socket.on('connect', () => {
  set({ connected: true });
  if (store.session) void rejoin(store.session); // automatic reconnection into the same seat
});
socket.on('disconnect', () => set({ connected: false }));
// the Storyteller role was handed over: this connection is now someone else in the same game
// the Storyteller started a rematch: this connection now belongs to the new game
socket.on('rematch', (s: Session) => {
  saveSession(s);
  set({ session: s, chat: [] });
  history.replaceState(null, '', `/g/${s.code}`);
  pushAlert(tr('Rematch! Same group, same settings: a new game has started.'), 'info');
});
socket.on('rebound', ({ id }: { id: string }) => {
  if (!store.session) return;
  const s = { ...store.session, id };
  saveSession(s);
  set({ session: s });
  pushAlert(id === 'st' ? 'You are now the Storyteller.' : id.startsWith('co:') ? 'You handed over the role and are now a co-Storyteller.' : 'You handed over the role and now have a seat.', 'info');
});
socket.on('state', (view: GameView) => { registerHomebrew(view.homebrew); set({ view }); });
socket.on('alert', (a: { text: string; kind: string }) => pushAlert(a.text, a.kind));
socket.on('announcement', (_a: Announcement) => { /* already part of state */ });
socket.on('chat', (m: ChatMsg) => set({ chat: [...store.chat.slice(-100), m] }));
socket.on('infoCard', (card: InfoCard) => set({ infoPopup: card }));
socket.on('transition', ({ to }: { to: 'night' | 'day' | 'ended' }) => {
  if (to === 'day') dawnBell();
  set({ transition: to, chat: to === 'night' ? [] : store.chat });
  // the narrator speaks once the new state has arrived (day and night numbers)
  setTimeout(() => {
    const v = store.view;
    if (!v) return;
    if (to === 'night') narrate(tr('Night {n} falls over the town. Close your eyes… the Storyteller will wake you if you are needed.', { n: v.night }));
    else if (to === 'day') narrate(tr('Dawn breaks on day {n}. The town gathers in the square.', { n: v.day }));
    else narrate(v.winner === 'evil' ? tr('The game is over. Evil wins.') : v.winner === 'good' ? tr('The game is over. Good wins.') : tr('The game is over.'));
  }, 1400);
  setTimeout(() => set({ transition: null }), 2600);
});
socket.on('death', ({ playerId }: { playerId: string }) => {
  deathToll();
  set({ deathFlash: playerId });
  setTimeout(() => set({ deathFlash: null }), 2200);
});
socket.on('execution', ({ playerId }: { playerId: string }) => {
  set({ deathFlash: playerId });
  setTimeout(() => set({ deathFlash: null }), 2200);
});
socket.on('kicked', ({ reason }: { reason: string }) => {
  if (store.session) forgetSession(store.session.code);
  set({ kicked: reason, session: null, view: null });
});
