// Painted token art (client/public/tokens/<id>.jpg), listed in tokens/index.json. Characters
// without a painting yet keep the lettered disc.
import { useSyncExternalStore } from 'react';

let have = new Set<string>();
const listeners = new Set<() => void>();
let loaded = false;
function load() {
  if (loaded || typeof fetch === 'undefined') return;
  loaded = true;
  fetch('/tokens/index.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : [])).then((ids: unknown) => {
    if (Array.isArray(ids)) { have = new Set(ids.filter((x): x is string => typeof x === 'string')); listeners.forEach(l => l()); }
  }).catch(() => { /* no art yet */ });
}
export function useTokenArt(): Set<string> {
  load();
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => have);
}
export const tokenUrl = (id: string) => `/tokens/${id}.jpg`;
