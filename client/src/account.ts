// Optional account: keeps name, figure, game history and saved scripts on the server so they
// follow the player to any device. Everything also works signed out (stored in this browser).
import { useSyncExternalStore } from 'react';
import { loadHistory, type HistoryEntry } from './history';
import { loadScripts, type SavedScript } from './scripts';
import { onLocalChange } from './syncBus';

export interface AccountInfo { id: string; username: string | null; email: string | null; google: boolean; displayName: string; avatar: unknown; history: HistoryEntry[]; scripts: SavedScript[]; hideFromFriends?: boolean; isAdmin?: boolean }
export interface FriendRow { id: string; name: string; you: boolean; together: number; games: number; wins: number; evilWins: number; mvps: number; storytold: number }
interface State { token: string | null; account: AccountInfo | null; config: { google: boolean; email: boolean } }

const TKEY = 'botc:accountToken';
let state: State = { token: (() => { try { return localStorage.getItem(TKEY); } catch { return null; } })(), account: null, config: { google: false, email: false } };
const listeners = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach(l => l()); };
export const useAccount = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);

async function api(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ ok: false, error: 'Server error.' }));
  return { status: r.status, ...j } as { status: number; ok: boolean; error?: string; [k: string]: any };
}

// ---- merging: nothing is ever lost when signing in on a new device
function mergeBy<T>(a: T[], b: T[], key: (x: T) => string, newer: (x: T) => number): T[] {
  const m = new Map<string, T>();
  for (const x of [...a, ...b]) { const k = key(x), o = m.get(k); if (!o || newer(x) >= newer(o)) m.set(k, x); }
  return [...m.values()].sort((x, y) => newer(y) - newer(x));
}
function writeLocal(acc: AccountInfo) {
  try {
    localStorage.setItem('botc:history', JSON.stringify(acc.history));
    localStorage.setItem('botc:scripts', JSON.stringify(acc.scripts));
    if (acc.displayName && !localStorage.getItem('botc:name')) localStorage.setItem('botc:name', acc.displayName);
    if (acc.avatar) localStorage.setItem('botc:avatar', JSON.stringify(acc.avatar));
  } catch { /* ignore */ }
}
/** Me and every account that finished a game with me. */
export async function fetchLeaderboard(): Promise<{ ok: boolean; rows?: FriendRow[]; error?: string }> {
  if (!state.token) return { ok: false, error: 'Sign in to see your friends\' leaderboard.' };
  return api('/api/leaderboard');
}
export async function setHideFromFriends(hide: boolean) {
  const w = await api('/api/account', 'PUT', { hideFromFriends: hide });
  if (w.ok) set({ account: w.account });
}
let syncing = false;
/** Merge this browser's data with the account and save both ways. */
export async function syncNow() {
  if (!state.token || syncing) return;
  syncing = true;
  try {
    const r = await api('/api/account');
    if (r.status === 401) { signOutLocal(); return; }
    if (!r.ok) return;
    const server = r.account as AccountInfo;
    let avatar: unknown = null, name = '';
    try { avatar = JSON.parse(localStorage.getItem('botc:avatar') ?? 'null'); name = localStorage.getItem('botc:name') ?? ''; } catch { /* ignore */ }
    const merged = {
      displayName: name || server.displayName,
      avatar: avatar ?? server.avatar,
      history: mergeBy(server.history ?? [], loadHistory(), h => h.gameId, h => h.endedAt).slice(0, 200),
      scripts: mergeBy(server.scripts ?? [], loadScripts(), s => s.id, s => s.updated).slice(0, 50),
    };
    const w = await api('/api/account', 'PUT', merged);
    if (w.ok) { writeLocal(w.account); set({ account: w.account }); }
  } finally { syncing = false; }
}
let timer = 0;
onLocalChange(() => { if (state.token) { clearTimeout(timer); timer = window.setTimeout(() => void syncNow(), 1500); } });

function signedIn(token: string, account?: AccountInfo) {
  try { localStorage.setItem(TKEY, token); } catch { /* ignore */ }
  set({ token, account: account ?? null });
  void syncNow();
}
function signOutLocal() { try { localStorage.removeItem(TKEY); } catch { /* ignore */ } set({ token: null, account: null }); }

export async function register(username: string, password: string, displayName: string) {
  const r = await api('/api/auth/register', 'POST', { username, password, displayName });
  if (r.ok) signedIn(r.token, r.account);
  return r;
}
export async function login(username: string, password: string) {
  const r = await api('/api/auth/login', 'POST', { username, password });
  if (r.ok) signedIn(r.token, r.account);
  return r;
}
export async function emailLink(email: string) { return api('/api/auth/email', 'POST', { email }); }
export function googleLogin() { location.href = '/api/auth/google'; }
export async function signOut() { await api('/api/auth/logout', 'POST').catch(() => {}); signOutLocal(); }

/** On start: pick up a login from a Google/email redirect (?login=…), load the config, and sync. */
export async function initAccount(): Promise<string | null> {
  const q = new URLSearchParams(location.search);
  const t = q.get('login'), err = q.get('login_error');
  if (t || err) history.replaceState(null, '', location.pathname);
  try { const c = await (await fetch('/api/auth/config')).json(); set({ config: c }); } catch { /* offline */ }
  if (t && /^[\w-]{20,80}$/.test(t)) signedIn(t);
  else if (state.token) void syncNow();
  return err ? ({ expired: 'The sign-in took too long. Please try again.', google: 'Google sign-in did not work. Please try again.', link: 'That login link has expired or was already used.' } as Record<string, string>)[err] ?? 'Sign-in failed.' : null;
}
