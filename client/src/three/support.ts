// Tiny helpers shared by the 2D UI and the lazily loaded 3D scene (keeps three.js out of the main bundle).
/** Camera elevation of the 3D Town Square; the HTML seat ellipse is squashed by sin(PITCH) to match. */
export const PITCH = (48 * Math.PI) / 180;
export const SQUASH = Math.sin(PITCH);
/** World radius on which seats (and figures) stand. */
export const SEAT_R = 8.6;
/** Where the Storyteller's figure stands: in front of the clocktower, toward the camera. */
export const ST_Z = 2.9;
/** Figures are scaled up a little so they read well from the town camera. */
export const CHAR_SCALE = 1.7;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const KEY = 'botc:view3d';
/** 3D by default on capable desktop browsers; 2D on narrow screens, without WebGL, or when the viewer chose 2D. */
export function initial3D(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === '1') return webglAvailable();
    if (saved === '0') return false;
  } catch { /* storage blocked */ }
  return webglAvailable() && window.innerWidth > 860;
}
export function save3D(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- 3D quality
export type Quality = 'low' | 'medium' | 'high';
export const QUALITY: Record<Quality, { pixelRatio: number; antialias: boolean; shadows: boolean; shadowMap: number; particles: number; fps: number }> = {
  low: { pixelRatio: 0.75, antialias: false, shadows: false, shadowMap: 512, particles: 0.3, fps: 24 },
  medium: { pixelRatio: 1, antialias: true, shadows: true, shadowMap: 1024, particles: 0.7, fps: 30 },
  high: { pixelRatio: 1.5, antialias: true, shadows: true, shadowMap: 2048, particles: 1, fps: 45 },
};
const QKEY = 'botc:quality';
const qListeners = new Set<() => void>();
/** Phones and small-memory devices start on Low; everything else on Medium. */
export function getQuality(): Quality {
  try { const v = localStorage.getItem(QKEY); if (v === 'low' || v === 'medium' || v === 'high') return v; } catch { /* ignore */ }
  const weak = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
    || ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
  return weak ? 'low' : 'medium';
}
export function setQuality(q: Quality) {
  try { localStorage.setItem(QKEY, q); } catch { /* ignore */ }
  qListeners.forEach(l => l());
}
export function onQualityChange(fn: () => void) { qListeners.add(fn); return () => { qListeners.delete(fn); }; }
/** The renderer pixel ratio for a quality preset (never above the screen's own). */
export const pixelRatioFor = (q: Quality) => Math.min(window.devicePixelRatio || 1, QUALITY[q].pixelRatio);
