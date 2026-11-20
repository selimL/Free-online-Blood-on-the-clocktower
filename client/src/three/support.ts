// Tiny helpers shared by the 2D UI and the lazily loaded 3D scene (keeps three.js out of the main bundle).
/** Camera elevation of the 3D Town Square; the HTML seat ellipse is squashed by sin(PITCH) to match. */
export const PITCH = (56 * Math.PI) / 180;
export const SQUASH = Math.sin(PITCH);

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
