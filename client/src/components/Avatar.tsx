import { useEffect, useRef } from 'react';
import type { Avatar as AvatarT } from '../../../shared/types';
import { AVATAR_LIMITS } from '../../../shared/types';

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
};

interface Props {
  avatar: AvatarT; size?: number; sleeping?: boolean; ghost?: boolean; speaking?: boolean;
  video?: MediaStreamTrack; title?: string; className?: string;
}

function hairPath(style: number) {
  switch (style) {
    case 1: return 'M32 52 Q32 26 60 24 Q88 26 88 52 Q80 38 60 38 Q40 38 32 52Z';
    case 2: return 'M30 56 Q28 24 60 22 Q92 24 90 56 L92 92 L80 92 L82 52 Q60 36 38 52 L40 92 L28 92Z';
    case 3: return 'M32 52 Q32 26 60 24 Q88 26 88 52 Q78 38 60 38 Q42 38 32 52Z M84 50 q10 20 2 44 q-6 -2 -6 -10 q6 -16 0 -30z';
    case 4: return 'M28 54 L24 34 L36 40 L38 22 L50 32 L60 16 L70 32 L82 22 L84 40 L96 34 L92 54 Q80 38 60 38 Q40 38 28 54Z';
    case 5: return 'M32 52 Q32 26 60 26 Q88 26 88 52 Q80 38 60 38 Q40 38 32 52Z M48 22 a12 10 0 1 0 24 0 a12 10 0 1 0 -24 0';
    default: return '';
  }
}

export function Avatar({ avatar, size = 72, sleeping, ghost, speaking, video, title, className }: Props) {
  const skin = SKINS[avatar.skin] ?? SKINS[0];
  const hairC = HAIR_COLORS[avatar.hairColor] ?? HAIR_COLORS[0];
  const cloth = OUTFIT_COLORS[avatar.outfitColor] ?? OUTFIT_COLORS[0];
  const cls = ['avatar', ghost ? 'ghost' : '', speaking ? 'speaking' : '', className ?? ''].join(' ');
  if (video) return <VideoFace track={video} size={size} className={cls} title={title} />;
  const eyes = () => {
    if (sleeping) return <g stroke="#2a1a12" strokeWidth="2.2" fill="none"><path d="M46 60 q5 4 10 0" /><path d="M64 60 q5 4 10 0" /></g>;
    const ry = [3.2, 1.6, 4.4, 2.6][avatar.eyes] ?? 3;
    return <g fill="#1c120c"><ellipse cx="51" cy="59" rx="3.4" ry={ry} /><ellipse cx="69" cy="59" rx="3.4" ry={ry} />
      {avatar.eyes === 3 && <g stroke="#7b5a48" strokeWidth="1.2"><path d="M46 65 q5 2 10 0" fill="none" /><path d="M64 65 q5 2 10 0" fill="none" /></g>}</g>;
  };
  const outfit = () => {
    switch (avatar.outfit) {
      case 1: return <g><path d="M22 120 Q24 88 60 86 Q96 88 98 120Z" fill={cloth} /><path d="M60 86 L60 120" stroke="#d9c79a" strokeWidth="2" strokeDasharray="3 5" /></g>;
      case 2: return <g><path d="M18 120 Q22 84 60 84 Q98 84 102 120Z" fill={cloth} /><path d="M44 86 L60 104 L76 86" fill="none" stroke="#c9a15b" strokeWidth="3" /></g>;
      case 3: return <g><path d="M20 120 Q26 86 60 86 Q94 86 100 120Z" fill={cloth} /><path d="M40 92 Q60 102 80 92" fill="none" stroke="#e9dcc0" strokeWidth="3" /></g>;
      case 4: return <g><path d="M22 120 Q24 88 60 86 Q96 88 98 120Z" fill="#5b4a3a" /><rect x="42" y="94" width="36" height="26" rx="4" fill={cloth} /></g>;
      default: return <g><path d="M14 120 Q20 82 60 82 Q100 82 106 120Z" fill={cloth} /><circle cx="60" cy="90" r="4" fill="#c9a15b" /></g>;
    }
  };
  const accessory = () => {
    switch (avatar.accessory) {
      case 1: return <path d="M24 36 Q60 4 96 36 Q60 26 24 36Z M30 34 L60 12 L90 34" fill="#1b1410" stroke="#3a2a1a" />;
      case 2: return <path d="M50 62 Q60 60 70 62 L62 92 Q60 96 58 92Z" fill="#e8dcc4" stroke="#8a7a5a" />;
      case 3: return <g><circle cx="69" cy="59" r="7" fill="none" stroke="#c9a15b" strokeWidth="2" /><path d="M76 60 Q82 74 78 88" stroke="#c9a15b" fill="none" /></g>;
      case 4: return <g stroke="#3a2a1a" strokeWidth="2.5" fill="none"><path d="M34 36 Q60 24 86 36" /><path d="M40 32 l-3 -8 M52 28 l0 -9 M68 28 l0 -9 M80 32 l3 -8" /><circle cx="52" cy="30" r="1.6" fill="#8a1c1c" /></g>;
      case 5: return <g><rect x="92" y="78" width="14" height="20" rx="3" fill="#2a2018" /><circle cx="99" cy="88" r="5" fill="#ffcf6b" className="flicker" /></g>;
      case 6: return <path d="M14 82 q6 -14 18 -10 q4 -6 10 -2 l-6 6 q-2 10 -14 10z" fill="#0f0f14" />;
      default: return null;
    }
  };
  return (
    <svg className={cls} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <circle cx="60" cy="60" r="58" className="avatar-bg" />
      <clipPath id="clip"><circle cx="60" cy="60" r="58" /></clipPath>
      <g clipPath="url(#clip)">
        {outfit()}
        <rect x="52" y="74" width="16" height="14" fill={skin} />
        {avatar.hair === 6 && <path d="M24 70 Q24 18 60 16 Q96 18 96 70 L88 96 L32 96Z" fill={cloth} />}
        <ellipse cx="60" cy="58" rx="24" ry="27" fill={skin} />
        {avatar.hair !== 6 && <path d={hairPath(avatar.hair)} fill={hairC} />}
        {eyes()}
        <path d={sleeping ? 'M54 74 q6 2 12 0' : 'M53 73 q7 4 14 0'} stroke="#7b3a2a" strokeWidth="2" fill="none" />
        {accessory()}
      </g>
      {sleeping && <text x="88" y="30" className="zzz">z</text>}
    </svg>
  );
}

function VideoFace({ track, size, className, title }: { track: MediaStreamTrack; size: number; className: string; title?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = new MediaStream([track]);
  }, [track]);
  return <video ref={ref} className={`${className} video-face`} width={size} height={size} autoPlay muted playsInline title={title} />;
}

export function AvatarCreator({ value, onChange }: { value: AvatarT; onChange: (a: AvatarT) => void }) {
  const keys = Object.keys(AVATAR_LIMITS) as (keyof AvatarT)[];
  const step = (k: keyof AvatarT, d: number) => onChange({ ...value, [k]: (value[k] + d + AVATAR_LIMITS[k]) % AVATAR_LIMITS[k] });
  const randomize = () => onChange(Object.fromEntries(keys.map(k => [k, Math.floor(Math.random() * AVATAR_LIMITS[k])])) as unknown as AvatarT);
  return (
    <div className="avatar-creator">
      <div className="avatar-preview"><Avatar avatar={value} size={140} title="Your avatar" /></div>
      <div className="avatar-options">
        {keys.map(k => (
          <div key={k} className="avatar-row">
            <span className="label">{LABELS[k].name}</span>
            <button type="button" className="icon-btn" aria-label={`Previous ${LABELS[k].name}`} onClick={() => step(k, -1)}>‹</button>
            <span className="value">{LABELS[k].options[value[k]]}</span>
            <button type="button" className="icon-btn" aria-label={`Next ${LABELS[k].name}`} onClick={() => step(k, 1)}>›</button>
          </div>
        ))}
        <button type="button" className="btn small" onClick={randomize}>🎲 Randomise</button>
      </div>
    </div>
  );
}
