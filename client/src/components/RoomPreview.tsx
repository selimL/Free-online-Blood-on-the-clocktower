// Preview any 3D interior without a game: /?preview-room=tavern (tavern, chapel, graveyard, library,
// apothecary, blacksmith, clocktower-stair, old-mill, study).
import { lazy, Suspense } from 'react';
import { ROOM_ART } from '../../../shared/characters';
import type { Occupant } from '../three/occupants';

const RoomScene = lazy(() => import('../three/RoomScene'));

const SAMPLE: Occupant[] = [
  { id: 'a', name: 'Mortimer', alive: true, avatar: { skin: 1, hair: 2, hairColor: 5, eyes: 0, outfit: 3, outfitColor: 0, accessory: 4, build: 1, height: 0 } },
  { id: 'b', name: 'Agnes', alive: true, avatar: { skin: 4, hair: 4, hairColor: 0, eyes: 2, outfit: 1, outfitColor: 1, accessory: 1, build: 0, height: 2 } },
  { id: 'c', name: 'Silas', alive: false, avatar: { skin: 0, hair: 6, hairColor: 1, eyes: 1, outfit: 2, outfitColor: 3, accessory: 2, build: 0, height: 0 } },
  { id: 'd', name: 'Beatrix', alive: true, avatar: { skin: 2, hair: 5, hairColor: 3, eyes: 3, outfit: 4, outfitColor: 6, accessory: 5, build: 2, height: 1 } },
];

export function RoomPreview({ art }: { art: string }) {
  const valid = [...ROOM_ART, 'study'].includes(art) ? art : 'tavern';
  const occupants = valid === 'study' ? SAMPLE.slice(0, 1) : SAMPLE;
  return (
    <div className="room-preview">
      <div className="stage">
        <Suspense fallback={null}><RoomScene art={valid} occupants={occupants} myId="a" reducedMotion={false} onFigureClick={() => {}} onFail={() => {}} /></Suspense>
        <div className="stage-header">{valid}</div>
      </div>
    </div>
  );
}
