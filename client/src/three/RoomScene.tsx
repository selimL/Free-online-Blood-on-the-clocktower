// 3D interiors for the side rooms and the Storyteller's Study. Each room is a small stage set:
// the AI-painted scene (client/public/art) is the back wall, with 3D props, lighting and the
// room's occupants in front of it. Decoration only: rules and voice are still server-side.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Avatar } from '../../../shared/types';
import type { Occupant } from './occupants';
import { buildCharacter, disposeCharacter, playGesture, CHARACTER_HEIGHT } from './character';
import { onEmote, EMOTE_ICON, EMOTE_MS } from '../emotes';
import { useVoice } from '../voice';
import { socket } from '../net';

// walkable floor (the server clamps to the same numbers)
const HALF_W = 5.2, Z_MIN = -2.6, Z_MAX = 4.6, SPEED = 3.4;


interface Props {
  art: string;                     // tavern, chapel, … study
  occupants: Occupant[];
  myId: string;
  reducedMotion: boolean;
  onFigureClick: (id: string) => void;
  onFail: () => void;
  /** Daytime in a side room or the Study: you can walk around the room. */
  canWalk?: boolean;
}

// ---------------------------------------------------------------- per-room look
interface RoomLook { floor: string; ambient: string; ambientI: number; key: string; keyI: number; fog: string; lights: { c: string; p: [number, number, number]; i: number; flicker: number }[]; ring: number }
const LOOKS: Record<string, RoomLook> = {
  tavern: { floor: '#3a2618', ambient: '#ffb070', ambientI: 0.55, key: '#ffcf8a', keyI: 1.1, fog: '#140b06', ring: 2.3, lights: [{ c: '#ffb347', p: [0, 2.2, 0], i: 14, flicker: 0.15 }, { c: '#ff7a2a', p: [5.5, 1.5, -3], i: 18, flicker: 0.25 }] },
  chapel: { floor: '#24242c', ambient: '#8fa6ff', ambientI: 0.6, key: '#9fb4ff', keyI: 1.3, fog: '#0b0c16', ring: 2.3, lights: [{ c: '#ffcf8a', p: [-3.2, 1.6, -1.5], i: 7, flicker: 0.15 }, { c: '#ffcf8a', p: [3.2, 1.6, -1.5], i: 7, flicker: 0.15 }, { c: '#4a6bff', p: [0, 5, -4], i: 16, flicker: 0 }] },
  graveyard: { floor: '#0f1311', ambient: '#8ea2c8', ambientI: 0.5, key: '#c9d6ff', keyI: 0.75, fog: '#0d1118', ring: 2.4, lights: [{ c: '#ffb347', p: [-4.2, 2.1, 1], i: 9, flicker: 0.2 }] },
  library: { floor: '#2e2016', ambient: '#ffcf9a', ambientI: 0.55, key: '#bcc8ff', keyI: 1, fog: '#100a07', ring: 2.3, lights: [{ c: '#ffb347', p: [0.6, 1.9, 0], i: 12, flicker: 0.15 }] },
  apothecary: { floor: '#2a2219', ambient: '#9fe0b0', ambientI: 0.5, key: '#ffd9a8', keyI: 0.9, fog: '#0a100c', ring: 2.3, lights: [{ c: '#4dff7a', p: [-3.6, 1.6, -1.5], i: 10, flicker: 0.1 }, { c: '#ffb347', p: [1, 2, 0], i: 9, flicker: 0.15 }] },
  blacksmith: { floor: '#231a14', ambient: '#ff9a5a', ambientI: 0.45, key: '#ffb37a', keyI: 0.8, fog: '#120806', ring: 2.3, lights: [{ c: '#ff5a10', p: [3.6, 1.4, -1.2], i: 26, flicker: 0.3 }] },
  'clocktower-stair': { floor: '#25232a', ambient: '#a9b4d8', ambientI: 0.55, key: '#bcc8ff', keyI: 1, fog: '#0b0b10', ring: 2.1, lights: [{ c: '#ffb347', p: [-3.5, 2.2, 0], i: 10, flicker: 0.2 }] },
  'old-mill': { floor: '#33281d', ambient: '#c9b48a', ambientI: 0.55, key: '#9fb4ff', keyI: 1.1, fog: '#100c08', ring: 2.5, lights: [{ c: '#ffb347', p: [4.2, 2.2, 0.5], i: 10, flicker: 0.2 }] },
  study: { floor: '#2a1c14', ambient: '#ffb98a', ambientI: 0.55, key: '#ffcf8a', keyI: 1, fog: '#110a06', ring: 2.0, lights: [{ c: '#ff7a2a', p: [-5, 1.4, -2.5], i: 18, flicker: 0.25 }, { c: '#ffb347', p: [0.6, 1.9, -0.5], i: 9, flicker: 0.15 }] },
};

// ---------------------------------------------------------------- small modelling helpers
type V3 = [number, number, number];
const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, p: V3, r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p); m.rotation.set(...r); m.scale.set(...s);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const C = (rt: number, rb: number, h: number, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
const MAT = {
  wood: std('#4a3220'), darkWood: std('#2b1c12'), stone: std('#5a5660'), darkStone: std('#3a3740'),
  iron: std('#2a2a30', { metalness: 0.6, roughness: 0.4 }), brass: std('#b08a3a', { metalness: 0.7, roughness: 0.35 }),
  candle: std('#efe6d0'), flame: std('#ffcf6b', { emissive: '#ff9a2e', emissiveIntensity: 2.4 }),
  cloth: std('#6b1a1a'), paper: std('#e9dcc0'), sack: std('#8a7350'), green: std('#4dff7a', { emissive: '#1fbf4a', emissiveIntensity: 1.6, transparent: true, opacity: 0.85 }),
  red: std('#ff4a5a', { emissive: '#bf1f2a', emissiveIntensity: 1.4, transparent: true, opacity: 0.85 }), coal: std('#ff5a10', { emissive: '#ff3a00', emissiveIntensity: 2.6 }),
  bone: std('#7d7a80'), leaf: std('#3a4a2a'),
};
function candle(parent: THREE.Object3D, x: number, y: number, z: number, h = 0.3) {
  put(parent, C(0.045, 0.05, h, 10), MAT.candle, [x, y + h / 2, z]);
  put(parent, new THREE.SphereGeometry(0.035, 8, 6), MAT.flame, [x, y + h + 0.05, z], [0, 0, 0], [1, 1.8, 1]);
}
function stool(parent: THREE.Object3D, x: number, z: number) {
  put(parent, C(0.28, 0.28, 0.08), MAT.wood, [x, 0.62, z]);
  for (const [dx, dz] of [[0.16, 0], [-0.08, 0.14], [-0.08, -0.14]]) put(parent, C(0.03, 0.04, 0.6, 6), MAT.darkWood, [x + dx, 0.3, z + dz]);
}
function barrel(parent: THREE.Object3D, x: number, z: number, s = 1) {
  put(parent, C(0.42 * s, 0.38 * s, 1.0 * s, 16), MAT.wood, [x, 0.5 * s, z]);
  for (const y of [0.18, 0.82]) put(parent, new THREE.TorusGeometry(0.41 * s, 0.025, 6, 20), MAT.iron, [x, y * s, z], [Math.PI / 2, 0, 0]);
}
function bookshelf(parent: THREE.Object3D, x: number, z: number, ry: number) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
  put(g, B(2.2, 3.6, 0.6), MAT.darkWood, [0, 1.8, 0]);
  const colors = ['#5a1a1a', '#1f2f4a', '#2e3b25', '#6b5a3a', '#3d2b4f', '#7c2d12'];
  for (let row = 0; row < 4; row++) for (let i = 0; i < 9; i++) {
    const h = 0.5 + Math.random() * 0.25;
    put(g, B(0.18, h, 0.42), std(colors[(row * 9 + i) % colors.length]), [-0.9 + i * 0.22, 0.25 + row * 0.85 + h / 2, 0.12]);
  }
}
function gear(parent: THREE.Object3D, r: number, teeth: number, mat: THREE.Material) {
  const g = new THREE.Group(); parent.add(g);
  put(g, new THREE.TorusGeometry(r, r * 0.12, 8, 32), mat, [0, 0, 0]);
  put(g, C(r * 0.18, r * 0.18, r * 0.25, 12), mat, [0, 0, 0], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) put(g, B(r * 2, r * 0.1, r * 0.08), mat, [0, 0, 0], [0, 0, (i * Math.PI) / 4]);
  for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; put(g, B(r * 0.16, r * 0.22, r * 0.18), mat, [Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1, 0], [0, 0, a]); }
  return g;
}

type Anim = (t: number) => void;
/** Builds the room's props. The centre (0,0,0) is the gathering point; occupants stand around it. */
function buildProps(art: string, scene: THREE.Object3D, anims: Anim[]) {
  switch (art) {
    case 'tavern': {
      put(scene, C(1.0, 1.0, 0.1, 24), MAT.wood, [0, 1.05, 0]);
      put(scene, C(0.12, 0.2, 1.0, 10), MAT.darkWood, [0, 0.5, 0]);
      candle(scene, 0, 1.1, 0, 0.35);
      put(scene, C(0.18, 0.15, 0.25, 12), MAT.iron, [0.45, 1.22, 0.2]); // tankard
      put(scene, C(0.18, 0.15, 0.25, 12), MAT.iron, [-0.4, 1.22, -0.3]);
      for (const [x, z] of [[-4.6, -2.2], [-5.3, -1.0], [4.9, 1.8]]) barrel(scene, x, z);
      for (const [x, z] of [[-1.7, 1.6], [1.8, 1.4], [3.6, -1.6], [-3.2, 2.6]]) stool(scene, x, z);
      const ch = new THREE.Group(); ch.position.set(0, 4.6, 0); scene.add(ch);
      put(ch, new THREE.TorusGeometry(1.0, 0.05, 8, 32), MAT.iron, [0, 0, 0], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; candle(ch, Math.cos(a), 0.03, Math.sin(a), 0.22); }
      anims.push(t => { ch.rotation.y = Math.sin(t * 0.4) * 0.05; });
      break;
    }
    case 'chapel': {
      for (const side of [-1, 1]) for (let r = 0; r < 3; r++) {
        const z = 2.2 - r * 1.6;
        put(scene, B(2.6, 0.12, 0.6), MAT.darkWood, [side * 3.6, 0.6, z]);
        put(scene, B(2.6, 0.8, 0.1), MAT.darkWood, [side * 3.6, 0.9, z - 0.3]);
      }
      for (const x of [-2.4, 2.4]) { put(scene, C(0.06, 0.12, 1.3, 8), MAT.brass, [x, 0.65, -1.6]); for (let i = -1; i <= 1; i++) candle(scene, x + i * 0.18, 1.3, -1.6, 0.25 + Math.abs(i) * 0.05); }
      put(scene, C(1.0, 1.0, 0.04, 32), std('#3a2a2a', { roughness: 1 }), [0, 0.02, 0]); // rug
      break;
    }
    case 'graveyard': {
      for (const [x, z, h] of [[-3.5, -1.5, 1.1], [-2.4, -2.6, 0.9], [3.2, -2, 1.2], [4.2, -0.6, 0.8], [-4.6, 1.2, 0.9], [2.4, 2.4, 0.7]] as [number, number, number][]) {
        const tomb = put(scene, B(0.6, h, 0.18), MAT.bone, [x, h / 2, z], [0, Math.random() - 0.5, (Math.random() - 0.5) * 0.15]);
        tomb.geometry = new THREE.BoxGeometry(0.6, h, 0.18);
      }
      put(scene, B(0.14, 1.4, 0.14), MAT.bone, [3.6, 0.7, 0.9]); put(scene, B(0.7, 0.14, 0.14), MAT.bone, [3.6, 1.05, 0.9]); // cross
      const trunk = put(scene, C(0.14, 0.32, 4, 7), MAT.darkWood, [-5.2, 2, -2.5], [0, 0, 0.1]); void trunk;
      for (let i = 0; i < 5; i++) put(scene, C(0.03, 0.09, 2, 5), MAT.darkWood, [-5.2 + (Math.random() - 0.5), 3.4 + Math.random(), -2.5], [Math.random() - 0.5, 0, (Math.random() - 0.5) * 2.2]);
      put(scene, C(0.06, 0.08, 2.4, 6), MAT.iron, [-4.2, 1.2, 1]);
      put(scene, B(0.3, 0.4, 0.3), MAT.flame, [-4.2, 2.3, 1]);
      // drifting fog
      const fogMat = new THREE.MeshBasicMaterial({ color: '#5a6478', transparent: true, opacity: 0.06, depthWrite: false });
      const fogs = [0, 1, 2].map(i => { const f = new THREE.Mesh(new THREE.PlaneGeometry(14, 3), fogMat); f.rotation.x = -Math.PI / 2; f.position.set(0, 0.25 + i * 0.2, -1 + i); scene.add(f); return f; });
      anims.push(t => fogs.forEach((f, i) => { f.position.x = Math.sin(t * 0.15 + i * 2) * 1.5; }));
      break;
    }
    case 'library': {
      put(scene, B(2.2, 0.1, 1.2), MAT.wood, [0, 1.05, 0]);
      for (const [x, z] of [[-0.95, -0.45], [0.95, -0.45], [-0.95, 0.45], [0.95, 0.45]]) put(scene, B(0.1, 1.0, 0.1), MAT.darkWood, [x, 0.5, z]);
      put(scene, B(0.7, 0.04, 0.5), MAT.paper, [-0.2, 1.12, 0.05], [0, 0.2, 0]); // open book
      put(scene, B(0.02, 0.06, 0.5), MAT.cloth, [-0.2, 1.13, 0.05], [0, 0.2, 0]);
      candle(scene, 0.6, 1.1, -0.2, 0.3); candle(scene, 0.75, 1.1, -0.05, 0.22);
      for (let i = 0; i < 4; i++) put(scene, B(0.45, 0.1, 0.32), std(['#5a1a1a', '#1f2f4a', '#2e3b25', '#6b5a3a'][i]), [0.75, 1.15 + i * 0.1, 0.35], [0, i * 0.3, 0]);
      bookshelf(scene, -4.8, -1.4, 0.5); bookshelf(scene, 4.8, -1.4, -0.5);
      break;
    }
    case 'apothecary': {
      put(scene, B(2.6, 1.0, 0.9), MAT.wood, [0, 0.5, -0.4]);
      put(scene, B(2.8, 0.08, 1.0), MAT.darkWood, [0, 1.04, -0.4]);
      put(scene, C(0.18, 0.12, 0.2, 12), MAT.stone, [-0.5, 1.18, -0.3]); // mortar
      put(scene, C(0.03, 0.03, 0.35, 6), MAT.darkWood, [-0.45, 1.3, -0.3], [0, 0, 0.5]);
      for (let i = 0; i < 6; i++) put(scene, C(0.07, 0.09, 0.28, 10), i % 2 ? MAT.green : MAT.red, [0.2 + i * 0.22, 1.22, -0.5 + (i % 2) * 0.15]);
      for (const side of [-1, 1]) {
        put(scene, B(0.5, 3.2, 2.6), MAT.darkWood, [side * 5, 1.6, -1.2]);
        for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) put(scene, C(0.09, 0.1, 0.3, 8), (i + row) % 3 ? MAT.green : MAT.red, [side * 4.7, 0.6 + row * 0.95, -2.2 + i * 0.4]);
      }
      for (let i = 0; i < 7; i++) {
        const herb = put(scene, new THREE.ConeGeometry(0.16, 0.6, 6), MAT.leaf, [-3 + i, 4.2, -0.5 + (i % 2)], [Math.PI, 0, 0]);
        anims.push(t => { herb.rotation.z = Math.sin(t * 0.8 + i) * 0.06; });
      }
      break;
    }
    case 'blacksmith': {
      put(scene, B(0.5, 0.7, 0.4), MAT.iron, [0, 0.35, 0]);
      put(scene, B(1.2, 0.3, 0.45), MAT.iron, [0, 0.85, 0]);
      put(scene, new THREE.ConeGeometry(0.2, 0.5, 4), MAT.iron, [0.75, 0.88, 0], [0, 0, -Math.PI / 2], [1, 1, 0.8]);
      put(scene, C(0.04, 0.04, 0.5, 6), MAT.darkWood, [0.1, 1.05, 0.15], [0, 0, 1.3]); // hammer
      put(scene, B(0.18, 0.12, 0.12), MAT.iron, [-0.13, 1.1, 0.15]);
      put(scene, B(2.2, 1.1, 1.6), MAT.darkStone, [3.8, 0.55, -1.2]);
      const coals = put(scene, B(1.6, 0.15, 1.1), MAT.coal, [3.8, 1.15, -1.2]);
      barrel(scene, -3.6, -1.2, 0.9);
      put(scene, B(2.6, 2.2, 0.1), MAT.darkWood, [-4.4, 1.6, -2.8]);
      for (let i = 0; i < 5; i++) put(scene, B(0.08, 0.9, 0.06), MAT.iron, [-5.4 + i * 0.5, 1.9, -2.7]);
      anims.push(t => { (coals.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2 + Math.sin(t * 9) * 0.4 + Math.sin(t * 23) * 0.25; });
      break;
    }
    case 'clocktower-stair': {
      const g1 = gear(scene, 1.4, 16, MAT.brass); g1.position.set(-4.4, 3, -2.5);
      const g2 = gear(scene, 0.9, 11, MAT.brass); g2.position.set(-2.4, 4.6, -2.6);
      const g3 = gear(scene, 1.2, 14, MAT.iron); g3.position.set(4.6, 2.6, -2.4);
      anims.push(t => { g1.rotation.z = t * 0.2; g2.rotation.z = -t * 0.31; g3.rotation.z = -t * 0.15; });
      for (let i = 0; i < 9; i++) put(scene, B(1.4, 0.18, 0.6), MAT.darkStone, [3.4 - i * 0.05, 0.1 + i * 0.32, 1.6 - i * 0.55], [0, -0.35, 0]);
      put(scene, C(0.06, 0.06, 2.6, 6), MAT.iron, [-3.5, 1.3, 0]); candle(scene, -3.5, 2.6, 0, 0.2);
      // pendulum
      const pend = new THREE.Group(); pend.position.set(0, 5.4, -2.6); scene.add(pend);
      put(pend, C(0.03, 0.03, 3.4, 6), MAT.brass, [0, -1.7, 0]);
      put(pend, C(0.35, 0.35, 0.08, 20), MAT.brass, [0, -3.4, 0], [Math.PI / 2, 0, 0]);
      anims.push(t => { pend.rotation.z = Math.sin(t * 1.6) * 0.25; });
      break;
    }
    case 'old-mill': {
      put(scene, C(1.3, 1.3, 0.5, 28), MAT.stone, [0, 0.25, 0]);
      const stone = put(scene, C(1.15, 1.15, 0.35, 28), MAT.darkStone, [0, 0.68, 0]);
      put(scene, C(0.12, 0.12, 1.8, 8), MAT.darkWood, [0, 1.2, 0]);
      anims.push(t => { stone.rotation.y = t * 0.3; });
      const big = gear(scene, 1.8, 18, MAT.darkWood); big.position.set(4.6, 3, -2.5);
      anims.push(t => { big.rotation.z = t * 0.12; });
      for (const [x, z] of [[-4.2, 0.5], [-4.8, -0.4], [-3.6, -0.9], [-5, 1.6]]) put(scene, new THREE.SphereGeometry(0.45, 14, 10), MAT.sack, [x, 0.38, z], [0, 0, 0], [1, 0.85, 0.8]);
      put(scene, C(0.06, 0.08, 2.4, 6), MAT.iron, [4.2, 1.2, 0.5]); put(scene, B(0.3, 0.4, 0.3), MAT.flame, [4.2, 2.3, 0.5]);
      break;
    }
    case 'study': {
      put(scene, B(2.4, 0.12, 1.2), MAT.darkWood, [0, 1.05, -0.6]);
      put(scene, B(2.2, 0.95, 1.0), MAT.wood, [0, 0.5, -0.6]);
      put(scene, B(0.8, 0.05, 0.55), MAT.paper, [-0.3, 1.13, -0.5], [0, -0.15, 0]);
      put(scene, B(0.03, 0.07, 0.55), MAT.cloth, [-0.3, 1.14, -0.5], [0, -0.15, 0]);
      // hourglass
      const hg = new THREE.Group(); hg.position.set(0.7, 1.11, -0.5); scene.add(hg);
      put(hg, new THREE.ConeGeometry(0.11, 0.2, 12), std('#e9dcc0', { transparent: true, opacity: 0.6 }), [0, 0.1, 0], [Math.PI, 0, 0]);
      put(hg, new THREE.ConeGeometry(0.11, 0.2, 12), std('#e9dcc0', { transparent: true, opacity: 0.6 }), [0, 0.3, 0]);
      put(hg, C(0.13, 0.13, 0.03, 12), MAT.brass, [0, 0, 0]); put(hg, C(0.13, 0.13, 0.03, 12), MAT.brass, [0, 0.4, 0]);
      put(scene, C(0.05, 0.12, 0.5, 8), MAT.brass, [-0.9, 1.35, -0.8]);
      for (const dx of [-0.2, 0, 0.2]) candle(scene, -0.9 + dx, 1.6, -0.8, 0.25);
      // armchair behind the desk
      put(scene, B(1.0, 0.5, 0.9), MAT.cloth, [0, 0.45, -1.8]);
      put(scene, B(1.0, 1.4, 0.2), MAT.cloth, [0, 1.0, -2.2]);
      break;
    }
  }
}

function setLabel(el: HTMLDivElement, o: Occupant, mine: boolean) {
  el.className = `fig-label ${mine ? 'mine' : ''} ${o.alive ? '' : 'dead'}`;
  el.textContent = `${o.alive ? '' : '👻 '}${o.name}${o.muted ? ' 🔇' : ''}${o.joining ? ' ⏳' : ''}`;
  if (o.evilMark) { const e = document.createElement('span'); e.className = 'evil-mark'; e.textContent = ' (evil)'; el.appendChild(e); }
}

interface Fig { ry?: number; mine?: boolean; fig: THREE.Group; key: string; labelEl: HTMLDivElement; bubbleEl: HTMLDivElement; ring: THREE.Mesh; x: number; z: number; tx: number; tz: number; walk: number; stride: number }

export default function RoomScene({ art, occupants, myId, reducedMotion, onFigureClick, onFail, canWalk = false }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const figs = useRef(new Map<string, Fig>());
  const voice = useVoice();
  const live = useRef({ speaking: voice.speaking as string[], reducedMotion, onFigureClick, canWalk, myId });
  live.current = { speaking: voice.speaking, reducedMotion, onFigureClick, canWalk, myId };
  const ctl = useRef({ keys: new Set<string>(), target: null as { x: number; z: number } | null, lastSent: 0, still: true });
  const look = LOOKS[art] ?? LOOKS.tavern;

  // ---------------- scene
  useEffect(() => {
    const mount = mountRef.current!;
    const stage = mount.parentElement!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' }); } catch { onFail(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    mount.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.domElement.className = 'town3d-labels';
    mount.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(look.fog);
    scene.fog = new THREE.Fog(look.fog, 12, 30);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const anims: Anim[] = [];

    // the painting is the back wall (unlit, so it keeps its own lighting)
    const tex = new THREE.TextureLoader().load(`/art/${art}.jpg`);
    tex.colorSpace = THREE.SRGBColorSpace;
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color: '#d8d0c8', fog: false }));
    backdrop.position.set(0, 4.2, -6.5);
    scene.add(backdrop);
    // floor that runs into the painting, fading into shadow at the back
    const floorTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d')!;
      g.fillStyle = look.floor; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < 256; x += 64) { g.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.2})`; g.fillRect(x + 1, y + 1, 62, 30); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const floor = put(scene, new THREE.PlaneGeometry(26, 16), std('#ffffff', { map: floorTex, roughness: 0.95 }), [0, 0, 1.5], [-Math.PI / 2, 0, 0]);
    floor.castShadow = false;
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(26, 4), new THREE.MeshBasicMaterial({ color: look.fog, transparent: true, opacity: 0.85, depthWrite: false }));
    shade.rotation.x = -Math.PI / 2; shade.position.set(0, 0.01, -5.4);
    scene.add(shade);

    // soften the seam where the painting meets the 3D floor
    const seam = (() => {
      const c = document.createElement('canvas'); c.width = 4; c.height = 128;
      const g = c.getContext('2d')!;
      const grd = g.createLinearGradient(0, 0, 0, 128);
      const col = new THREE.Color(look.fog);
      const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
      grd.addColorStop(0, `rgba(${rgb},0)`); grd.addColorStop(0.55, `rgba(${rgb},0.75)`); grd.addColorStop(1, `rgba(${rgb},1)`);
      g.fillStyle = grd; g.fillRect(0, 0, 4, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const seamMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 2.6), new THREE.MeshBasicMaterial({ map: seam, transparent: true, depthWrite: false, fog: false }));
    seamMesh.position.set(0, 0.9, -6.4);
    scene.add(seamMesh);

    buildProps(art, scene, anims);

    // lights
    scene.add(new THREE.HemisphereLight(look.ambient, '#120c08', look.ambientI));
    const key = new THREE.DirectionalLight(look.key, look.keyI);
    key.position.set(3, 7, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
    scene.add(key);
    const flick = look.lights.map(l => { const p = new THREE.PointLight(l.c, l.i, 12, 1.6); p.position.set(...l.p); scene.add(p); return { p, l }; });

    // size: the painting always covers the view behind the props
    const resize = () => {
      const W = stage.clientWidth, H = stage.clientHeight;
      renderer.setSize(W, H, false);
      renderer.domElement.style.width = `${W}px`; renderer.domElement.style.height = `${H}px`;
      labels.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      const dist = 8.5 + 6.5;
      const vh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.25;
      const vw = vh * camera.aspect;
      const s = Math.max(vw, vh * (16 / 9));
      backdrop.scale.set(s, s * (9 / 16), 1);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(stage);

    // gentle camera parallax with the pointer
    let px = 0, py = 0;
    const onMove = (e: PointerEvent) => { const r = stage.getBoundingClientRect(); px = (e.clientX - r.left) / r.width - 0.5; py = (e.clientY - r.top) / r.height - 0.5; };
    stage.addEventListener('pointermove', onMove);

    // click a figure (Storyteller tools)
    const ray = new THREE.Raycaster();
    const onClick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects([...figs.current.values()].map(f => f.fig), true)[0];
      let o: THREE.Object3D | null = hit?.object ?? null;
      while (o && o.userData.figureId === undefined) o = o.parent;
      if (o && o.userData.figureId !== live.current.myId) { live.current.onFigureClick(o.userData.figureId); return; }
      // click the floor: walk there
      const pt = new THREE.Vector3();
      if (live.current.canWalk && ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) {
        ctl.current.target = { x: Math.max(-HALF_W, Math.min(HALF_W, pt.x)), z: Math.max(Z_MIN, Math.min(Z_MAX, pt.z)) };
      }
    };
    const typing = (e: KeyboardEvent) => /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e) || !live.current.canWalk) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { ctl.current.keys.add(k); e.preventDefault(); }
    };
    const onKeyUp = (e: KeyboardEvent) => ctl.current.keys.delete(e.key.toLowerCase());
    const onBlur = () => ctl.current.keys.clear();
    addEventListener('keydown', onKeyDown); addEventListener('keyup', onKeyUp); addEventListener('blur', onBlur);
    renderer.domElement.addEventListener('pointerdown', onClick);

    const clock = new THREE.Clock();
    let raf = 0, last = -1, prev = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = clock.getElapsedTime();
      if (t - last < 1 / 30) return;
      last = t;
      const dt = Math.min(0.25, t - prev); prev = t;
      const reduced = live.current.reducedMotion;
      if (!reduced) for (const a of anims) a(t);
      for (const { p, l } of flick) p.intensity = l.i * (1 - l.flicker * 0.5 + Math.sin(t * 8 + l.p[0]) * l.flicker * 0.3 + Math.sin(t * 19 + l.p[2]) * l.flicker * 0.2);
      const cx = reduced ? 0 : px * 0.8, cy = reduced ? 0 : -py * 0.4;
      camera.position.set(cx, 3.1 + cy, 8.5);
      camera.lookAt(0, 1.4, 0);
      const me = figs.current.get(live.current.myId);
      if (me && live.current.canWalk) {
        // my own figure: keys or click-to-walk, sent to the others in the room
        const k = ctl.current.keys, c = ctl.current;
        let vx = 0, vz = 0;
        if (k.has('w') || k.has('arrowup')) vz -= 1;
        if (k.has('s') || k.has('arrowdown')) vz += 1;
        if (k.has('a') || k.has('arrowleft')) vx -= 1;
        if (k.has('d') || k.has('arrowright')) vx += 1;
        if (vx || vz) { c.target = null; const l = Math.hypot(vx, vz); me.tx = Math.max(-HALF_W, Math.min(HALF_W, me.x + (vx / l) * SPEED * dt)); me.tz = Math.max(Z_MIN, Math.min(Z_MAX, me.z + (vz / l) * SPEED * dt)); }
        else if (c.target) { me.tx = c.target.x; me.tz = c.target.z; if (Math.hypot(me.tx - me.x, me.tz - me.z) < 0.05) c.target = null; }
        me.mine = true;
        const moving = Math.hypot(me.tx - me.x, me.tz - me.z) > 0.03;
        const now = performance.now();
        if ((moving && now - c.lastSent > 110) || (!moving && !c.still)) {
          c.lastSent = now; c.still = !moving;
          socket.emit('action', { type: 'walk', x: me.tx, z: me.tz, ry: me.fig.rotation.y });
        }
      }
      for (const [id, f] of figs.current) {
        const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz);
        let moved = 0;
        if (d > 0.02) { const step = Math.min(d, SPEED * dt); f.x += (dx / d) * step; f.z += (dz / d) * step; moved = step; }
        f.fig.position.set(f.x, 0, f.z);
        // walk facing the way they go; once there, keep the direction they last faced (or face the room)
        if (moved > 0.001) f.ry = Math.atan2(dx, dz);
        f.fig.rotation.y = f.ry ?? Math.atan2(-f.x * 0.6, -f.z + 6);
        f.walk += ((moved > 0.001 ? 1 : 0) - f.walk) * Math.min(1, dt * 10);
        f.stride += dt * 9 * f.walk;
        f.fig.userData.walk = f.walk; f.fig.userData.stride = f.stride;
        f.fig.userData.animate?.(t);
        const speaking = live.current.speaking.includes(id);
        f.ring.visible = speaking;
      }
      renderer.render(scene, camera);
      labels.render(scene, camera);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      stage.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onClick);
      removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp); removeEventListener('blur', onBlur);
      for (const f of figs.current.values()) disposeCharacter(f.fig);
      figs.current.clear();
      sceneRef.current = null;
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) { if (!Object.values(MAT).includes(mat as THREE.MeshStandardMaterial)) { (mat as THREE.MeshStandardMaterial).map?.dispose(); mat.dispose(); } }
      });
      tex.dispose();
      renderer.dispose();
      mount.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art]);

  // ---------------- occupants: gather around the centrepiece; newcomers walk in from the side
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const map = figs.current;
    const ids = new Set(occupants.map(o => o.id));
    for (const [id, f] of map) if (!ids.has(id)) { scene.remove(f.fig); f.labelEl.remove(); f.bubbleEl.remove(); disposeCharacter(f.fig); map.delete(id); }
    const n = occupants.length;
    occupants.forEach((o, i) => {
      // spread across the front half of a circle around the centre so nobody hides behind the props
      const a = n === 1 ? 0.5 : -1.35 + (2.7 * i) / Math.max(1, n - 1);
      const tx = Math.sin(a) * look.ring, tz = Math.cos(a) * look.ring * 0.75 + 0.4;
      const key = JSON.stringify(o.avatar) + (o.alive ? '' : ':ghost');
      let f = map.get(o.id);
      if (!f || f.key !== key) {
        const fresh = !f;
        if (f) { scene.remove(f.fig); f.labelEl.remove(); f.bubbleEl.remove(); disposeCharacter(f.fig); }
        const fig = buildCharacter(o.avatar, { ghost: !o.alive });
        fig.userData.figureId = o.id;
        const labelEl = document.createElement('div');
        const label = new CSS2DObject(labelEl);
        label.position.set(0, CHARACTER_HEIGHT + 0.3, 0);
        fig.add(label);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.52, 32), new THREE.MeshBasicMaterial({ color: '#ffcf6b', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.visible = false;
        fig.add(ring);
        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'emote-bubble three';
        const bubble = new CSS2DObject(bubbleEl);
        bubble.position.set(0, CHARACTER_HEIGHT + 0.85, 0);
        fig.add(bubble);
        scene.add(fig);
        // newcomers enter from the side door (left for even seats, right for odd), others keep their spot
        const sx = fresh ? (i % 2 ? 6.5 : -6.5) : (f?.x ?? tx), sz = fresh ? 2.5 : (f?.z ?? tz);
        f = { fig, key, labelEl, bubbleEl, ring, x: sx, z: sz, tx, tz, walk: 0, stride: 0 };
        map.set(o.id, f);
      }
      // a walked-to position wins over the default spot (my own figure is steered locally)
      if (o.id !== myId || !canWalk) {
        if (o.pos) { f.tx = o.pos.x; f.tz = o.pos.z; f.ry = o.pos.ry; } else { f.tx = tx; f.tz = tz; f.ry = undefined; }
      } else if (!f.mine) { f.tx = o.pos?.x ?? tx; f.tz = o.pos?.z ?? tz; }
      setLabel(f.labelEl, o, o.id === myId);
    });
  }, [occupants, myId, look.ring, canWalk]);

  // live positions of the others in this room
  useEffect(() => {
    const onPos = (d: { id: string; x: number; z: number; ry: number; room?: string }) => {
      if (!d.room || d.room === 'square' || d.id === live.current.myId) return;
      const f = figs.current.get(d.id);
      if (f) { f.tx = d.x; f.tz = d.z; f.ry = d.ry; }
    };
    socket.on('pos', onPos);
    return () => { socket.off('pos', onPos); };
  }, []);

  // gestures: animate the figure and float the emoji above it
  useEffect(() => onEmote(e => {
    const f = figs.current.get(e.id);
    if (!f) return;
    playGesture(f.fig, e.kind);
    const el = f.bubbleEl, icon = EMOTE_ICON[e.kind] ?? '';
    el.textContent = icon;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    setTimeout(() => { if (el.textContent === icon) el.textContent = ''; }, EMOTE_MS);
  }), []);

  return <>
    <div ref={mountRef} className="room3d" />
    {canWalk && <div className="walk-help room"><span>Click the floor or use WASD to walk around the room</span></div>}
  </>;
}

