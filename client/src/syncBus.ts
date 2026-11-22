// Tiny event bus: local data changed (history, scripts, figure) → the account module syncs it.
const subs = new Set<() => void>();
export const onLocalChange = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
export const localChanged = () => subs.forEach(f => f());
