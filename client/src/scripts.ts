// "My scripts": custom character lists saved in this browser, exported in the community
// script-tool JSON format, and shared as links.
import { parseScript } from '../../shared/characters';

export interface SavedScript { id: string; name: string; author: string; ids: string[]; updated: number }
const KEY = 'botc:scripts';

export function loadScripts(): SavedScript[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveScript(s: SavedScript) {
  const list = loadScripts().filter(x => x.id !== s.id);
  list.unshift({ ...s, updated: Date.now() });
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50))); } catch { /* full */ }
}
export function deleteScript(id: string) {
  try { localStorage.setItem(KEY, JSON.stringify(loadScripts().filter(x => x.id !== id))); } catch { /* ignore */ }
}

/** The JSON format used by the community script tool: a _meta entry, then character ids. */
export function toScriptJson(s: { name: string; author: string; ids: string[] }) {
  return JSON.stringify([{ id: '_meta', name: s.name || 'Untitled script', author: s.author || '' }, ...s.ids]);
}

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function shareLink(s: { name: string; author: string; ids: string[] }) {
  return `${location.origin}/?script=${b64url(toScriptJson(s))}`;
}
/** Read a script from a share link's ?script= value. */
export function fromShareParam(v: string): { name: string; author: string; ids: string[] } | null {
  try {
    const json = unb64url(v);
    const { ids, name } = parseScript(json);
    const meta = (JSON.parse(json) as unknown[]).find((x): x is { id: string; author?: string } => !!x && typeof x === 'object' && (x as { id?: string }).id === '_meta');
    return ids.length ? { name: name ?? 'Shared script', author: String(meta?.author ?? ''), ids } : null;
  } catch { return null; }
}
export const newScriptId = () => Math.random().toString(36).slice(2, 10);
