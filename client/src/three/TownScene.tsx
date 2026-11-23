// 3D Town Square: a procedurally built low-poly gothic town (plaza, clocktower and
// eight buildings) rendered with Three.js BEHIND the existing HTML seat circle.
// It is decoration only: all game interaction still goes through the 2D UI on top.
// The camera is aligned so the 3D plaza sits exactly under the seat circle.
import { useEffect, useRef, useState } from 'react';
import { socket, pushAlert } from '../net';
import { useVoice } from '../voice';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { RoomView } from '../../../shared/types';
import { ROOM_NAMES, ROOM_ICONS } from '../../../shared/characters';

import { PITCH, SEAT_R, ST_Z, CHAR_SCALE, QUALITY, getQuality, pixelRatioFor } from './support';
import { buildCharacter, disposeCharacter, setAsleep, playGesture, CHARACTER_HEIGHT } from './character';
import type { PublicPlayer, Avatar, WalkPos, NominationView, Weather } from '../../../shared/types';
import { thunder, setRain } from '../sound';
import { onEmote, EMOTE_ICON, EMOTE_MS } from '../emotes';
import { Joystick, touchDevice } from './Joystick';
const PLAZA_R = 10.2;
const BUILDING_R = 14.2;
const FOV = 32;

interface Props {
  anchor: React.RefObject<HTMLElement | null>;    // the seat-circle element
  container: React.RefObject<HTMLElement | null>; // the scrolling stage element
  seatRadiusFrac: number;                         // seat radius as a fraction of the circle's width
  night: boolean;
  rooms: RoomView[];
  players: PublicPlayer[];
  storyteller: { name: string; avatar: Avatar; location: string | null; pos: WalkPos | null };
  /** Ids shown standing at night (woken players); everyone else lies asleep. */
  awakeIds: string[];
  reducedMotion: boolean;
  onFail: () => void;
  /** 'st' or the viewer's player id. */
  myId: string;
  /** Free walking is allowed right now and the viewer is in the Town Square. */
  canWalk: boolean;
  onFigureClick: (id: string) => void;
  onEnterRoom: (roomId: string) => void;
  /** The location the viewer just came from (to step out of that building's door). */
  arrivedFrom: string | null;
  /** The nomination being voted on (hands go up on the figures; the clock hand points at the voter). */
  nomination: NominationView | null;
  voting: boolean;
  /** Sun position: 0 sunrise … 1 sunset, null at night (read every frame). */
  sun: () => number | null;
  /** Asleep at night: an empty, moonlit town seen from a camera slowly circling the clocktower. */
  sleepView?: boolean;
  /** Cosmetic weather chosen by the Storyteller. */
  weather?: Weather;
}

const WALK_SPEED = 5.2;      // world units per second
const WORLD_R = 21;          // how far from the centre anyone may walk
const DOOR_OFFSET = 3.4;     // door trigger point, from a building's centre toward the plaza
const DOOR_REACH = 1.1;      // how close you must be to a door to enter

interface Motion { x: number; z: number; ry: number; walk: number; stride: number; appearedAt: number; wasVisible: boolean }
interface FigEntry { fig: THREE.Group; key: string; label: CSS2DObject; labelEl: HTMLDivElement; ring: THREE.Mesh; mark: THREE.Mesh; bubble: CSS2DObject; bubbleEl: HTMLDivElement }

function setLabel(el: HTMLDivElement, p: { name: string; alive?: boolean; muted?: boolean; joining?: boolean; evilMark?: boolean; claim?: string }, mine: boolean) {
  el.className = `fig-label ${mine ? 'mine' : ''} ${p.alive === false ? 'dead' : ''}`;
  el.textContent = `${p.alive === false ? '👻 ' : ''}${p.name}${p.muted ? ' 🔇' : ''}${p.joining ? ' ⏳' : ''}`;
  if (p.evilMark) { const e = document.createElement('span'); e.className = 'evil-mark'; e.textContent = ' (evil)'; el.appendChild(e); }
  if (p.claim) { const c = document.createElement('div'); c.className = 'fig-claim'; c.textContent = `“${p.claim}”`; el.appendChild(c); }
}

// ------------------------------------------------------------ procedural textures
function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const cobbleTexture = () => canvasTexture(1024, (g, s) => {
  g.fillStyle = '#1b1820'; g.fillRect(0, 0, s, s);
  const cx = s / 2;
  for (let r = 18; r < s / 2; r += 26) {
    const n = Math.max(6, Math.floor((2 * Math.PI * r) / 30));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r * 0.013;
      const l = rand(34, 52);
      g.save();
      g.translate(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
      g.rotate(a + Math.PI / 2);
      g.fillStyle = `hsl(${rand(225, 260)}, 8%, ${l}%)`;
      g.beginPath();
      g.roundRect(-12, -10, rand(20, 26), rand(16, 20), 6);
      g.fill();
      g.restore();
    }
  }
  // worn centre + moonlit sheen
  const grd = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grd.addColorStop(0, 'rgba(220,230,255,0.10)'); grd.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
});

const stoneTexture = (hue = 250, light = 32) => canvasTexture(256, (g, s) => {
  g.fillStyle = `hsl(${hue}, 6%, ${light - 12}%)`; g.fillRect(0, 0, s, s);
  const rowH = 32;
  for (let y = 0; y < s; y += rowH) {
    const off = (y / rowH) % 2 ? 0 : 32;
    for (let x = -off; x < s; x += 64) {
      g.fillStyle = `hsl(${hue + rand(-8, 8)}, 7%, ${light + rand(-6, 6)}%)`;
      g.fillRect(x + 2, y + 2, 60, rowH - 4);
    }
  }
}, 1);

const plasterTexture = () => canvasTexture(256, (g, s) => {
  g.fillStyle = '#8f8068'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${rand(60, 140)},${rand(50, 110)},${rand(40, 80)},0.15)`; g.fillRect(rand(0, s), rand(0, s), 3, 3); }
});

const roofTexture = (color: string) => canvasTexture(256, (g, s) => {
  g.fillStyle = '#111'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 20) for (let x = (y / 20) % 2 ? -12 : 0; x < s; x += 24) {
    g.fillStyle = color; g.globalAlpha = rand(0.7, 1);
    g.beginPath(); g.roundRect(x + 1, y + 1, 22, 18, [0, 0, 8, 8]); g.fill();
  }
  g.globalAlpha = 1;
}, 2);

const clockFaceTexture = () => canvasTexture(256, (g, s) => {
  const c = s / 2;
  g.fillStyle = '#e9dcc0'; g.beginPath(); g.arc(c, c, c - 4, 0, Math.PI * 2); g.fill();
  g.lineWidth = 10; g.strokeStyle = '#5a1212'; g.stroke();
  g.fillStyle = '#2a1a12';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.save(); g.translate(c + Math.cos(a) * (c - 26), c + Math.sin(a) * (c - 26)); g.rotate(a);
    g.fillRect(-4, -12, 8, 24); g.restore();
  }
});

const bloodTexture = () => canvasTexture(128, (g, s) => {
  g.clearRect(0, 0, s, s);
  for (let i = 0; i < 6; i++) {
    const x = rand(10, s - 10), w = rand(3, 8), h = rand(s * 0.3, s);
    g.fillStyle = `rgba(${rand(110, 150)}, 10, 16, ${rand(0.7, 0.95)})`;
    g.fillRect(x, 0, w, h);
    g.beginPath(); g.arc(x + w / 2, h, w * 0.9, 0, Math.PI * 2); g.fill();
  }
});

// ------------------------------------------------------------ building kit
interface Kit {
  stone: THREE.Material; darkStone: THREE.Material; plaster: THREE.Material; timber: THREE.Material;
  slate: THREE.Material; redRoof: THREE.Material; wood: THREE.Material; iron: THREE.Material;
  warmGlow: THREE.Material; greenGlow: THREE.Material; redGlass: THREE.Material; blueGlass: THREE.Material;
  fireGlow: THREE.Material; bone: THREE.Material; leaf: THREE.Material;
}
function makeKit(): Kit {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  return {
    stone: std({ map: stoneTexture(250, 34) }),
    darkStone: std({ map: stoneTexture(260, 24) }),
    plaster: std({ map: plasterTexture() }),
    timber: std({ color: '#2b1c12' }),
    slate: std({ map: roofTexture('#2e3140') }),
    redRoof: std({ map: roofTexture('#5a2420') }),
    wood: std({ color: '#3d2a1a' }),
    iron: std({ color: '#1a1a1f', metalness: 0.6, roughness: 0.5 }),
    warmGlow: std({ color: '#ffb347', emissive: '#ff9a2e', emissiveIntensity: 1.6 }),
    greenGlow: std({ color: '#7dff9a', emissive: '#39d95c', emissiveIntensity: 1.8 }),
    redGlass: std({ color: '#c0262c', emissive: '#a3121a', emissiveIntensity: 1.4 }),
    blueGlass: std({ color: '#3a5fd0', emissive: '#2a46b0', emissiveIntensity: 1.2 }),
    fireGlow: std({ color: '#ff7a1a', emissive: '#ff5a00', emissiveIntensity: 2.2 }),
    bone: std({ color: '#7d7a80' }),
    leaf: std({ color: '#1c2a20' }),
  };
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent?.add(m);
  return m;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** Triangular prism roof spanning width w (along x) and depth d (along z), ridge height h. */
function gable(w: number, h: number, d: number, mat: THREE.Material, y: number, parent: THREE.Object3D) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.3, 0); shape.lineTo(w / 2 + 0.3, 0); shape.lineTo(0, h); shape.lineTo(-w / 2 - 0.3, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d + 0.6, bevelEnabled: false });
  g.translate(0, 0, -(d + 0.6) / 2);
  return mesh(g, mat, 0, y, 0, parent);
}
function pyramid(r: number, h: number, mat: THREE.Material, y: number, parent: THREE.Object3D, sides = 4) {
  const m = mesh(new THREE.ConeGeometry(r, h, sides), mat, 0, y + h / 2, 0, parent);
  if (sides === 4) m.rotation.y = Math.PI / 4;
  return m;
}
/** Arched door on the +z face. */
function door(k: Kit, w: number, h: number, z: number, parent: THREE.Object3D, y = 0) {
  mesh(box(w, h, 0.25), k.wood, 0, y + h / 2, z, parent);
  const arch = mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.25, 16, 1, false, 0, Math.PI), k.wood, 0, y + h, z, parent);
  arch.rotation.x = Math.PI / 2; arch.rotation.y = Math.PI / 2;
  mesh(box(w + 0.3, 0.15, 0.4), k.darkStone, 0, y + 0.07, z + 0.1, parent); // step
}
function windowAt(mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, w = 0.6, h = 0.9) {
  mesh(box(w, h, 0.1), mat, x, y, z, parent);
  mesh(box(w + 0.15, 0.1, 0.18), new THREE.MeshStandardMaterial({ color: '#1d140d' }), x, y - h / 2, z + 0.02, parent);
}
function lantern(k: Kit, x: number, y: number, z: number, parent: THREE.Object3D) {
  mesh(box(0.25, 0.35, 0.25), k.warmGlow, x, y, z, parent);
  mesh(new THREE.ConeGeometry(0.22, 0.2, 4), k.iron, x, y + 0.27, z, parent);
}

type Anim = (t: number) => void;

function buildTavern(k: Kit, anims: Anim[]) {
  const g = new THREE.Group();
  mesh(box(5.4, 2.8, 4.2), k.stone, 0, 1.4, 0, g);
  mesh(box(5.9, 2.6, 4.7), k.plaster, 0, 4.1, 0, g);
  for (const x of [-2.9, -1, 1, 2.9]) mesh(box(0.18, 2.6, 0.1), k.timber, x, 4.1, 2.4, g);
  mesh(box(5.9, 0.18, 0.12), k.timber, 0, 2.85, 2.4, g);
  mesh(box(5.9, 0.18, 0.12), k.timber, 0, 5.35, 2.4, g);
  gable(5.9, 2.4, 4.7, k.redRoof, 5.4, g);
  mesh(box(0.7, 2.4, 0.7), k.darkStone, 1.8, 7, -1, g);
  door(k, 1.1, 1.6, 2.15, g);
  for (const x of [-1.8, 1.8]) windowAt(k.warmGlow, x, 1.5, 2.16, g, 0.9, 0.8);
  for (const x of [-1.9, 0, 1.9]) windowAt(k.warmGlow, x, 4.2, 2.41, g, 0.6, 0.9);
  // hanging sign
  mesh(box(0.08, 0.08, 1.1), k.iron, -1.4, 2.9, 2.75, g);
  const sign = mesh(box(0.8, 0.6, 0.06), k.wood, -1.4, 2.45, 3.2, g);
  anims.push(t => { sign.rotation.x = Math.sin(t * 1.3) * 0.08; });
  return g;
}

function buildChapel(k: Kit) {
  const g = new THREE.Group();
  mesh(box(4.2, 4, 6.5), k.stone, 0, 2, -0.5, g);
  gable(4.2, 3, 6.5, k.slate, 4, g).position.z = -0.5;
  mesh(box(2.2, 7.5, 2.2), k.stone, 0, 3.75, 2.6, g);
  pyramid(1.7, 4.2, k.slate, 7.5, g).position.z = 2.6;
  mesh(new THREE.CircleGeometry(0.55, 20), k.redGlass, 0, 5.6, 3.72, g);
  for (const z of [-2.5, -0.5, 1.2]) for (const x of [-2.12, 2.12]) {
    const w = mesh(box(0.1, 1.6, 0.55), z === -0.5 ? k.redGlass : k.blueGlass, x, 2.3, z, g);
    w.scale.set(1, 1, 1);
  }
  door(k, 1, 1.9, 3.72, g);
  return g;
}

function buildGraveyard(k: Kit) {
  const g = new THREE.Group();
  // mausoleum
  mesh(box(3, 2.6, 2.6), k.darkStone, 0, 1.3, -1.6, g);
  gable(3, 1.2, 2.6, k.darkStone, 2.6, g).position.z = -1.6;
  for (const x of [-1.15, 1.15]) mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 8), k.bone, x, 1.3, -0.15, g);
  door(k, 0.9, 1.4, -0.28, g);
  // tombstones
  for (let i = 0; i < 9; i++) {
    const x = rand(-3, 3), z = rand(0.6, 3.4);
    const t = mesh(box(0.55, rand(0.6, 1.1), 0.18), k.bone, x, 0.4, z, g);
    t.rotation.set(rand(-0.12, 0.12), rand(-0.3, 0.3), rand(-0.12, 0.12));
  }
  // iron fence
  for (let i = -8; i <= 8; i++) mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4), k.iron, i * 0.4, 0.6, 4, g);
  mesh(box(6.6, 0.06, 0.06), k.iron, 0, 1.05, 4, g);
  // dead tree
  const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.25, 3.6, 6), k.timber, 2.6, 1.8, -0.3, g);
  trunk.rotation.z = 0.12;
  for (let i = 0; i < 4; i++) {
    const b = mesh(new THREE.CylinderGeometry(0.03, 0.08, 1.6, 4), k.timber, 2.6 + rand(-0.6, 0.6), rand(2.8, 3.6), -0.3 + rand(-0.4, 0.4), g);
    b.rotation.set(rand(-0.9, 0.9), 0, rand(-1.1, 1.1));
  }
  lantern(k, -1.6, 1.4, 4.1, g);
  return g;
}

function buildLibrary(k: Kit) {
  const g = new THREE.Group();
  mesh(box(7, 4.4, 4.6), k.stone, 0, 2.2, -0.3, g);
  mesh(box(7.4, 0.4, 5), k.darkStone, 0, 4.6, -0.3, g);
  gable(7.4, 1.6, 2.2, k.stone, 4.8, g).position.z = 1.4;
  mesh(box(7.4, 1.5, 3), k.slate, 0, 5.4, -1, g);
  for (const x of [-2.6, -1.3, 1.3, 2.6]) mesh(new THREE.CylinderGeometry(0.22, 0.25, 4.4, 10), k.bone, x, 2.2, 2.35, g);
  mesh(box(7.4, 0.3, 1.2), k.darkStone, 0, 0.15, 2.4, g);
  for (const x of [-2.6, -1.3, 1.3, 2.6]) windowAt(k.warmGlow, x, 2.4, 1.96, g, 0.55, 1.6);
  door(k, 1.2, 2, 1.96, g, 0.3);
  return g;
}

function buildApothecary(k: Kit, anims: Anim[]) {
  const g = new THREE.Group();
  mesh(box(3.2, 3, 3.4), k.stone, 0, 1.5, 0, g);
  const upper = mesh(box(3.5, 2.8, 3.7), k.plaster, 0, 4.4, 0, g);
  upper.rotation.z = 0.035;
  gable(3.5, 2.8, 3.7, k.slate, 5.8, g).rotation.z = 0.05;
  windowAt(k.greenGlow, -0.8, 1.5, 1.71, g, 1.0, 1.0);
  for (let i = 0; i < 4; i++) mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.28, 6), i % 2 ? k.greenGlow : k.redGlass, -1.15 + i * 0.24, 1.0, 1.8, g);
  windowAt(k.warmGlow, 0, 4.4, 1.86, g, 0.7, 0.9);
  door(k, 0.8, 1.6, 1.71, g);
  g.children.at(-3)!.position.x = 0.8; g.children.at(-2)!.position.x = 0.8; g.children.at(-1)!.position.x = 0.8;
  const sign = mesh(box(0.6, 0.5, 0.06), k.wood, 1.4, 3.1, 2.4, g);
  anims.push(t => { sign.rotation.x = Math.sin(t * 1.1 + 2) * 0.1; });
  return g;
}

function buildBlacksmith(k: Kit, anims: Anim[]) {
  const g = new THREE.Group();
  mesh(box(5, 2.8, 4), k.darkStone, 0, 1.4, -0.6, g);
  const roof = mesh(box(5.8, 0.25, 5), k.redRoof, 0, 3.1, 0, g);
  roof.rotation.x = -0.18;
  for (const x of [-2.6, 2.6]) mesh(box(0.25, 2.8, 0.25), k.timber, x, 1.4, 2.2, g);
  const chimney = mesh(box(1.2, 5.5, 1.2), k.stone, -1.6, 2.75, -1.6, g);
  void chimney;
  mesh(box(1.4, 1, 1.2), k.darkStone, -1.6, 0.7, 0.4, g);
  const coals = mesh(box(1, 0.2, 0.9), k.fireGlow, -1.6, 1.25, 0.4, g);
  // anvil
  mesh(box(0.5, 0.6, 0.4), k.iron, 1, 0.3, 1.3, g);
  mesh(box(1.1, 0.3, 0.45), k.iron, 1, 0.75, 1.3, g);
  const glow = new THREE.PointLight('#ff6a1a', 6, 9, 1.6);
  glow.position.set(-1.6, 1.8, 1.2);
  g.add(glow);
  anims.push(t => {
    const f = 0.75 + Math.sin(t * 9) * 0.12 + Math.sin(t * 23) * 0.08;
    glow.intensity = 6 * f;
    (coals.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2 * f;
  });
  return g;
}

function buildStairTower(k: Kit) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(1.6, 1.8, 8, 14), k.stone, 0, 4, 0, g);
  mesh(new THREE.ConeGeometry(2.1, 3, 14), k.slate, 0, 9.5, 0, g);
  for (let i = 0; i < 26; i++) {
    const a = i * 0.42, y = 0.3 + i * 0.28;
    const step = mesh(box(1, 0.14, 0.45), k.darkStone, Math.sin(a) * 2.15, y, Math.cos(a) * 2.15, g);
    step.rotation.y = a;
  }
  for (let i = 0; i < 4; i++) windowAt(k.warmGlow, 0, 2.2 + i * 1.6, 1.7, g, 0.18, 0.6);
  door(k, 0.9, 1.6, 1.72, g);
  return g;
}

function buildMill(k: Kit, anims: Anim[]) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(1.7, 2.5, 6.5, 8), k.plaster, 0, 3.25, 0, g);
  mesh(new THREE.ConeGeometry(2.2, 2.4, 8), k.redRoof, 0, 7.7, 0, g);
  const hub = new THREE.Group();
  hub.position.set(0, 6.4, 2.1);
  g.add(hub);
  mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 8), k.timber, 0, 0, 0, hub).rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i * Math.PI) / 2;
    hub.add(arm);
    mesh(box(0.15, 4.2, 0.1), k.timber, 0, 2.1, 0.1, arm);
    mesh(box(0.9, 3.4, 0.04), k.bone, 0.5, 2.4, 0.12, arm);
  }
  windowAt(k.warmGlow, 0, 3.6, 2.12, g, 0.5, 0.7);
  door(k, 1, 1.7, 2.35, g);
  anims.push(t => { hub.rotation.z = -t * 0.25; });
  return g;
}

function buildClocktower(k: Kit, anims: Anim[]) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.6, 8), k.darkStone, 0, 0.3, 0, g);
  mesh(box(3, 10, 3), k.stone, 0, 5.6, 0, g);
  mesh(box(3.4, 0.4, 3.4), k.darkStone, 0, 10.8, 0, g);
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) mesh(box(0.4, 2.4, 0.4), k.stone, x, 12.2, z, g);
  mesh(box(3.4, 0.4, 3.4), k.darkStone, 0, 13.5, 0, g);
  pyramid(2.6, 4.2, k.slate, 13.7, g);
  const faceMat = new THREE.MeshStandardMaterial({ map: clockFaceTexture(), emissive: '#e9dcc0', emissiveIntensity: 0.35 });
  const bloodMat = new THREE.MeshStandardMaterial({ map: bloodTexture(), transparent: true, depthWrite: false });
  const hands: { h: THREE.Object3D; m: THREE.Object3D }[] = [];
  for (let i = 0; i < 4; i++) {
    const side = new THREE.Group();
    side.rotation.y = (i * Math.PI) / 2;
    g.add(side);
    mesh(new THREE.CircleGeometry(1.15, 32), faceMat, 0, 8.6, 1.52, side);
    const drip = mesh(new THREE.PlaneGeometry(2, 3.2), bloodMat, 0, 6.2, 1.515, side);
    drip.castShadow = false;
    const h = new THREE.Group(); h.position.set(0, 8.6, 1.56); side.add(h);
    mesh(box(0.12, 0.6, 0.03), k.iron, 0, 0.3, 0, h);
    const m = new THREE.Group(); m.position.set(0, 8.6, 1.58); side.add(m);
    mesh(box(0.08, 0.9, 0.03), k.iron, 0, 0.45, 0, m);
    hands.push({ h, m });
  }
  door(k, 1.1, 1.8, 1.52, g, 0.6);
  anims.push(() => {
    const d = new Date();
    const min = d.getMinutes() + d.getSeconds() / 60;
    const hr = (d.getHours() % 12) + min / 60;
    for (const { h, m } of hands) { h.rotation.z = -(hr / 12) * Math.PI * 2; m.rotation.z = -(min / 60) * Math.PI * 2; }
  });
  return g;
}

function buildTree(k: Kit, x: number, z: number, parent: THREE.Object3D) {
  const s = rand(0.8, 1.3);
  mesh(new THREE.CylinderGeometry(0.15 * s, 0.25 * s, 1.6 * s, 6), k.timber, x, 0.8 * s, z, parent);
  mesh(new THREE.ConeGeometry(1.3 * s, 3.2 * s, 7), k.leaf, x, 2.9 * s, z, parent);
  mesh(new THREE.ConeGeometry(1 * s, 2.4 * s, 7), k.leaf, x, 4 * s, z, parent);
}

// deaths and executions, remembered for a few seconds so a scene that is just appearing can still show them
const RECENT_DEATHS: { id: string; execution: boolean; at: number }[] = [];
const remember = (id: string, execution: boolean) => {
  RECENT_DEATHS.push({ id, execution, at: performance.now() });
  while (RECENT_DEATHS.length && performance.now() - RECENT_DEATHS[0].at > 10_000) RECENT_DEATHS.shift();
};
socket.on('death', (d: { playerId: string }) => remember(d.playerId, false));
socket.on('execution', (d: { playerId: string }) => remember(d.playerId, true));

// ------------------------------------------------------------ the component
export default function TownScene(props: Props) {
  const { anchor, container, seatRadiusFrac, night, rooms, players, storyteller, awakeIds, reducedMotion, onFail, myId, canWalk, arrivedFrom } = props;
  const sceneRef = useRef<THREE.Scene | null>(null);
  const figuresRef = useRef(new Map<string, FigEntry>());
  const voice = useVoice();
  const [doorPrompt, setDoorPrompt] = useState<{ i: number; name: string } | null>(null);
  // everything the render loop needs, refreshed on every React render
  const live = useRef({ props, speaking: voice.speaking as string[] });
  live.current = { props, speaking: voice.speaking };
  const motionRef = useRef(new Map<string, Motion>());
  const remotePos = useRef(new Map<string, WalkPos>());
  const ctrl = useRef({ joy: { x: 0, y: 0 }, keys: new Set<string>(), target: null as { x: number; z: number } | null, door: null as number | null, lastSent: 0, sentStill: true, nearDoor: null as number | null });
  const worldRef = useRef<{ doors: { x: number; z: number }[]; colliders: { x: number; z: number; r: number }[]; buildings: THREE.Object3D[] } | null>(null);
  const enterRef = useRef<(i: number) => void>(() => {});
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ night, rooms, reducedMotion });
  stateRef.current = { night, rooms, reducedMotion };
  const labelsRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: QUALITY[getQuality()].antialias, alpha: false, powerPreference: 'low-power' });
    } catch {
      onFail();
      return;
    }
    const Q = QUALITY[getQuality()];
    renderer.setPixelRatio(pixelRatioFor(getQuality()));
    renderer.shadowMap.enabled = Q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    mount.appendChild(renderer.domElement);
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = 'town3d-labels';
    mount.appendChild(labelRenderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const sky = new THREE.Color('#0b0c1a');
    scene.background = sky;
    scene.fog = new THREE.FogExp2('#12131f', 0.009);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 400);

    const k = makeKit();
    const anims: Anim[] = [];

    // ground + plaza
    const ground = mesh(new THREE.CircleGeometry(90, 48), new THREE.MeshStandardMaterial({ color: '#141a16', roughness: 1 }), 0, -0.02, 0, scene);
    ground.rotation.x = -Math.PI / 2;
    const plaza = mesh(new THREE.CircleGeometry(PLAZA_R, 64), new THREE.MeshStandardMaterial({ map: cobbleTexture(), roughness: 0.85 }), 0, 0, 0, scene);
    plaza.rotation.x = -Math.PI / 2;
    const rim = mesh(new THREE.TorusGeometry(PLAZA_R, 0.25, 6, 64), k.darkStone, 0, 0.05, 0, scene);
    rim.rotation.x = -Math.PI / 2;

    // centre clocktower
    const tower = buildClocktower(k, anims);
    tower.scale.setScalar(0.5);
    scene.add(tower);

    // buildings around the plaza, doors facing the centre
    const builders = [buildTavern, buildChapel, buildGraveyard, buildLibrary, buildApothecary, buildBlacksmith, buildStairTower, buildMill];
    const labelObjs: CSS2DObject[] = [];
    const doors: { x: number; z: number }[] = [];
    const colliders: { x: number; z: number; r: number }[] = [{ x: 0, z: 0, r: 1.9 }];
    const buildingGroups: THREE.Object3D[] = [];
    builders.forEach((build, i) => {
      // index 0 at the back (top of the screen), then alternating left/right toward the front
      const a = Math.PI + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 4) + (i === 0 ? 0 : 0);
      const grp = build(k, anims);
      grp.scale.setScalar(0.72);
      grp.position.set(Math.sin(a) * BUILDING_R, 0, Math.cos(a) * BUILDING_R);
      grp.lookAt(0, 0, 0);
      scene.add(grp);
      grp.userData.buildingIndex = i;
      buildingGroups.push(grp);
      doors.push({ x: Math.sin(a) * (BUILDING_R - DOOR_OFFSET), z: Math.cos(a) * (BUILDING_R - DOOR_OFFSET) });
      colliders.push({ x: grp.position.x, z: grp.position.z, r: 3.0 });
      // path from plaza to the door
      const path = mesh(new THREE.PlaneGeometry(2, BUILDING_R - PLAZA_R - 2), new THREE.MeshStandardMaterial({ map: cobbleTexture(), roughness: 1, color: '#9a94a8' }), Math.sin(a) * (PLAZA_R + (BUILDING_R - PLAZA_R) / 2 - 1), 0.01, Math.cos(a) * (PLAZA_R + (BUILDING_R - PLAZA_R) / 2 - 1), scene);
      path.rotation.x = -Math.PI / 2; path.rotation.z = a;
      // lamp post at the path entrance
      const lx = Math.sin(a + 0.2) * (PLAZA_R + 0.8), lz = Math.cos(a + 0.2) * (PLAZA_R + 0.8);
      mesh(new THREE.CylinderGeometry(0.07, 0.1, 3, 6), k.iron, lx, 1.5, lz, scene);
      lantern(k, lx, 3.1, lz, scene);
      // floating label
      const el = document.createElement('div');
      el.className = 'town3d-label';
      labelsRef.current[i] = el;
      // building labels are clickable too: walk to that door and go in
      el.addEventListener('click', () => {
        const P = live.current.props;
        if (!(P.canWalk && !P.night)) return;
        ctrl.current.target = { ...doors[i] }; ctrl.current.door = i;
      });
      const obj = new CSS2DObject(el);
      obj.position.set(grp.position.x, 8.2, grp.position.z);
      scene.add(obj);
      labelObjs.push(obj);
    });

    worldRef.current = { doors, colliders, buildings: buildingGroups };

    // voting: an iron clock hand on the cobbles sweeps to whoever's vote is being counted,
    // and a pale beam of light falls on them
    const handGrp = new THREE.Group();
    const handShape = new THREE.Shape();
    handShape.moveTo(-0.22, 0); handShape.lineTo(0.22, 0); handShape.lineTo(0.12, SEAT_R - 2.6); handShape.lineTo(0.5, SEAT_R - 2.6);
    handShape.lineTo(0, SEAT_R - 1.5); handShape.lineTo(-0.5, SEAT_R - 2.6); handShape.lineTo(-0.12, SEAT_R - 2.6); handShape.lineTo(-0.22, 0);
    const handMesh = mesh(new THREE.ExtrudeGeometry(handShape, { depth: 0.08, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: '#c9a15b', metalness: 0.7, roughness: 0.35, emissive: '#5a3a10', emissiveIntensity: 0.6 }), 0, 0.06, 0, handGrp);
    handMesh.rotation.x = Math.PI / 2; // lie flat, pointing along +z
    handMesh.position.z = 1.2;
    handGrp.visible = false;
    scene.add(handGrp);
    const beam = mesh(new THREE.CylinderGeometry(0.9, 1.5, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe7a8', transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, fog: false }), 0, 7, 0, scene);
    beam.castShadow = false; beam.receiveShadow = false; beam.visible = false;
    let handAngle: number | null = null;

    // ---- death scene: a beam of pale light, spirit wisps rising, and a ring spreading on the cobbles
    const effects: { group: THREE.Group; t0: number; dur: number; update: (k: number) => void }[] = [];
    const spawnDeath = (id: string, execution: boolean): boolean => {
      const f = figuresRef.current.get(id);
      if (!f || !f.fig.visible) return false;
      const { x, z } = f.fig.position;
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      scene.add(group);
      const col = execution ? '#ff4a4a' : '#cfe0ff';
      const beamMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 18, 24, 1, true), beamMat);
      beam.position.y = 9;
      group.add(beam);
      const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 40), ringMat);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
      group.add(ring);
      const N = 60, pos = new Float32Array(N * 3), speed: number[] = [];
      for (let i = 0; i < N; i++) { const a = rand(0, Math.PI * 2), r = rand(0, 0.8); pos.set([Math.cos(a) * r, rand(0, 1.5), Math.sin(a) * r], i * 3); speed.push(rand(1.5, 4)); }
      const wispGeo = new THREE.BufferGeometry();
      wispGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const wispMat = new THREE.PointsMaterial({ color: execution ? '#ffb0b0' : '#e8f0ff', size: 0.35, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      group.add(new THREE.Points(wispGeo, wispMat));
      let last = 0;
      effects.push({
        group, t0: performance.now(), dur: 4200,
        update: k => {
          const dt = Math.max(0, k - last) * 4.2; last = k;
          beamMat.opacity = Math.sin(Math.min(1, k * 2.2) * Math.PI) * 0.65 * (1 - k * 0.4);
          ring.scale.setScalar(1 + k * 6);
          ringMat.opacity = 0.9 * (1 - k);
          for (let i = 0; i < N; i++) { pos[i * 3 + 1] += speed[i] * dt; pos[i * 3] += Math.sin(k * 9 + i) * 0.01; }
          wispGeo.attributes.position.needsUpdate = true;
          wispMat.opacity = 1 - k;
        },
      });
      return true;
    };
    const shown = new Set<object>();
    const stepEffects = () => {
      const now = performance.now();
      // deaths that just happened: wait (up to 4 s) for the figure to be on screen, e.g. at dawn
      for (const r of RECENT_DEATHS) {
        if (shown.has(r) || now - r.at > 4000) continue;
        const dupe = !r.execution && RECENT_DEATHS.some(o => o.execution && o.id === r.id && Math.abs(o.at - r.at) < 1500);
        if (dupe || spawnDeath(r.id, r.execution)) shown.add(r);
      }
      for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i], k = (now - e.t0) / e.dur;
        if (k >= 1) {
          scene.remove(e.group);
          e.group.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.(); });
          effects.splice(i, 1);
        } else e.update(k);
      }
    };
    const stepVote = (dt: number) => {
      const P = live.current.props, nom = P.nomination;
      const cur = P.voting && nom && !nom.done ? nom.order[nom.voteIndex] : null;
      const f = cur ? figuresRef.current.get(cur) : undefined;
      if (!cur || !f) { handGrp.visible = false; beam.visible = false; handAngle = null; return; }
      const target = Math.atan2(f.fig.position.x, f.fig.position.z);
      if (handAngle === null) handAngle = target;
      let d = target - handAngle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      handAngle += d * Math.min(1, dt * 6);
      handGrp.rotation.y = handAngle;
      handGrp.visible = true;
      beam.visible = true;
      beam.position.set(f.fig.position.x, 7, f.fig.position.z);
    };

    // trees between buildings
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.PI / 8;
      buildTree(k, Math.sin(a) * rand(19, 25), Math.cos(a) * rand(19, 25), scene);
    }

    // moon, stars
    const moon = mesh(new THREE.SphereGeometry(4, 24, 16), new THREE.MeshBasicMaterial({ color: '#e8eefc', transparent: true, fog: false }), -40, 55, -95, scene);
    moon.castShadow = false;
    const sunMat = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, fog: false });
    const sunDisc = mesh(new THREE.SphereGeometry(6, 24, 16), sunMat, 0, 0, -150, scene);
    sunDisc.castShadow = false;
    const starGeo = new THREE.BufferGeometry();
    const stars = new Float32Array(900);
    for (let i = 0; i < 300; i++) {
      const a = rand(0, Math.PI * 2), e = rand(0.15, 1.2), r = 160;
      stars.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    const starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.8, sizeAttenuation: true, fog: false, transparent: true });

    // ---- weather: rain streaks and snowflakes falling in a box around the plaza
    const W_HALF = 30, W_TOP = 26;
    const RAIN_N = Math.round(1800 * Q.particles), SNOW_N = Math.round(1400 * Q.particles);
    const rainPos = new Float32Array(RAIN_N * 6);
    for (let i = 0; i < RAIN_N; i++) { const x = rand(-W_HALF, W_HALF), y = rand(0, W_TOP), z = rand(-W_HALF, W_HALF); rainPos.set([x, y, z, x + 0.08, y + 0.9, z + 0.03], i * 6); }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#aab8d8', transparent: true, opacity: 0.45, depthWrite: false }));
    rain.frustumCulled = false; rain.visible = false;
    scene.add(rain);
    const snowPos = new Float32Array(SNOW_N * 3);
    for (let i = 0; i < SNOW_N; i++) snowPos.set([rand(-W_HALF, W_HALF), rand(0, W_TOP), rand(-W_HALF, W_HALF)], i * 3);
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: '#f4f7ff', size: 0.28, transparent: true, opacity: 0.9, depthWrite: false }));
    snow.frustumCulled = false; snow.visible = false;
    scene.add(snow);
    let flash = 0, nextBolt = 4;
    const weatherStep = (w: Weather, dt: number, t: number) => {
      const wet = w === 'rain' || w === 'storm';
      rain.visible = wet; snow.visible = w === 'snow';
      if (wet) {
        const fall = (w === 'storm' ? 34 : 24) * dt, drift = (w === 'storm' ? 6 : 2) * dt;
        for (let i = 0; i < RAIN_N; i++) {
          const o = i * 6;
          let y = rainPos[o + 1] - fall, x = rainPos[o] + drift;
          if (y < 0) { y += W_TOP; x = rand(-W_HALF, W_HALF); rainPos[o + 2] = rand(-W_HALF, W_HALF); rainPos[o + 5] = rainPos[o + 2] + 0.03; }
          if (x > W_HALF) x -= 2 * W_HALF;
          rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 3] = x + (w === 'storm' ? 0.25 : 0.08); rainPos[o + 4] = y + 0.9;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      if (w === 'snow') {
        for (let i = 0; i < SNOW_N; i++) {
          const o = i * 3;
          snowPos[o + 1] -= 1.6 * dt;
          snowPos[o] += Math.sin(t * 0.7 + i) * 0.4 * dt;
          if (snowPos[o + 1] < 0) { snowPos[o + 1] += W_TOP; snowPos[o] = rand(-W_HALF, W_HALF); snowPos[o + 2] = rand(-W_HALF, W_HALF); }
        }
        snowGeo.attributes.position.needsUpdate = true;
      }
      // storms: now and then a lightning flash, with thunder a moment later
      if (w === 'storm') {
        nextBolt -= dt;
        if (nextBolt <= 0) { flash = 1; nextBolt = rand(7, 18); setTimeout(() => thunder(), rand(300, 1600)); }
      }
      flash = Math.max(0, flash - dt * 2.5);
      return flash > 0 ? (flash > 0.7 || (flash > 0.35 && flash < 0.5) ? flash : 0) : 0;
    };
    scene.add(new THREE.Points(starGeo, starMat));

    // lights
    const hemi = new THREE.HemisphereLight('#6f7fb8', '#1a1410', 0.9);
    scene.add(hemi);
    const moonLight = new THREE.DirectionalLight('#b9c6ff', 1.6);
    moonLight.position.set(-30, 45, -25);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
    Object.assign(moonLight.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
    scene.add(moonLight);
    const warm = new THREE.PointLight('#ffb347', 30, 26, 1.6);
    warm.position.set(0, 4, 0);
    scene.add(warm);

    // sizing + camera alignment with the HTML seat circle
    let yaw = 0;
    const sleeping = !!props.sleepView;
    if (sleeping) labelRenderer.domElement.style.display = 'none'; // no labels, nothing to click
    const align = () => {
      const stage = container.current, a = anchor.current;
      if (stage && sleeping) {
        const W = stage.clientWidth, H = stage.clientHeight;
        mount.style.height = `${H}px`;
        renderer.setSize(W, H, false);
        renderer.domElement.style.width = `${W}px`;
        renderer.domElement.style.height = `${H}px`;
        camera.aspect = W / H;
        camera.clearViewOffset();
        camera.updateProjectionMatrix();
        return;
      }
      if (!stage || !a) return;
      const W = stage.clientWidth;
      const H = Math.max(stage.clientHeight, stage.scrollHeight);
      mount.style.height = `${H}px`;
      renderer.setSize(W, H, false);
      renderer.domElement.style.width = `${W}px`;
      renderer.domElement.style.height = `${H}px`;
      labelRenderer.setSize(W, H);
      camera.aspect = W / H;
      const cx = a.offsetLeft + a.offsetWidth / 2;
      const cy = a.offsetTop + a.offsetHeight / 2;
      const seatPx = Math.max(60, seatRadiusFrac * a.offsetWidth);
      const dist = (SEAT_R * H) / (2 * seatPx * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
      camera.userData.dist = dist;
      camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
      camera.updateProjectionMatrix();
    };
    const placeCamera = () => {
      if (sleeping) {
        // slow orbit around the clocktower, a little lower and wider than the day view
        const d = 50, el = (30 * Math.PI) / 180;
        camera.position.set(Math.sin(yaw) * d * Math.cos(el), 4 + d * Math.sin(el), Math.cos(yaw) * d * Math.cos(el));
        camera.lookAt(0, 3, 0);
        return;
      }
      const d = camera.userData.dist ?? 60;
      camera.position.set(Math.sin(yaw) * d * Math.cos(PITCH), d * Math.sin(PITCH), Math.cos(yaw) * d * Math.cos(PITCH));
      camera.lookAt(0, 0, 0);
    };
    align();
    const ro = new ResizeObserver(align);
    if (container.current) ro.observe(container.current);
    if (anchor.current) ro.observe(anchor.current);

    // ---------------- walking: local control, remote interpolation, doors, clicks
    const raycaster = new THREE.Raycaster();
    const seatOf = (id: string) => {
      if (id === 'st') return { x: 0, z: ST_Z };
      const ps = live.current.props.players;
      const i = ps.findIndex(p => p.id === id), n = ps.length;
      const a = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(a) * SEAT_R, z: Math.sin(a) * SEAT_R };
    };
    const pushOut = (x: number, z: number) => {
      for (const c of colliders) {
        const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
        if (d < c.r && d > 1e-4) { x = c.x + (dx / d) * c.r; z = c.z + (dz / d) * c.r; }
      }
      const d = Math.hypot(x, z);
      if (d > WORLD_R) { x = (x / d) * WORLD_R; z = (z / d) * WORLD_R; }
      return { x, z };
    };
    const sendWalk = (m: Motion, force = false) => {
      const now = performance.now(), c = ctrl.current;
      if (!force && now - c.lastSent < 110) return;
      c.lastSent = now;
      socket.emit('action', { type: 'walk', x: m.x, z: m.z, ry: m.ry });
    };
    const enter = (i: number) => {
      const P = live.current.props;
      const roomId = `r${i}`;
      if (!P.rooms.some(r => r.id === roomId)) { pushAlert(`${ROOM_NAMES[i]} is closed in this game.`, 'error'); return; }
      P.onEnterRoom(roomId);
    };
    enterRef.current = enter;
    const stepFigures = (dt: number, t: number, reduced: boolean) => {
      dt = Math.min(dt, 0.25); // keep walking speed right even on slow machines
      const P = live.current.props, c = ctrl.current;
      const walkMode = P.canWalk && !P.night;
      for (const [id, { fig, label, ring, bubble, bubbleEl }] of figuresRef.current) {
        const seat = seatOf(id);
        let m = motionRef.current.get(id);
        if (!m) { m = { x: seat.x, z: seat.z, ry: 0, walk: 0, stride: 0, appearedAt: t, wasVisible: false }; motionRef.current.set(id, m); }
        const visible = fig.visible;
        if (visible && !m.wasVisible) m.appearedAt = t;
        m.wasVisible = visible;
        const asleep = !!fig.userData.asleep;
        let moved = 0;
        if (id === P.myId && walkMode && visible) {
          // -- my own figure: keyboard or click-to-walk, with collisions
          let vx = 0, vz = 0;
          const k = c.keys;
          if (k.has('w') || k.has('arrowup')) vz -= 1;
          if (k.has('s') || k.has('arrowdown')) vz += 1;
          if (k.has('a') || k.has('arrowleft')) vx -= 1;
          if (k.has('d') || k.has('arrowright')) vx += 1;
          let speed = WALK_SPEED;
          const joy = c.joy, jl = Math.hypot(joy.x, joy.y);
          if (jl > 0.15 && !vx && !vz) { vx = joy.x; vz = joy.y; speed = WALK_SPEED * Math.min(1, jl); }
          if (vx || vz) { c.target = null; c.door = null; const l = Math.hypot(vx, vz); vx /= l; vz /= l; }
          else if (c.target) {
            const dx = c.target.x - m.x, dz = c.target.z - m.z, d = Math.hypot(dx, dz);
            if (d < 0.12) c.target = null; else { vx = dx / d; vz = dz / d; speed = Math.min(WALK_SPEED, d / dt); }
          }
          if (vx || vz) {
            const np = pushOut(m.x + vx * speed * dt, m.z + vz * speed * dt);
            moved = Math.hypot(np.x - m.x, np.z - m.z);
            m.x = np.x; m.z = np.z; m.ry = Math.atan2(vx, vz);
            if (c.target && moved < 0.003) c.target = null; // walked into a wall
            sendWalk(m); c.sentStill = false;
          } else if (!c.sentStill) { sendWalk(m, true); c.sentStill = true; }
          let near: number | null = null;
          doors.forEach((d, i) => { if (Math.hypot(d.x - m!.x, d.z - m!.z) < DOOR_REACH) near = i; });
          if (c.door !== null && near === c.door && !c.target) { const i = c.door; c.door = null; enter(i); }
          if (near !== c.nearDoor) { c.nearDoor = near; setDoorPrompt(near === null ? null : { i: near, name: ROOM_NAMES[near] }); }
        } else {
          // -- everyone else (and me while seats matter): live position, else the seat
          const rp = !P.night && !asleep ? remotePos.current.get(id) : undefined;
          const tx = rp ? rp.x : seat.x, tz = rp ? rp.z : seat.z;
          const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
          if (asleep || t - m.appearedAt < 0.6 || d > 12) { m.x = tx; m.z = tz; }
          else if (d > 0.02) {
            const step = Math.min(d, WALK_SPEED * 1.15 * dt);
            m.x += (dx / d) * step; m.z += (dz / d) * step; moved = step;
            if (d > 0.1) m.ry = Math.atan2(dx, dz);
          }
          if (moved < 0.001) {
            if (rp) m.ry = rp.ry;
            else { const fx = m.x * 0.35, fz = m.z * 0.35 + 14; m.ry = Math.atan2(fx - m.x, fz - m.z); }
          }
          if (id === P.myId && c.nearDoor !== null) { c.nearDoor = null; setDoorPrompt(null); }
        }
        fig.position.set(m.x, 0, m.z);
        fig.rotation.y = m.ry;
        m.walk += ((moved > 0.001 ? 1 : 0) - m.walk) * Math.min(1, dt * 10);
        m.stride += dt * 9 * m.walk;
        fig.userData.walk = m.walk;
        fig.userData.stride = m.stride;
        if (visible) fig.userData.animate?.(t); // always: raised hands and gestures must show even with reduced motion
        label.visible = visible && walkMode; // in seat mode the HTML seats show names
        bubble.visible = visible && walkMode && !!bubbleEl.textContent; // in seat mode the HTML seats show gestures
        const speaking = live.current.speaking.includes(id);
        ring.visible = visible && (speaking || (id === P.myId && walkMode));
        (ring.material as THREE.MeshBasicMaterial).opacity = speaking ? 0.95 : 0.35;
      }
    };
    // clicks: a figure (Storyteller tools), a building (walk to its door and go in), or the ground (walk there)
    const el = renderer.domElement;
    const onPointer = (e: PointerEvent) => {
      const P = live.current.props;
      const rect = el.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
      const figs = [...figuresRef.current.values()].filter(f => f.fig.visible).map(f => f.fig);
      const hitFig = raycaster.intersectObjects(figs, true)[0];
      if (hitFig) {
        let o: THREE.Object3D | null = hitFig.object;
        while (o && o.userData.figureId === undefined) o = o.parent;
        if (o && o.userData.figureId !== P.myId) { P.onFigureClick(o.userData.figureId); return; }
      }
      if (!(P.canWalk && !P.night)) return;
      const hitB = raycaster.intersectObjects(buildingGroups, true)[0];
      if (hitB) {
        let o: THREE.Object3D | null = hitB.object;
        while (o && o.userData.buildingIndex === undefined) o = o.parent;
        if (o) { const i = o.userData.buildingIndex as number; ctrl.current.target = { ...doors[i] }; ctrl.current.door = i; return; }
      }
      const pt = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) {
        // a click just in front of a door counts as choosing that building
        const i = doors.findIndex(d => Math.hypot(d.x - pt.x, d.z - pt.z) < 2);
        if (i >= 0) { ctrl.current.target = { ...doors[i] }; ctrl.current.door = i; return; }
        ctrl.current.target = { x: pt.x, z: pt.z }; ctrl.current.door = null;
      }
    };
    el.addEventListener('pointerdown', onPointer);
    const typing = (e: KeyboardEvent) => /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e) || !(live.current.props.canWalk && !live.current.props.night)) return;
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) { ctrl.current.keys.add(key); e.preventDefault(); }
      if (key === 'e' && ctrl.current.nearDoor !== null) enter(ctrl.current.nearDoor);
    };
    const onKeyUp = (e: KeyboardEvent) => ctrl.current.keys.delete(e.key.toLowerCase());
    const onBlur = () => ctrl.current.keys.clear();
    addEventListener('keydown', onKeyDown);
    addEventListener('keyup', onKeyUp);
    addEventListener('blur', onBlur);

    // day/night blend
    let nightMix = stateRef.current.night ? 1 : 0;
    const nightFog = new THREE.Color('#07070f'), nightSky = new THREE.Color('#05050c');
    // daylight palette: low sun (dawn/dusk) → high sun (noon). Overcast and muted: it is still a gothic town.
    const C = (h: string) => new THREE.Color(h);
    const skyC = { low: C('#7a3f45'), high: C('#7d8fae') }, fogC = { low: C('#4a2c36'), high: C('#6c7a94') };
    const sunCol = { low: C('#ff7a3a'), high: C('#fff0d8') }, moonCol = C('#b9c6ff');
    const hemiDay = C('#c4cfe8'), hemiNight = C('#6f7fb8');
    const nightPos = new THREE.Vector3(-30, 45, -25), sunPos = new THREE.Vector3();
    const tmp = new THREE.Color(), tmp2 = new THREE.Color();
    let sunSm = live.current.props.sun() ?? 0.5;

    const clock = new THREE.Clock();
    let raf = 0;
    let last = -1;
    let prevT = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = clock.getElapsedTime();
      if (t - last < 1 / Q.fps) return; // a modest frame rate is plenty for an ambient backdrop and saves battery
      last = t;
      const s = stateRef.current;
      // ---- sun and moon
      const sunP = live.current.props.sun();
      const isNight = s.night || sunP === null;
      // fades in real seconds (not frames), so slow computers change light at the same pace
      const fdt = Math.min(0.5, Math.max(0, t - prevT));
      nightMix += ((isNight ? 1 : 0) - nightMix) * (1 - Math.exp(-fdt / 1.2));
      if (sunP !== null) sunSm += (sunP - sunSm) * (1 - Math.exp(-fdt / 0.8));
      const d = Math.sin(Math.PI * Math.min(1, Math.max(0, sunSm))); // 0 at the horizon, 1 at noon
      const L = THREE.MathUtils.lerp;
      const a = Math.PI * sunSm;                                      // rises in the east (right), sets in the west
      sunPos.set(Math.cos(a) * 60, 6 + Math.sin(a) * 52, -28);
      moonLight.position.copy(sunPos).lerp(nightPos, nightMix);
      moonLight.color.copy(tmp.copy(sunCol.low).lerp(sunCol.high, d)).lerp(moonCol, nightMix);
      const w = live.current.props.weather ?? 'clear';
      const overcast = w === 'rain' ? 0.45 : w === 'storm' ? 0.65 : w === 'fog' ? 0.35 : w === 'snow' ? 0.25 : 0; // dims the sun
      const bolt = weatherStep(w, Math.min(0.1, Math.max(0, t - prevT)), t);
      moonLight.intensity = L(0.7 + 2.0 * d * (1 - overcast), 1.1 * (1 - overcast * 0.5), nightMix);
      hemi.color.copy(hemiDay).lerp(hemiNight, nightMix);
      hemi.intensity = L(L(1.3, 2.3, d), 0.6, nightMix) + bolt * 4;
      warm.intensity = L(L(14, 5, d), 38, nightMix) * (0.92 + Math.sin(t * 7) * 0.05);
      (scene.fog as THREE.FogExp2).color.copy(tmp.copy(fogC.low).lerp(fogC.high, d)).lerp(nightFog, nightMix);
      sky.copy(tmp2.copy(skyC.low).lerp(skyC.high, d)).lerp(nightSky, nightMix);
      k.warmGlow instanceof THREE.MeshStandardMaterial && (k.warmGlow.emissiveIntensity = L(L(1.5, 0.7, d), 2.2, nightMix));
      sunDisc.position.copy(sunPos).normalize().multiplyScalar(150);
      sunMat.color.copy(sunCol.low).lerp(sunCol.high, d);
      sunMat.opacity = 1 - nightMix;
      sunDisc.visible = nightMix < 0.98 && sunDisc.position.y > -4;
      (moon.material as THREE.MeshBasicMaterial).opacity = nightMix;
      starMat.opacity = nightMix * (1 - overcast * 1.4 > 0 ? 1 - overcast * 1.4 : 0);
      (moon.material as THREE.MeshBasicMaterial).opacity = nightMix * (overcast > 0.3 ? 0.25 : 1);
      // grey the sky for bad weather, thicken the fog for fog and snow
      const grey = tmp.set(w === 'snow' ? '#8d95a8' : '#3c4252');
      sky.lerp(grey, overcast * (1 - nightMix * 0.6));
      (scene.fog as THREE.FogExp2).color.lerp(grey, overcast * (1 - nightMix * 0.6));
      (scene.fog as THREE.FogExp2).density = w === 'fog' ? 0.017 : w === 'snow' ? 0.013 : w === 'rain' || w === 'storm' ? 0.013 : 0.009;
      if (bolt) sky.lerp(tmp.set('#dfe6ff'), bolt * 0.8);
      sunDisc.visible = sunDisc.visible && overcast < 0.4;
      if (sleeping) { if (!s.reducedMotion) yaw = t * 0.035; }
      else yaw = 0; // kept still so figures stay exactly under their seats
      if (!s.reducedMotion) {
        for (const fn of anims) fn(t);
      } else {
        anims[0]?.(t); // the clocktower keeps real time even with reduced motion
      }
      stepFigures(t - prevT, t, s.reducedMotion);
      stepVote(t - prevT);
      stepEffects();
      prevT = t;
      placeCamera();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onPointer);

      removeEventListener('keydown', onKeyDown);
      removeEventListener('keyup', onKeyUp);
      removeEventListener('blur', onBlur);
      worldRef.current = null;
      for (const { fig } of figuresRef.current.values()) disposeCharacter(fig);
      figuresRef.current.clear();
      sceneRef.current = null;
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) { (mat as THREE.MeshStandardMaterial).map?.dispose(); mat.dispose(); }
      });
      renderer.dispose();
      mount.innerHTML = '';
      labelsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // townsfolk figures: built/updated here, moved every frame by stepFigures
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const figs = figuresRef.current;
    const removeFig = (e: FigEntry) => { scene.remove(e.fig); e.labelEl.remove(); e.bubbleEl.remove(); disposeCharacter(e.fig); };
    const want = new Map<string, { avatar: Avatar; ghost: boolean; visible: boolean; asleep: boolean; label: Parameters<typeof setLabel>[1] }>();
    for (const p of players) {
      want.set(p.id, { avatar: p.avatar, ghost: !p.alive, visible: night || p.location === 'square', asleep: night && !awakeIds.includes(p.id), label: p });
      if (p.id !== myId) { if (p.pos) remotePos.current.set(p.id, p.pos); else remotePos.current.delete(p.id); }
    }
    want.set('st', { avatar: storyteller.avatar, ghost: false, visible: !night && storyteller.location === 'square', asleep: false, label: { name: `${storyteller.name} · Storyteller` } });
    if (myId !== 'st') { if (storyteller.pos) remotePos.current.set('st', storyteller.pos); else remotePos.current.delete('st'); }
    for (const [id, entry] of figs) if (!want.has(id)) { removeFig(entry); figs.delete(id); motionRef.current.delete(id); }
    for (const [id, w] of want) {
      const key = JSON.stringify(w.avatar) + (w.ghost ? ':ghost' : '');
      let entry = figs.get(id);
      if (!entry || entry.key !== key) {
        if (entry) removeFig(entry);
        const fig = buildCharacter(w.avatar, { ghost: w.ghost });
        fig.scale.setScalar(CHAR_SCALE);
        fig.userData.figureId = id;
        // a faint self-glow so figures stay readable on the dark plaza
        if (!w.ghost) fig.traverse(o => {
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (mat?.isMeshStandardMaterial && mat.emissiveIntensity <= 1) { mat.emissive = mat.color.clone(); mat.emissiveIntensity = 0.22; }
        });
        const labelEl = document.createElement('div');
        const label = new CSS2DObject(labelEl);
        label.position.set(0, CHARACTER_HEIGHT + 0.35, 0);
        fig.add(label);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.52, 32), new THREE.MeshBasicMaterial({ color: '#ffcf6b', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.03;
        ring.visible = false;
        fig.add(ring);
        // red ring under the nominee
        const mark = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color: '#e0303a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
        mark.rotation.x = -Math.PI / 2; mark.position.y = 0.035; mark.visible = false;
        fig.add(mark);
        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'emote-bubble three';
        const bubble = new CSS2DObject(bubbleEl);
        bubble.position.set(0, CHARACTER_HEIGHT + 0.95, 0);
        bubble.visible = false;
        fig.add(bubble);
        scene.add(fig);
        entry = { fig, key, label, labelEl, ring, mark, bubble, bubbleEl };
        figs.set(id, entry);
      }
      entry.fig.visible = w.visible;
      entry.fig.userData.asleep = w.asleep;
      setAsleep(entry.fig, w.asleep);
      setLabel(entry.labelEl, w.label, id === myId);
    }
  }, [players, storyteller, night, awakeIds, myId]);

  // votes: hands up on the figures, a red ring under the nominee
  useEffect(() => {
    const nom = props.nomination;
    for (const [id, e] of figuresRef.current) {
      e.fig.userData.handUp = !!nom && (nom.done ? nom.locked[id] === true : !!(nom.hands[id] || nom.locked[id]));
      e.mark.visible = !!nom && !nom.done && nom.nomineeId === id;
    }
  });

  // gestures: animate the figure and float the emoji above it
  useEffect(() => onEmote(e => {
    const f = figuresRef.current.get(e.id);
    if (!f) return;
    playGesture(f.fig, e.kind);
    f.bubbleEl.textContent = EMOTE_ICON[e.kind] ?? '';
    const el = f.bubbleEl;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    setTimeout(() => { if (el.textContent === (EMOTE_ICON[e.kind] ?? '')) el.textContent = ''; }, EMOTE_MS);
  }), []);

  // positions from other players arrive as small events, not full state updates
  useEffect(() => {
    const onPos = (d: { id: string; room?: string } & WalkPos) => { if (d.room && d.room !== 'square') return; if (d.id !== live.current.props.myId) remotePos.current.set(d.id, { x: d.x, z: d.z, ry: d.ry }); };
    const onReset = () => { remotePos.current.clear(); ctrl.current.target = null; ctrl.current.door = null; };
    socket.on('pos', onPos);
    socket.on('pos-reset', onReset);
    return () => { socket.off('pos', onPos); socket.off('pos-reset', onReset); };
  }, []);

  // coming back out of a building: step out of its door
  useEffect(() => {
    const m = arrivedFrom?.match(/^r(\d+)$/);
    const w = worldRef.current;
    if (!m || !w || !canWalk) return;
    const d = w.doors[Number(m[1])];
    if (!d) return;
    const out = { x: d.x * 0.92, z: d.z * 0.92 };
    motionRef.current.set(myId, { x: out.x, z: out.z, ry: Math.atan2(-d.x, -d.z), walk: 0, stride: 0, appearedAt: -1, wasVisible: true });
    socket.emit('action', { type: 'walk', x: out.x, z: out.z, ry: Math.atan2(-d.x, -d.z) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivedFrom]);

  // building labels: name + occupancy from the live room list
  useEffect(() => {
    labelsRef.current.forEach((el, i) => {
      if (!el) return;
      const r = rooms.find(x => x.id === `r${i}`); // room rN is always building N
      const name = ROOM_NAMES[i].replace(/^The /, '');
      const count = r ? r.occupants.filter(o => o !== 'st').length : 0;
      el.className = `town3d-label ${r ? '' : 'closed'}`;
      el.textContent = r ? `${ROOM_ICONS[i]} ${name} · ${count}/${r.capacity}` : `${name} · closed`;
    });
  }, [rooms]);

  const walkMode = canWalk && !night;
  const touch = touchDevice();
  return (
    <>
      <div ref={mountRef} className={`town3d ${walkMode ? 'interactive' : ''}`} aria-hidden="true" />
      {walkMode && (
        <div className="walk-help" aria-live="polite">
          {doorPrompt
            ? <><b>{doorPrompt.name}</b> <button className="btn small primary" onClick={() => enterRef.current(doorPrompt.i)}>Enter (E)</button></>
            : <span>{touch ? 'Drag the joystick or tap the ground to walk · tap a building to go inside' : 'Click the ground to walk · WASD / arrow keys · click a building to go inside'}</span>}
        </div>
      )}
      {walkMode && touch && <Joystick onChange={(x, y) => { ctrl.current.joy = { x, y }; if (x || y) { ctrl.current.target = null; ctrl.current.door = null; } }} />}
    </>
  );
}
