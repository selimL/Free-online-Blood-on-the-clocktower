// "Install the app": registers the service worker and remembers the browser's install offer.
import { useSyncExternalStore } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

export const isStandalone = () => typeof window !== 'undefined'
  && (matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
export const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* not available */ }); });
  }
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallEvent; notify(); });
  addEventListener('appinstalled', () => { deferred = null; notify(); });
}

/** 'prompt' = the browser can install it now; 'ios' = show Add-to-Home-Screen steps; 'manual' = other browsers; null = already installed. */
export function useInstall(): 'prompt' | 'ios' | 'manual' | null {
  useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => deferred);
  if (isStandalone()) return null;
  if (deferred) return 'prompt';
  return isIOS() ? 'ios' : 'manual';
}
export async function installNow() {
  if (!deferred) return false;
  await deferred.prompt();
  const r = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
  deferred = null; notify();
  return r.outcome === 'accepted';
}
