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
