// Voice transcript: speech is turned into text in the speaker's own browser (Web Speech API,
// Chrome/Edge; the browser sends the audio to its speech service) and only while the player has
// agreed, the house rule is on, and their microphone is actually live. Lines go to the server,
// which keeps them for the Storyteller only.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { socket } from './net';

// The language the speaker talks in: English by default, Turkish as the alternative.
export type SpeechLang = 'en-US' | 'tr-TR';
const LKEY = 'botc:speechLang';
let speechLang: SpeechLang = (() => { try { return localStorage.getItem(LKEY) === 'tr-TR' ? 'tr-TR' : 'en-US'; } catch { return 'en-US'; } })();
const lListeners = new Set<() => void>();
export const useSpeechLang = () => useSyncExternalStore(cb => { lListeners.add(cb); return () => lListeners.delete(cb); }, () => speechLang);
export function setSpeechLang(l: SpeechLang) { speechLang = l; try { localStorage.setItem(LKEY, l); } catch { /* ignore */ } lListeners.forEach(f => f()); }

type Rec = { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

const Ctor = (): (new () => Rec) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
export const transcriptionSupported = () => !!Ctor();

/** Runs speech-to-text while `active` is true; sends each finished sentence to the server. */
export function useTranscriber(active: boolean, onBlocked: () => void) {
  const lang = useSpeechLang();
  const rec = useRef<Rec | null>(null);
  const want = useRef(active);
  want.current = active;
  useEffect(() => {
    const C = Ctor();
    if (!C) return;
    if (!active) { rec.current?.stop(); rec.current = null; return; }
    if (rec.current) { const old = rec.current; rec.current = null; old.abort(); } // language changed: start again
    const r = new C();
    r.continuous = true; r.interimResults = false;
    r.lang = lang;
    r.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript?.trim();
        if (res.isFinal && text) socket.emit('action', { type: 'say', text, lang }, () => {});
      }
    };
    r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { want.current = false; onBlocked(); } };
    // the browser stops listening after a while or after silence: carry on while still wanted
    r.onend = () => { if (want.current && rec.current === r) setTimeout(() => { try { if (want.current && rec.current === r) r.start(); } catch { /* already started */ } }, 300); };
    rec.current = r;
    try { r.start(); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lang]);
  useEffect(() => () => { const r = rec.current; rec.current = null; r?.abort(); }, []);
}
