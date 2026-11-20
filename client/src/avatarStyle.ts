// Avatar palettes and option names, shared by the 2D portrait (SVG) and the 3D figure.
import type { Avatar as AvatarT } from '../../shared/types';

export const SKINS = ['#f3d6c1', '#e7b996', '#c98e64', '#a26a43', '#6f4428', '#d8c9b8'];
export const HAIR_COLORS = ['#1b1410', '#4a2d1a', '#8a5a2b', '#c9a15b', '#d9d2c5', '#7a1f1f', '#2f3b4f', '#5c3d6e'];
export const OUTFIT_COLORS = ['#5a1a1a', '#1f2f4a', '#2e3b25', '#3d2b4f', '#4a3a24', '#202020', '#6b5a3a', '#7c2d12'];
export const LABELS: Record<keyof AvatarT, { name: string; options: string[] }> = {
  skin: { name: 'Complexion', options: ['Pale', 'Fair', 'Tan', 'Bronze', 'Deep', 'Ashen'] },
  hair: { name: 'Hair', options: ['Bald', 'Short', 'Long', 'Braided', 'Wild', 'Bun', 'Hooded'] },
  hairColor: { name: 'Hair colour', options: ['Raven', 'Chestnut', 'Auburn', 'Flaxen', 'Silver', 'Blood', 'Slate', 'Plum'] },
  eyes: { name: 'Eyes', options: ['Wary', 'Narrow', 'Wide', 'Weary'] },
  outfit: { name: 'Clothing', options: ['Cloak', 'Doublet', 'Robe', 'Gown', 'Apron'] },
  outfitColor: { name: 'Cloth colour', options: ['Wine', 'Midnight', 'Moss', 'Plum', 'Umber', 'Ink', 'Linen', 'Rust'] },
  accessory: { name: 'Accessory', options: ['None', 'Tricorn', 'Plague mask', 'Monocle', 'Crown of thorns', 'Lantern', 'Raven'] },
  build: { name: 'Build', options: ['Average', 'Slim', 'Stout'] },
  height: { name: 'Height', options: ['Average', 'Short', 'Tall'] },
};
