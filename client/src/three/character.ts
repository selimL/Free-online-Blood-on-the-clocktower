// Procedural low-poly 3D townsfolk figures, built from the same Avatar settings as the
// 2D portrait so both always match. Original stylised design (big head, small body).
import * as THREE from 'three';
import type { Avatar } from '../../../shared/types';
import { SKINS, HAIR_COLORS, OUTFIT_COLORS } from '../avatarStyle';

/** Approximate height of an average figure in world units (feet at y = 0). */
export const CHARACTER_HEIGHT = 2.6;

// Shared geometries (never disposed; tiny and reused by every figure).
const G = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  lowSphere: new THREE.SphereGeometry(1, 10, 8),
  capTop: new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
  hood: new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.64),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
  cone: new THREE.ConeGeometry(1, 1, 16),
  cone3: new THREE.CylinderGeometry(1, 1, 1, 3),
  capsule: new THREE.CapsuleGeometry(1, 1, 4, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
  torus: new THREE.TorusGeometry(1, 0.12, 8, 24),
  capeBack: new THREE.CylinderGeometry(1, 1.55, 1, 18, 1, true, Math.PI / 2, Math.PI),
  hairBack: new THREE.CylinderGeometry(1, 1.1, 1, 16, 1, true, Math.PI / 2 + 0.25, Math.PI - 0.5),
};

const shade = (hex: string, f: number) => new THREE.Color(hex).multiplyScalar(f);

function part(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, p: [number, number, number], s: [number, number, number], r: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.scale.set(...s);
  m.rotation.set(...r);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export interface CharacterOptions { ghost?: boolean }

/**
 * Builds a figure. The returned group has its feet at the origin and faces +z.
 * `userData.pose` is the inner group to tilt (e.g. lying asleep); `userData.animate(t)` idles it.
 */
export function buildCharacter(a: Avatar, opts: CharacterOptions = {}): THREE.Group {
  const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: false, ...extra });
  const skinHex = SKINS[a.skin] ?? SKINS[0];
  const clothHex = OUTFIT_COLORS[a.outfitColor] ?? OUTFIT_COLORS[0];
  const m = {
    skin: std(skinHex),
    skinDark: std(shade(skinHex, 0.75)),
    hair: std(HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[0], { roughness: 0.7 }),
    cloth: std(clothHex),
    clothDark: std(shade(clothHex, 0.6)),
    boots: std('#1f1610'),
    trim: std('#c9a15b', { metalness: 0.5, roughness: 0.4 }),
    linen: std('#e8dcc4'),
    eye: std('#140d09', { roughness: 0.3 }),
    iron: std('#2a2a30', { metalness: 0.6, roughness: 0.4 }),
    thorn: std('#4a3320'),
    glow: std('#ffcf6b', { emissive: '#ff9a2e', emissiveIntensity: 2 }),
    feather: std('#0d0d12', { roughness: 0.5 }),
    beak: std('#d9b44a'),
  };

  const root = new THREE.Group();
  const pose = new THREE.Group();
  root.add(pose);
  const heightScale = [1, 0.86, 1.13][a.height] ?? 1;
  const widthScale = [1, 0.84, 1.28][a.build] ?? 1;
  pose.scale.setScalar(heightScale);

  // ---- body (scaled in width by build)
  const trunk = new THREE.Group();
  trunk.scale.set(widthScale, 1, widthScale);
  pose.add(trunk);
  const longOutfit = a.outfit === 2 || a.outfit === 3;
  if (!longOutfit) {
    for (const x of [-0.15, 0.15]) {
      part(G.capsule, m.clothDark, trunk, [x, 0.42, 0], [0.12, 0.42, 0.12]);
      part(G.lowSphere, m.boots, trunk, [x, 0.1, 0.05], [0.14, 0.1, 0.19]);
    }
  }
  const shoulderY = 1.55;
  switch (a.outfit) {
    case 1: // doublet
      part(G.cylinder, m.cloth, trunk, [0, 1.15, 0], [0.36, 0.85, 0.3]);
      part(G.cylinder, m.clothDark, trunk, [0, 0.72, 0], [0.4, 0.22, 0.33]);
      part(G.torus, m.boots, trunk, [0, 0.86, 0], [0.37, 0.37, 0.4], [Math.PI / 2, 0, 0]);
      for (const y of [1.0, 1.18, 1.36]) part(G.lowSphere, m.trim, trunk, [0, y, 0.3], [0.035, 0.035, 0.035]);
      break;
    case 2: // robe (to the ground)
      part(G.cylinder, m.cloth, trunk, [0, 0.8, 0], [1, 1.6, 1]).scale.set(0.42, 1.6, 0.36);
      (trunk.children.at(-1) as THREE.Mesh).geometry = new THREE.CylinderGeometry(0.75, 1.35, 1, 18);
      part(G.torus, m.linen, trunk, [0, 1.0, 0], [0.37, 0.37, 0.6], [Math.PI / 2, 0, 0]);
      break;
    case 3: // gown
      part(G.cylinder, m.cloth, trunk, [0, 1.25, 0], [0.3, 0.65, 0.26]);
      part(G.cone, m.cloth, trunk, [0, 0.5, 0], [0.62, 1.05, 0.55]);
      part(G.torus, m.linen, trunk, [0, 1.52, 0], [0.27, 0.27, 0.5], [Math.PI / 2, 0, 0]);
      break;
    case 4: // apron
      part(G.cylinder, m.cloth, trunk, [0, 1.15, 0], [0.36, 0.85, 0.3]);
      part(G.box, m.linen, trunk, [0, 0.95, 0.27], [0.46, 0.9, 0.04]);
      part(G.box, m.linen, trunk, [0, 1.38, 0.28], [0.3, 0.3, 0.04]);
      break;
    default: // cloak
      part(G.cylinder, m.cloth, trunk, [0, 1.15, 0], [0.36, 0.85, 0.3]);
      part(G.capeBack, m.clothDark, trunk, [0, 0.9, -0.02], [0.42, 1.35, 0.4]).material = new THREE.MeshStandardMaterial({ color: shade(clothHex, 0.55), side: THREE.DoubleSide, roughness: 0.9 });
      part(G.lowSphere, m.trim, trunk, [0, 1.5, 0.3], [0.06, 0.06, 0.04]);
      break;
  }
  // arms + hands
  for (const side of [-1, 1]) {
    part(G.capsule, a.outfit === 4 ? m.cloth : m.cloth, trunk, [side * 0.44, 1.18, 0], [0.1, 0.38, 0.1], [0, 0, side * 0.18]);
    part(G.lowSphere, m.skin, trunk, [side * 0.52, 0.78, 0.02], [0.1, 0.1, 0.1]);
  }

  // ---- head
  const head = new THREE.Group();
  head.position.y = shoulderY + 0.52;
  pose.add(head);
  part(G.cylinder, m.skin, pose, [0, shoulderY + 0.06, 0], [0.11, 0.16, 0.11]);
  part(G.sphere, m.skin, head, [0, 0, 0], [0.44, 0.46, 0.42]);
  part(G.lowSphere, m.skinDark, head, [0, -0.05, 0.4], [0.06, 0.07, 0.05]); // nose
  const eyeScale: [number, number][] = [[1, 1], [1.05, 0.45], [1.3, 1.3], [1, 0.7]];
  const [ex, ey] = eyeScale[a.eyes] ?? eyeScale[0];
  for (const x of [-0.15, 0.15]) {
    part(G.lowSphere, m.eye, head, [x, 0.06, 0.37], [0.055 * ex, 0.065 * ey, 0.04]);
    if (a.eyes === 3) part(G.lowSphere, m.skinDark, head, [x, -0.03, 0.36], [0.07, 0.025, 0.03]);
  }
  part(G.box, m.skinDark, head, [0, -0.2, 0.38], [0.14, 0.03, 0.03]); // mouth

  // ---- hair
  const hairCap = () => part(G.capTop, m.hair, head, [0, 0.02, -0.02], [0.47, 0.5, 0.46], [-0.15, 0, 0]);
  switch (a.hair) {
    case 1: hairCap(); break;
    case 2: hairCap(); part(G.hairBack, m.hair, head, [0, -0.38, -0.04], [0.45, 0.85, 0.44]).material = new THREE.MeshStandardMaterial({ color: m.hair.color, side: THREE.DoubleSide, roughness: 0.7 }); break;
    case 3: hairCap(); for (const x of [-0.3, 0.3]) for (let i = 0; i < 4; i++) part(G.lowSphere, m.hair, head, [x, -0.3 - i * 0.16, -0.12], [0.09, 0.09, 0.09]); break;
    case 4: hairCap(); for (let i = 0; i < 9; i++) { const a2 = (i / 9) * Math.PI * 2; part(G.cone, m.hair, head, [Math.cos(a2) * 0.3, 0.32, Math.sin(a2) * 0.3 - 0.05], [0.09, 0.3, 0.09], [Math.sin(a2) * 0.6, 0, -Math.cos(a2) * 0.6]); } break;
    case 5: hairCap(); part(G.sphere, m.hair, head, [0, 0.42, -0.2], [0.17, 0.17, 0.17]); break;
    case 6: { // hood
      const hood = part(G.hood, m.clothDark, head, [0, 0.03, -0.03], [0.52, 0.56, 0.52], [-0.35, 0, 0]);
      hood.material = new THREE.MeshStandardMaterial({ color: shade(clothHex, 0.7), side: THREE.DoubleSide, roughness: 0.9 });
      part(G.cone, m.clothDark, head, [0, 0.25, -0.42], [0.18, 0.5, 0.18], [-1.9, 0, 0]);
      break;
    }
    default: break; // bald
  }

  // ---- accessory
  switch (a.accessory) {
    case 1: // tricorn hat
      part(G.cone3, m.boots, head, [0, 0.42, 0], [0.62, 0.1, 0.62], [0, Math.PI, 0]);
      part(G.cylinder, m.boots, head, [0, 0.55, 0], [0.33, 0.24, 0.33]);
      part(G.torus, m.trim, head, [0, 0.47, 0], [0.34, 0.34, 0.3], [Math.PI / 2, 0, 0]);
      break;
    case 2: // plague-doctor style mask (generic)
      part(G.cone, m.linen, head, [0, -0.06, 0.62], [0.12, 0.5, 0.12], [Math.PI / 2, 0, 0]);
      for (const x of [-0.15, 0.15]) part(G.cylinder, m.iron, head, [x, 0.07, 0.4], [0.08, 0.03, 0.08], [Math.PI / 2, 0, 0]);
      break;
    case 3: // monocle
      part(G.torus, m.trim, head, [0.15, 0.06, 0.41], [0.09, 0.09, 0.09]);
      part(G.cylinder, m.trim, head, [0.22, -0.18, 0.38], [0.008, 0.4, 0.008], [0, 0, 0.3]);
      break;
    case 4: // crown of thorns
      part(G.torus, m.thorn, head, [0, 0.27, 0], [0.42, 0.42, 0.6], [Math.PI / 2 - 0.12, 0, 0]);
      for (let i = 0; i < 10; i++) { const a2 = (i / 10) * Math.PI * 2; part(G.cone, m.thorn, head, [Math.cos(a2) * 0.42, 0.3, Math.sin(a2) * 0.42], [0.025, 0.14, 0.025], [Math.sin(a2) * 1.2, 0, -Math.cos(a2) * 1.2]); }
      break;
    case 5: { // lantern in the right hand
      const lant = new THREE.Group();
      lant.position.set(0.55 * widthScale, 0.6, 0.12);
      pose.add(lant);
      part(G.box, m.glow, lant, [0, 0, 0], [0.16, 0.22, 0.16]);
      part(G.cone, m.iron, lant, [0, 0.17, 0], [0.13, 0.12, 0.13]);
      part(G.torus, m.iron, lant, [0, 0.27, 0], [0.06, 0.06, 0.06]);
      break;
    }
    case 6: { // raven on the left shoulder
      const bird = new THREE.Group();
      bird.position.set(-0.4 * widthScale, shoulderY + 0.12, -0.02);
      pose.add(bird);
      part(G.sphere, m.feather, bird, [0, 0, 0], [0.13, 0.12, 0.2]);
      part(G.sphere, m.feather, bird, [0, 0.13, 0.12], [0.09, 0.09, 0.09]);
      part(G.cone, m.beak, bird, [0, 0.12, 0.25], [0.03, 0.1, 0.03], [Math.PI / 2, 0, 0]);
      part(G.cone, m.feather, bird, [0, -0.02, -0.25], [0.08, 0.22, 0.04], [-Math.PI / 2 - 0.4, 0, 0]);
      break;
    }
    default: break;
  }

  if (opts.ghost) makeGhost(root);

  // gentle idle: breathing + slight sway, de-synchronised per figure
  const phase = Math.random() * Math.PI * 2;
  root.userData.pose = pose;
  root.userData.head = head;
  root.userData.animate = (t: number) => {
    trunk.scale.y = 1 + Math.sin(t * 1.6 + phase) * 0.012;
    head.position.y = shoulderY + 0.52 + Math.sin(t * 1.6 + phase) * 0.012;
    head.rotation.y = Math.sin(t * 0.4 + phase) * 0.12;
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

/** Lie the figure down (asleep at night) or stand it back up. */
export function setAsleep(fig: THREE.Object3D, asleep: boolean) {
  const pose = fig.userData.pose as THREE.Group | undefined;
  if (!pose) return;
  pose.rotation.x = asleep ? -Math.PI / 2 : 0;
  pose.position.z = asleep ? 0.9 : 0;
  pose.position.y = asleep ? 0.3 : pose.position.y;
}

/** Dispose per-figure materials (geometries are shared and kept). */
export function disposeCharacter(fig: THREE.Object3D) {
  fig.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) mat.dispose();
    const shared = Object.values(G) as THREE.BufferGeometry[];
    if (!shared.includes(mesh.geometry)) mesh.geometry.dispose();
  });
}
