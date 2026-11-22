// Word listening: speech is turned into English text in the speaker's own browser (Web Speech API,
// Chrome/Edge; the browser sends the audio to its speech service), only while the player has agreed,
// a word character is in the game, and their microphone is live. The server checks each sentence for
// what the character needs (e.g. the Mezepheles' word) and then discards it.
import { useEffect, useRef } from 'react';
import { socket } from './net';

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
  const rec = useRef<Rec | null>(null);
  const want = useRef(active);
  want.current = active;
  useEffect(() => {
    const C = Ctor();
    if (!C) return;
    if (!active) { rec.current?.stop(); rec.current = null; return; }
    if (rec.current) return;
    const r = new C();
    r.continuous = true; r.interimResults = false;
    r.lang = 'en-US';
    r.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript?.trim();
        if (res.isFinal && text) socket.emit('action', { type: 'say', text }, () => {});
      }
    };
    r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { want.current = false; onBlocked(); } };
    // the browser stops listening after a while or after silence: carry on while still wanted
    r.onend = () => { if (want.current && rec.current === r) setTimeout(() => { try { if (want.current && rec.current === r) r.start(); } catch { /* already started */ } }, 300); };
    rec.current = r;
    try { r.start(); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  useEffect(() => () => { const r = rec.current; rec.current = null; r?.abort(); }, []);
}
