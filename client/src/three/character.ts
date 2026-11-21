// Procedural 3D townsfolk figures, built from the same Avatar settings as the 2D
// portrait so both always match. Original design: lightly stylised human proportions
// (about 6 heads tall), smooth lathe-turned bodies and garments, jointed limbs.
import * as THREE from 'three';
import type { Avatar } from '../../../shared/types';
import { SKINS, HAIR_COLORS, OUTFIT_COLORS } from '../avatarStyle';

/** Height of an average figure in world units (feet at y = 0). */
export const CHARACTER_HEIGHT = 2.55;

type V3 = [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);
const shade = (hex: string | THREE.Color, f: number) => new THREE.Color(hex).multiplyScalar(f);

// Shared unit geometries (never disposed).
const SPHERE = new THREE.SphereGeometry(1, 24, 18);
const SPHERE_LO = new THREE.SphereGeometry(1, 12, 9);
const SHARED = new Set<THREE.BufferGeometry>([SPHERE, SPHERE_LO]);

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], rot: V3 = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const ball = (parent: THREE.Object3D, mat: THREE.Material, pos: V3, r: number | V3, lo = false) =>
  add(parent, lo ? SPHERE_LO : SPHERE, mat, pos, typeof r === 'number' ? [r, r, r] : r);

/** Tapered limb segment from a to b with rounded joints at both ends. */
function limb(parent: THREE.Object3D, mat: THREE.Material, a: V3, b: V3, ra: number, rb: number, joints = true) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const m = add(parent, new THREE.CylinderGeometry(rb, ra, len, 14, 1, true), mat);
  m.position.copy(va).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  if (joints) { ball(parent, mat, a, ra); ball(parent, mat, b, rb); }
  return m;
}

/** Surface of revolution from [radius, y] points; `depth` squashes it front-to-back (bodies are oval). */
function lathe(parent: THREE.Object3D, mat: THREE.Material, pts: [number, number][], depth = 0.8, phiStart = 0, phiLength = Math.PI * 2, segs = 28) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLength);
  g.computeVertexNormals();
  return add(parent, g, mat, [0, 0, 0], [1, 1, depth]);
}

export interface CharacterOptions { ghost?: boolean }

/**
 * Builds a figure with feet at the origin, facing +z.
 * userData.pose: inner group to tilt (asleep); userData.animate(t): idle motion.
 */
export function buildCharacter(a: Avatar, opts: CharacterOptions = {}): THREE.Group {
  const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...extra });
  const skinHex = SKINS[a.skin] ?? SKINS[0];
  const clothHex = OUTFIT_COLORS[a.outfitColor] ?? OUTFIT_COLORS[0];
  const hairHex = HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[0];
  const M = {
    skin: std(skinHex, { roughness: 0.55 }),
    skinShade: std(shade(skinHex, 0.82), { roughness: 0.6 }),
    lips: std(shade(new THREE.Color(skinHex).lerp(new THREE.Color('#9b3a3a'), 0.45), 0.9), { roughness: 0.5 }),
    hair: std(hairHex, { roughness: 0.6 }),
    hairSide: std(hairHex, { roughness: 0.6, side: THREE.DoubleSide }),
    brow: std(shade(hairHex, 0.8)),
    cloth: std(clothHex),
    clothSide: std(clothHex, { side: THREE.DoubleSide }),
    clothDark: std(shade(clothHex, 0.62)),
    clothDarkSide: std(shade(clothHex, 0.55), { side: THREE.DoubleSide }),
    trousers: std('#2b241f'),
    boots: std('#1c140e', { roughness: 0.55 }),
    trim: std('#c9a15b', { metalness: 0.55, roughness: 0.35 }),
    linen: std('#e6dcc8', { side: THREE.DoubleSide }),
    eyeWhite: std('#f2ede4', { roughness: 0.25 }),
    iris: std('#2a1c12', { roughness: 0.2 }),
    iron: std('#2a2a30', { metalness: 0.6, roughness: 0.4 }),
    thorn: std('#4a3320'),
    glow: std('#ffcf6b', { emissive: '#ff9a2e', emissiveIntensity: 2 }),
    feather: std('#0d0d12', { roughness: 0.45 }),
    beak: std('#d9b44a'),
  };

  const root = new THREE.Group();
  const pose = new THREE.Group();
  root.add(pose);
  const heightScale = [1, 0.9, 1.1][a.height] ?? 1;
  const widthScale = [1, 0.86, 1.24][a.build] ?? 1;
  pose.scale.setScalar(heightScale);

  // body parts that widen with build (the head keeps its size)
  const body = new THREE.Group();
  body.scale.set(widthScale, 1, widthScale);
  pose.add(body);

  const outfit = a.outfit;
  const legsVisible = outfit !== 2 && outfit !== 3; // robe and gown reach the ground
  const holdsLantern = a.accessory === 5;

  // ---------------- legs
  const legs: THREE.Group[] = [];
  if (legsVisible) {
    for (const s of [-1, 1]) {
      // each leg pivots at the hip so it can swing while walking
      const hx = s * 0.105, hy = 1.12;
      const leg = new THREE.Group();
      leg.position.set(hx, hy, 0);
      body.add(leg);
      legs.push(leg);
      const rel = (x: number, y: number, z: number): V3 => [x - hx, y - hy, z];
      limb(leg, M.trousers, rel(s * 0.105, 1.12, 0), rel(s * 0.098, 0.62, 0.01), 0.105, 0.08);
      limb(leg, M.trousers, rel(s * 0.098, 0.62, 0.01), rel(s * 0.092, 0.14, 0), 0.078, 0.058);
      limb(leg, M.boots, rel(s * 0.09, 0.36, 0), rel(s * 0.09, 0.08, 0.01), 0.064, 0.06, false);
      ball(leg, M.boots, rel(s * 0.09, 0.06, 0.06), [0.065, 0.06, 0.12]);
    }
    ball(body, M.trousers, [0, 1.12, 0], [0.2, 0.1, 0.15]); // seat/hips
  }

  // ---------------- torso & garments (front is +z)
  const torsoProfile: [number, number][] = [[0.001, 1.06], [0.2, 1.08], [0.205, 1.2], [0.18, 1.42], [0.2, 1.6], [0.225, 1.75], [0.215, 1.86], [0.15, 1.95], [0.06, 1.99], [0.001, 2.0]];
  switch (outfit) {
    case 1: { // doublet with short flared skirt, belt and buttons
      lathe(body, M.cloth, torsoProfile, 0.74);
      lathe(body, M.clothDark, [[0.2, 1.24], [0.245, 1.08], [0.26, 0.98]], 0.76, 0, Math.PI * 2);
      add(body, new THREE.TorusGeometry(0.188, 0.022, 8, 28), M.boots, [0, 1.3, 0], [1, 1, 0.74], [Math.PI / 2, 0, 0]);
      add(body, new THREE.BoxGeometry(0.06, 0.05, 0.02), M.trim, [0, 1.3, 0.145]);
      for (const y of [1.45, 1.57, 1.69, 1.8]) ball(body, M.trim, [0, y, (y > 1.6 ? 0.172 : 0.15)], 0.014, true);
      break;
    }
    case 2: { // long robe with rope belt and bell sleeves
      lathe(body, M.cloth, [[0.001, 0.02], [0.36, 0.02], [0.33, 0.35], [0.28, 0.8], [0.22, 1.2], [0.19, 1.42], [0.21, 1.6], [0.225, 1.75], [0.215, 1.86], [0.15, 1.95], [0.06, 1.99], [0.001, 2.0]], 0.8);
      add(body, new THREE.TorusGeometry(0.195, 0.018, 8, 28), M.linen, [0, 1.38, 0], [1, 1, 0.8], [Math.PI / 2, 0, 0]);
      limb(body, M.linen, [0.07, 1.36, 0.15], [0.09, 1.0, 0.16], 0.012, 0.01, false);
      break;
    }
    case 3: { // gown: fitted bodice, full skirt, lace collar
      lathe(body, M.cloth, torsoProfile.slice(2), 0.72);
      lathe(body, M.cloth, [[0.001, 0.02], [0.5, 0.02], [0.47, 0.18], [0.4, 0.5], [0.3, 0.9], [0.2, 1.22], [0.18, 1.32], [0.001, 1.33]], 0.85);
      add(body, new THREE.TorusGeometry(0.16, 0.03, 8, 28), M.linen, [0, 1.88, 0.0], [1, 1, 0.75], [Math.PI / 2, 0, 0]);
      add(body, new THREE.TorusGeometry(0.2, 0.014, 6, 28), M.clothDark, [0, 1.3, 0], [1, 1, 0.85], [Math.PI / 2, 0, 0]);
      break;
    }
    case 4: { // linen shirt, cloth waistcoat, long apron
      lathe(body, M.cloth, torsoProfile, 0.74);
      const apron = new THREE.CylinderGeometry(0.235, 0.27, 0.78, 20, 1, true, -0.95, 1.9);
      add(body, apron, M.linen, [0, 0.98, 0.012], [1, 1, 0.8]);
      add(body, new THREE.CylinderGeometry(0.23, 0.215, 0.32, 16, 1, true, -0.7, 1.4), M.linen, [0, 1.6, 0.01], [1, 1, 0.78]);
      limb(body, M.linen, [-0.12, 1.76, 0.15], [-0.17, 1.95, 0.02], 0.012, 0.012, false);
      limb(body, M.linen, [0.12, 1.76, 0.15], [0.17, 1.95, 0.02], 0.012, 0.012, false);
      break;
    }
    default: { // tunic with a long cape and clasp
      lathe(body, M.cloth, torsoProfile, 0.74);
      lathe(body, M.clothDarkSide, [[0.24, 1.93], [0.3, 1.8], [0.33, 1.5], [0.38, 1.0], [0.42, 0.5], [0.44, 0.22]], 0.86, Math.PI * 0.5, Math.PI, 24);
      add(body, new THREE.TorusGeometry(0.175, 0.035, 8, 24), M.clothDark, [0, 1.92, -0.01], [1, 1, 0.8], [Math.PI / 2, 0, 0]);
      ball(body, M.trim, [0, 1.86, 0.15], [0.035, 0.035, 0.02]);
      break;
    }
  }
  // shoulders
  for (const s of [-1, 1]) ball(body, outfit === 3 ? M.cloth : M.cloth, [s * 0.235, 1.86, 0], outfit === 3 ? 0.09 : 0.075);

  // ---------------- arms (pivot at the shoulder for the idle swing)
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.26, 1.86, 0);
    body.add(arm);
    arms.push(arm);
    const lantern = holdsLantern && s === 1;
    const elbow: V3 = [s * 0.06, -0.33, -0.02];
    const wrist: V3 = lantern ? [s * 0.07, -0.5, 0.26] : [s * 0.05, -0.66, 0.05];
    const sleeve = outfit === 4 ? M.linen : M.cloth;
    limb(arm, sleeve, [0, 0, 0], elbow, 0.074, 0.06);
    if (outfit === 2) { // bell sleeve
      limb(arm, sleeve, elbow, wrist, 0.055, 0.09, false);
      ball(arm, M.cloth, elbow, 0.055);
    } else {
      limb(arm, sleeve, elbow, wrist, 0.058, 0.045);
    }
    // hand + thumb
    const hand: V3 = [wrist[0], wrist[1] - 0.06, wrist[2] + (lantern ? 0.02 : 0.005)];
    ball(arm, M.skin, hand, [0.045, 0.072, 0.033]);
    limb(arm, M.skin, [wrist[0] - s * 0.03, wrist[1] - 0.02, wrist[2] + 0.02], [wrist[0] - s * 0.045, wrist[1] - 0.07, wrist[2] + 0.035], 0.013, 0.011);
    if (lantern) {
      const lant = new THREE.Group();
      lant.position.set(hand[0], hand[1] - 0.17, hand[2] + 0.02);
      arm.add(lant);
      limb(lant, M.iron, [0, 0.13, 0], [0, 0.07, 0], 0.006, 0.006, false);
      add(lant, new THREE.CylinderGeometry(0.06, 0.07, 0.15, 8), M.glow, [0, 0, 0]);
      add(lant, new THREE.ConeGeometry(0.075, 0.07, 8), M.iron, [0, 0.11, 0]);
      add(lant, new THREE.CylinderGeometry(0.075, 0.075, 0.02, 8), M.iron, [0, -0.08, 0]);
    }
  }

  // ---------------- neck & head (not widened by build)
  limb(pose, M.skin, [0, 1.94, 0], [0, 2.06, 0.01], 0.064, 0.058, false);
  const head = new THREE.Group();
  head.position.set(0, 2.26, 0.01);
  head.scale.setScalar(1.12);
  pose.add(head);
  ball(head, M.skin, [0, 0, 0], [0.155, 0.195, 0.175]);           // cranium + face
  ball(head, M.skin, [0, -0.1, 0.04], [0.118, 0.11, 0.13]);       // jaw & chin
  for (const s of [-1, 1]) ball(head, M.skinShade, [s * 0.152, -0.01, -0.005], [0.025, 0.045, 0.03]); // ears
  add(head, new THREE.ConeGeometry(0.03, 0.08, 10), M.skin, [0, -0.02, 0.185], [1, 1, 1], [Math.PI / 2 - 0.25, 0, 0]); // nose
  ball(head, M.skinShade, [0, -0.055, 0.175], [0.024, 0.014, 0.012], true); // nose tip shadow
  add(head, new THREE.TorusGeometry(0.035, 0.008, 6, 16, Math.PI), M.lips, [0, -0.095, 0.165], [1, 0.6, 1], [0, 0, Math.PI]); // mouth
  // eyes
  const eyeR = [0.026, 0.023, 0.032, 0.025][a.eyes] ?? 0.026;
  for (const s of [-1, 1]) {
    const ex = s * 0.058, ey = 0.035, ez = 0.15;
    ball(head, M.eyeWhite, [ex, ey, ez], [eyeR * 1.25, eyeR, eyeR * 0.7]);
    ball(head, M.iris, [ex, ey, ez + eyeR * 0.6], eyeR * 0.55, true);
    if (a.eyes === 1 || a.eyes === 3) { // narrow / weary: heavy upper lid
      add(head, new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.skin, [ex, ey + 0.004, ez - 0.002], [eyeR * 1.4, eyeR * (a.eyes === 1 ? 1.15 : 0.95), eyeR * 0.85], [0.35, 0, 0]);
    }
    if (a.eyes === 3) ball(head, M.skinShade, [ex, ey - eyeR - 0.008, ez - 0.004], [eyeR * 1.1, 0.008, 0.012], true); // tired bags
    // eyebrow
    const browTilt = a.eyes === 0 ? s * 0.22 : a.eyes === 2 ? -s * 0.1 : s * 0.05;
    add(head, new THREE.BoxGeometry(0.06, 0.012, 0.014), M.brow, [ex, ey + eyeR + 0.03, ez + 0.01], [1, 1, 1], [0, 0, browTilt]);
  }

  // ---------------- hair
  const cap = () => {
    add(head, new THREE.SphereGeometry(1, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), M.hair, [0, 0.0, -0.01], [0.168, 0.212, 0.19], [-0.42, 0, 0]);
    ball(head, M.hair, [0, 0.0, -0.05], [0.162, 0.18, 0.155]); // back of the head
  };
  switch (a.hair) {
    case 1: // short, with a side part and sideburns
      cap();
      for (const s of [-1, 1]) ball(head, M.hair, [s * 0.148, -0.01, 0.03], [0.012, 0.05, 0.03], true);
      break;
    case 2: // long, falling over the shoulders
      cap();
      lathe(head, M.hairSide, [[0.17, 0.02], [0.185, -0.12], [0.2, -0.3], [0.22, -0.42]], 0.95, Math.PI * 0.42, Math.PI * 1.16, 22);
      break;
    case 3: // two braids in front of the shoulders
      cap();
      for (const s of [-1, 1]) for (let i = 0; i < 6; i++) ball(head, M.hair, [s * (0.13 + i * 0.008), -0.08 - i * 0.065, 0.06 + i * 0.012], [0.035, 0.04, 0.035], true);
      break;
    case 4: // wild, tousled tufts
      cap();
      for (let i = 0; i < 14; i++) {
        const th = (i / 14) * Math.PI * 2;
        add(head, new THREE.ConeGeometry(0.035, 0.12, 6), M.hair, [Math.cos(th) * 0.13, 0.12 + Math.sin(i) * 0.03, Math.sin(th) * 0.13 - 0.03], [1, 1, 1], [Math.sin(th) * 0.9, 0, -Math.cos(th) * 0.9]);
      }
      break;
    case 5: // bun
      cap();
      ball(head, M.hair, [0, 0.13, -0.15], 0.07);
      add(head, new THREE.TorusGeometry(0.06, 0.012, 6, 16), M.clothDark, [0, 0.13, -0.15], [1, 1, 1], [0.6, 0, 0]);
      break;
    case 6: { // hood over the head, draping onto the shoulders
      add(head, new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), M.clothDarkSide, [0, 0.01, -0.02], [0.2, 0.235, 0.215], [-0.55, 0, 0]);
      lathe(head, M.clothDarkSide, [[0.2, -0.05], [0.24, -0.2], [0.3, -0.33]], 0.9, Math.PI * 0.35, Math.PI * 1.3, 22);
      break;
    }
    default: break; // bald
  }

  // ---------------- accessories
  switch (a.accessory) {
    case 1: { // tricorn hat
      const hat = new THREE.Group();
      hat.position.set(0, 0.15, -0.01);
      hat.rotation.x = -0.12;
      head.add(hat);
      const brim = add(hat, new THREE.CylinderGeometry(0.29, 0.29, 0.025, 3), M.boots, [0, 0, 0], [1, 1, 1], [0, Math.PI, 0]);
      brim.geometry = new THREE.CylinderGeometry(0.29, 0.29, 0.025, 3);
      add(hat, new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.boots, [0, 0.01, 0], [0.16, 0.12, 0.16]);
      add(hat, new THREE.TorusGeometry(0.16, 0.012, 6, 24), M.trim, [0, 0.02, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
      break;
    }
    case 2: { // long-beaked mask (generic)
      lathe(head, M.linen, [[0.001, 0.0], [0.055, 0.02], [0.05, 0.12], [0.025, 0.22], [0.001, 0.26]], 1, 0, Math.PI * 2, 14).rotation.x = Math.PI / 2 + 0.25;
      (head.children.at(-1) as THREE.Mesh).position.set(0, -0.04, 0.17);
      for (const s of [-1, 1]) add(head, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), M.iron, [s * 0.058, 0.035, 0.172], [1, 1, 1], [Math.PI / 2, 0, 0]);
      break;
    }
    case 3: // monocle on the right eye with a chain
      add(head, new THREE.TorusGeometry(0.034, 0.005, 6, 20), M.trim, [0.058, 0.035, 0.178]);
      limb(head, M.trim, [0.09, 0.02, 0.17], [0.14, -0.2, 0.1], 0.003, 0.003, false);
      break;
    case 4: // crown of thorns
      add(head, new THREE.TorusGeometry(0.17, 0.016, 6, 28), M.thorn, [0, 0.09, -0.005], [1, 1, 1.05], [Math.PI / 2 - 0.15, 0, 0]);
      for (let i = 0; i < 12; i++) {
        const th = (i / 12) * Math.PI * 2;
        add(head, new THREE.ConeGeometry(0.008, 0.06, 5), M.thorn, [Math.cos(th) * 0.17, 0.1, Math.sin(th) * 0.178], [1, 1, 1], [Math.sin(th) * 1.3, 0, -Math.cos(th) * 1.3]);
      }
      break;
    case 6: { // raven on the left shoulder
      const bird = new THREE.Group();
      bird.position.set(-0.25 * widthScale, 1.97, -0.02);
      bird.rotation.y = 0.5;
      pose.add(bird);
      ball(bird, M.feather, [0, 0, 0], [0.06, 0.06, 0.1]);
      ball(bird, M.feather, [0, 0.07, 0.06], 0.045);
      add(bird, new THREE.ConeGeometry(0.014, 0.06, 6), M.beak, [0, 0.065, 0.12], [1, 1, 1], [Math.PI / 2, 0, 0]);
      add(bird, new THREE.ConeGeometry(0.04, 0.13, 6), M.feather, [0, -0.01, -0.13], [1, 1, 0.35], [-Math.PI / 2 - 0.35, 0, 0]);
      for (const s of [-1, 1]) ball(bird, M.eyeWhite, [s * 0.025, 0.08, 0.09], 0.006, true);
      break;
    }
    default: break; // none, or the lantern (built with the arm)
  }

  if (opts.ghost) makeGhost(root);

  // idle: breathing, a slow look around, a little arm sway (de-synchronised per figure)
  const phase = Math.random() * Math.PI * 2;
  root.userData.pose = pose;
  root.userData.head = head;
  // walking: TownScene sets userData.walk (0..1) and advances userData.stride
  root.userData.walk = 0;
  root.userData.stride = 0;
  // voting: userData.handUp raises a hand (smoothly). gestures: userData.gesture = { kind, at } (performance.now() ms)
  root.userData.handUp = false;
  let lift = 0, lastT = -1;
  const voteArm = holdsLantern ? 0 : 1;
  const side = (i: number) => (i === 0 ? -1 : 1); // left arm is -x
  root.userData.animate = (t: number) => {
    const dt = lastT < 0 ? 0 : Math.min(0.25, Math.max(0, t - lastT));
    lastT = t;
    const w: number = root.userData.walk ?? 0;
    const stride: number = root.userData.stride ?? 0;
    const swing = Math.sin(stride);
    legs.forEach((leg, i) => { leg.rotation.x = (i ? -1 : 1) * swing * 0.55 * w; });
    if (!opts.ghost) pose.position.y = pose.rotation.x === 0 ? Math.abs(Math.cos(stride)) * 0.035 * w : pose.position.y;
    const b = Math.sin(t * 1.5 + phase);
    body.scale.y = 1 + b * 0.008;
    head.position.y = 2.26 + b * 0.008;
    let hx = Math.sin(t * 0.23 + phase) * 0.05, hy = Math.sin(t * 0.37 + phase) * 0.22, hz = 0;
    // base arm pose: idle sway + walking swing
    const ax = [Math.sin(t * 0.9 + phase) * 0.04 - swing * 0.45 * w, holdsLantern ? 0 : -Math.sin(t * 0.9 + phase) * 0.04 + swing * 0.45 * w];
    const az = [0, 0];
    // a raised hand for a yes vote (straight up, slightly out)
    lift += ((root.userData.handUp ? 1 : 0) - lift) * Math.min(1, dt * 8);
    if (lift > 0.001) {
      ax[voteArm] += (-2.95 - ax[voteArm]) * lift;
      az[voteArm] += (side(voteArm) * 0.18 - az[voteArm]) * lift;
    }
    // gestures blend over the base pose
    const g = root.userData.gesture as { kind: string; at: number } | undefined;
    if (g) {
      const e = (performance.now() - g.at) / 1000;
      const D = 2.4;
      if (e > D) root.userData.gesture = undefined;
      else {
        const env = Math.min(1, e / 0.25, (D - e) / 0.35);
        const set = (i: number, x: number, z: number) => { ax[i] += (x - ax[i]) * env; az[i] += (z - az[i]) * env; };
        const R = holdsLantern ? 0 : 1, sR = side(R); // gesturing hand
        switch (g.kind) {
          case 'wave': set(R, -2.6, sR * (0.45 + Math.sin(e * 11) * 0.35)); hz += side(R) * -0.12 * env; break;
          case 'nod': hx += Math.sin(e * 9) * 0.28 * env; break;
          case 'shake': hy += Math.sin(e * 10) * 0.45 * env; break;
          case 'thumbsup': set(R, -1.5 - Math.sin(e * 5) * 0.08, sR * 0.12); hx -= 0.08 * env; break;
          case 'thumbsdown': set(R, -1.15, sR * 0.12); hy += Math.sin(e * 6) * 0.15 * env; hx += 0.1 * env; break;
          case 'shrug': set(0, -0.55, -0.75); set(1, -0.55, 0.75); hz += 0.22 * env; pose.position.y += Math.max(0, Math.sin(e * 3)) * 0.03 * env; break;
          case 'think': set(R, -2.25, -sR * 0.55); hx += 0.12 * env; hz += -sR * 0.15 * env; break;
          case 'point': set(R, -1.6, sR * 0.05); hx -= 0.05 * env; break;
          case 'clap': { const c = Math.sin(e * 15) * 0.18; set(0, -1.25, 0.42 + c); set(1, -1.25, -0.42 - c); break; }
          case 'gasp': set(0, -2.7, -0.45); set(1, -2.7, 0.45); hx -= 0.25 * env; break;
          default: break;
        }
      }
    }
    head.rotation.set(hx, hy, hz);
    arms.forEach((arm, i) => { arm.rotation.x = ax[i]; arm.rotation.z = az[i]; });
    if (opts.ghost) pose.position.y = 0.15 + Math.sin(t * 1.1 + phase) * 0.08;
  };
  return root;
}

/** Translucent, bluish, slightly glowing: the dead keep talking, but look the part. */
function makeGhost(root: THREE.Object3D) {
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const col = src.color.clone().lerp(new THREE.Color('#a9bcff'), 0.65);
    mesh.material = new THREE.MeshStandardMaterial({
      color: col, emissive: '#5a6fb8', emissiveIntensity: 0.35, transparent: true, opacity: 0.45,
      depthWrite: false, side: src.side, roughness: 0.6,
    });
    mesh.castShadow = false;
  });
}

/** Start a gesture animation (see EMOTES). */
export function playGesture(fig: THREE.Object3D, kind: string) {
  fig.userData.gesture = { kind, at: performance.now() };
}

/** Lie the figure down (asleep at night) or stand it back up. */
export function setAsleep(fig: THREE.Object3D, asleep: boolean) {
  const pose = fig.userData.pose as THREE.Group | undefined;
  if (!pose) return;
  pose.rotation.x = asleep ? -Math.PI / 2 : 0;
  pose.position.z = asleep ? 1.1 : 0;
  if (asleep) pose.position.y = 0.25;
  else if (pose.position.y === 0.25) pose.position.y = 0;
}

/** Dispose per-figure materials and geometries (shared unit spheres are kept). */
export function disposeCharacter(fig: THREE.Object3D) {
  fig.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) mat.dispose();
    if (!SHARED.has(mesh.geometry)) mesh.geometry.dispose();
  });
}
