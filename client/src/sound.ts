// Atmosphere, synthesised live with the Web Audio API (no audio files, nothing to license):
// a church bell at dawn, wind and crickets at night, a heartbeat during votes, a toll for deaths.
import { useSyncExternalStore } from 'react';

const KEY = 'botc:volume';
let volume = (() => { try { const v = Number(localStorage.getItem(KEY)); return Number.isFinite(v) && localStorage.getItem(KEY) !== null ? v : 0.6; } catch { return 0.6; } })();
const listeners = new Set<() => void>();
export const useVolume = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => volume);

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** Browsers only allow sound after the user has interacted with the page. */
function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume * volume; // perceptual curve
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out: master! };
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => audio(), { once: false, passive: true });

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(KEY, String(volume)); } catch { /* ignore */ }
  if (master && ctx) master.gain.setTargetAtTime(volume * volume, ctx.currentTime, 0.05);
  listeners.forEach(l => l());
}

function noiseBuffer(c: AudioContext, seconds = 2) {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** A bell: a few inharmonic partials with long, staggered decays. */
function bellStrike(c: AudioContext, out: AudioNode, base: number, when: number, gain: number, length: number) {
  const partials = [[0.5, 1], [1, 0.8], [1.19, 0.45], [1.56, 0.35], [2, 0.3], [2.51, 0.18], [3.01, 0.12]];
  for (const [ratio, amp] of partials) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = base * ratio;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain * amp, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + length / ratio);
    o.connect(g).connect(out);
    o.start(when);
    o.stop(when + length / ratio + 0.1);
  }
}

/** Dawn: a bright church bell rung three times. */
export function dawnBell() {
  const a = audio(); if (!a) return;
  const t = a.ctx.currentTime + 0.05;
  for (let i = 0; i < 3; i++) bellStrike(a.ctx, a.out, 392, t + i * 1.4, 0.16, 5);
}

/** Death or execution: one deep, slow toll. */
export function deathToll() {
  const a = audio(); if (!a) return;
  bellStrike(a.ctx, a.out, 110, a.ctx.currentTime + 0.05, 0.3, 9);
}

// ---------------------------------------------------------------- loops
let night: { stop: () => void } | null = null;
/** Night: soft gusting wind plus distant crickets. */
export function setNightAmbience(on: boolean) {
  if (!on) { night?.stop(); night = null; return; }
  if (night) return;
  const a = audio(); if (!a) return;
  const { ctx: c, out } = a;
  const bus = c.createGain();
  bus.gain.setValueAtTime(0, c.currentTime);
  bus.gain.linearRampToValueAtTime(1, c.currentTime + 3);
  bus.connect(out);
  // wind: filtered noise whose level and colour drift slowly
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 4); src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.7;
  const wg = c.createGain(); wg.gain.value = 0.05;
  const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
  const lfoAmt = c.createGain(); lfoAmt.gain.value = 0.035;
  lfo.connect(lfoAmt).connect(wg.gain);
  const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.05;
  const lfo2Amt = c.createGain(); lfo2Amt.gain.value = 180;
  lfo2.connect(lfo2Amt).connect(lp.frequency);
  src.connect(lp).connect(wg).connect(bus);
  src.start(); lfo.start(); lfo2.start();
  // crickets: short chirp trains at irregular intervals
  let timer = 0;
  const chirp = () => {
    const t0 = c.currentTime + 0.02;
    const pan = c.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(bus);
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'triangle'; o.frequency.value = 4300 + Math.random() * 300;
      const t = t0 + i * 0.065;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(g).connect(pan); o.start(t); o.stop(t + 0.06);
    }
    timer = window.setTimeout(chirp, 700 + Math.random() * 2600);
  };
  chirp();
  night = {
    stop: () => {
      window.clearTimeout(timer);
      const t = c.currentTime;
      bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0, t + 1.5);
      setTimeout(() => { src.stop(); lfo.stop(); lfo2.stop(); bus.disconnect(); }, 1700);
    },
  };
}

let heart: { stop: () => void } | null = null;
/** Votes: a low, steady heartbeat. */
export function setHeartbeat(on: boolean) {
  if (!on) { heart?.stop(); heart = null; return; }
  if (heart) return;
  const a = audio(); if (!a) return;
  const { ctx: c, out } = a;
  const thump = (t: number, level: number) => {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
  };
  const beat = () => { const t = c.currentTime + 0.02; thump(t, 0.5); thump(t + 0.24, 0.32); };
  beat();
  const id = window.setInterval(beat, 900);
  heart = { stop: () => window.clearInterval(id) };
}

// ---------------------------------------------------------------- weather sounds
let rainLoop: { stop: () => void; level: number } | null = null;
/** Rain on the cobbles: 0 = off, 1 = rain, 2 = storm. */
export function setRain(level: 0 | 1 | 2) {
  if (rainLoop && rainLoop.level === level) return;
  rainLoop?.stop(); rainLoop = null;
  if (!level) return;
  const a = audio(); if (!a) return;
  const { ctx: c, out } = a;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 3); src.loop = true;
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = level === 2 ? 6000 : 4500;
  const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(level === 2 ? 0.07 : 0.04, c.currentTime + 2);
  src.connect(hp).connect(lp).connect(g).connect(out); src.start();
  rainLoop = { level, stop: () => { const t = c.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 1.5); setTimeout(() => src.stop(), 1700); } };
}
/** A distant roll of thunder. */
export function thunder() {
  const a = audio(); if (!a) return;
  const { ctx: c, out } = a;
  const t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 4);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(90, t + 3);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 3.6);
  src.connect(lp).connect(g).connect(out); src.start(t); src.stop(t + 3.8);
}

// ---------------------------------------------------------------- music (its own volume)
export type MusicMood = 'off' | 'day' | 'night' | 'vote';
const MKEY = 'botc:music';
let musicVolume = (() => { try { const v = localStorage.getItem(MKEY); return v === null ? 0.35 : Math.max(0, Math.min(1, Number(v) || 0)); } catch { return 0.35; } })();
const mListeners = new Set<() => void>();
export const useMusicVolume = () => useSyncExternalStore(cb => { mListeners.add(cb); return () => mListeners.delete(cb); }, () => musicVolume);
let musicBus: GainNode | null = null;
function musicOut() {
  const a = audio(); if (!a) return null;
  if (!musicBus) { musicBus = a.ctx.createGain(); musicBus.gain.value = musicVolume * musicVolume * 0.8; musicBus.connect(a.ctx.destination); }
  return { ctx: a.ctx, out: musicBus };
}
export function setMusicVolume(v: number) {
  musicVolume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(MKEY, String(musicVolume)); } catch { /* ignore */ }
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(musicVolume * musicVolume * 0.8, ctx.currentTime, 0.1);
  mListeners.forEach(l => l());
  if (musicVolume > 0 && wantedMood !== 'off' && !playing) startMood(wantedMood);
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
function note(c: AudioContext, out: AudioNode, midi: number, t: number, len: number, gain: number, type: OscillatorType, cutoff = 2400) {
  const o = c.createOscillator(); const g = c.createGain(); const f = c.createBiquadFilter();
  o.type = type; o.frequency.value = hz(midi);
  f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + len + 0.05);
}
function pad(c: AudioContext, out: AudioNode, midis: number[], t: number, len: number, gain: number) {
  const g = c.createGain(); const f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 650;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + len * 0.35); g.gain.linearRampToValueAtTime(0, t + len);
  f.connect(g).connect(out);
  for (const m of midis) for (const det of [-7, 7]) {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det;
    o.connect(f); o.start(t); o.stop(t + len + 0.05);
  }
}

// D minor: i – VI – III – VII (Dm, Bb, F, C), two bars each
const CHORDS = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]];
const PENTA = [62, 65, 67, 69, 72, 74, 77, 79];
interface Song { step: (c: AudioContext, out: AudioNode, t: number, i: number) => void; beat: number }
const SONGS: Record<Exclude<MusicMood, 'off'>, Song> = {
  // a slow, plucked minor-key arpeggio over a bass line and a soft pad
  day: {
    beat: 60 / 76 / 2,
    step: (c, out, t, i) => {
      const bar = Math.floor(i / 8), ch = CHORDS[Math.floor(bar / 2) % CHORDS.length];
      const pattern = [0, 2, 1, 2, 0, 2, 1, 2];
      const pitch = ch[pattern[i % 8]] + 12 + (i % 8 === 4 ? 12 : 0);
      note(c, out, pitch, t, 0.9, 0.05, 'triangle', 2200);
      if (i % 8 === 0) note(c, out, ch[0] - 12, t, 1.8, 0.07, 'sine');
      if (i % 8 === 4) note(c, out, ch[0] - 12, t, 1.2, 0.05, 'sine');
      if (i % 16 === 0) pad(c, out, ch, t, (60 / 76) * 8, 0.018);
      if (i % 32 === 28 && Math.random() < 0.6) note(c, out, PENTA[Math.floor(Math.random() * PENTA.length)] + 12, t, 1.6, 0.025, 'sine', 4000);
    },
  },
  // a low drone with distant, irregular bells
  night: {
    beat: 1,
    step: (c, out, t, i) => {
      if (i % 12 === 0) { pad(c, out, [38, 45], t, 13, 0.03); }
      if (i % 3 === 0 && Math.random() < 0.45) bellStrike(c, out, hz(PENTA[Math.floor(Math.random() * PENTA.length)]), t + Math.random() * 0.8, 0.018, 4);
    },
  },
  // a tense, pulsing ostinato while votes are counted
  vote: {
    beat: 60 / 104 / 2,
    step: (c, out, t, i) => {
      const line = [38, 38, 41, 38, 40, 38, 41, 43];
      note(c, out, line[i % 8], t, 0.28, 0.08, 'sawtooth', 520);
      if (i % 2 === 0) note(c, out, line[i % 8] + 24, t, 0.18, 0.012, 'square', 1800);
      if (i % 16 === 0) pad(c, out, [62, 65, 69], t, (60 / 104) * 8, 0.012);
    },
  },
};

let wantedMood: MusicMood = 'off';
let playing: { mood: MusicMood; stop: () => void } | null = null;
function startMood(mood: Exclude<MusicMood, 'off'>) {
  const m = musicOut(); if (!m) return;
  const { ctx: c, out } = m;
  const bus = c.createGain();
  bus.gain.setValueAtTime(0, c.currentTime); bus.gain.linearRampToValueAtTime(1, c.currentTime + 2.5);
  bus.connect(out);
  const song = SONGS[mood];
  let next = c.currentTime + 0.1, i = 0;
  const id = window.setInterval(() => {
    while (next < c.currentTime + 0.6) { song.step(c, bus, next, i++); next += song.beat; }
  }, 150);
  playing = {
    mood,
    stop: () => {
      window.clearInterval(id);
      const t = c.currentTime;
      bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0, t + 2);
      setTimeout(() => bus.disconnect(), 2600);
    },
  };
}
/** Choose the background music for the current moment of the game (crossfades). */
export function setMusic(mood: MusicMood) {
  wantedMood = mood;
  if (playing?.mood === mood) return;
  playing?.stop(); playing = null;
  if (mood === 'off' || musicVolume === 0) return;
  startMood(mood);
}

// ---------------------------------------------------------------- personal alerts
export type PingKind = 'nominated' | 'woken' | 'whisper' | 'yourVote' | 'spotlight';
const PING_KEY = 'botc:alerts';
export interface AlertPrefs { sound: boolean; vibrate: boolean; notify: boolean }
let alertPrefs: AlertPrefs = (() => { try { return { sound: true, vibrate: true, notify: false, ...JSON.parse(localStorage.getItem(PING_KEY) ?? '{}') }; } catch { return { sound: true, vibrate: true, notify: false }; } })();
const aListeners = new Set<() => void>();
export const useAlertPrefs = () => useSyncExternalStore(cb => { aListeners.add(cb); return () => aListeners.delete(cb); }, () => alertPrefs);
export function setAlertPrefs(p: Partial<AlertPrefs>) {
  alertPrefs = { ...alertPrefs, ...p };
  try { localStorage.setItem(PING_KEY, JSON.stringify(alertPrefs)); } catch { /* ignore */ }
  aListeners.forEach(l => l());
}
const PINGS: Record<PingKind, { notes: number[]; gap: number; vib: number[]; text: string }> = {
  nominated: { notes: [659, 523, 392], gap: 0.13, vib: [200, 80, 200], text: 'You have been nominated!' },
  woken: { notes: [523, 784], gap: 0.18, vib: [120, 60, 120], text: 'The Storyteller has woken you.' },
  whisper: { notes: [880, 1175], gap: 0.09, vib: [60], text: 'The Storyteller sent you a private message.' },
  yourVote: { notes: [988], gap: 0.1, vib: [250], text: 'The clock hand is on you: your vote is being counted.' },
  spotlight: { notes: [784, 988], gap: 0.12, vib: [100, 50, 100], text: 'It is your turn to speak.' },
};
/** A short personal chime (plus vibration, and a system notification when the tab is hidden). */
export function ping(kind: PingKind) {
  const p = PINGS[kind];
  if (alertPrefs.sound) {
    const a = audio();
    if (a) {
      const t0 = a.ctx.currentTime + 0.02;
      p.notes.forEach((f, i) => {
        const o = a.ctx.createOscillator(); const g = a.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        const t = t0 + i * p.gap;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g).connect(a.out); o.start(t); o.stop(t + 0.55);
      });
    }
  }
  if (alertPrefs.vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) { try { navigator.vibrate(p.vib); } catch { /* ignore */ } }
  if (alertPrefs.notify && typeof document !== 'undefined' && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification('Clocktower Nights', { body: p.text, tag: kind }); } catch { /* ignore */ }
  }
}
