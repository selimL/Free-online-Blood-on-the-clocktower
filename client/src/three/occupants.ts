// Who is in a room, in the shape the 3D room scene needs (kept separate so the main bundle stays three.js-free).
import type { Avatar, PublicPlayer } from '../../../shared/types';

export interface Occupant { id: string; name: string; avatar: Avatar; alive: boolean; muted?: boolean; joining?: boolean; evilMark?: boolean }

/** Convert the public game view into the occupant list for a location. */
export function occupantsOf(location: string, players: PublicPlayer[], st: { name: string; avatar: Avatar; location: string | null }): Occupant[] {
  const list: Occupant[] = players.filter(p => p.location === location).map(p => ({ id: p.id, name: p.name, avatar: p.avatar, alive: p.alive, muted: p.muted, joining: p.joining, evilMark: p.evilMark }));
  if (st.location === location) list.push({ id: 'st', name: `${st.name} · Storyteller`, avatar: st.avatar, alive: true });
  return list;
}
