// Storyteller helpers worked out from the Grimoire: the "true" information for info characters,
// reminder tokens an action implies, and warnings before a kill that the rules would stop.
// These are suggestions only: the Storyteller can always change them (e.g. to lie to a drunk player).
import { CHARACTER_BY_ID } from '../../shared/characters';
import type { GameView, StorytellerSelf, GrimoireSeat } from '../../shared/types';

export interface Suggestion {
  /** What the card will say; null when there is nothing sensible to suggest. */
  card: { text: string; playerIds?: string[]; characterIds?: string[] } | null;
  /** Human explanation for the Storyteller. */
  why: string;
  /** For number/yes-no templates: the value to highlight. */
  value?: number | 'yes' | 'no';
  /** For pair templates: pre-filled players and character. */
  pair?: { a: string; b: string; c: string };
}

const typeOf = (g?: GrimoireSeat) => CHARACTER_BY_ID[g?.characterId ?? '']?.type;
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const shuffle2 = (a: string, b: string): [string, string] => (Math.random() < 0.5 ? [a, b] : [b, a]);

/** Why this player's information may be false (shown as a warning). */
export function impairment(seat: GrimoireSeat | undefined): string | null {
  if (!seat) return null;
  if (seat.characterId === 'drunk') return 'is the Drunk';
  const r = seat.reminders.map(x => x.toLowerCase());
  if (r.includes('poisoned')) return 'is poisoned';
  if (r.includes('drunk')) return 'is drunk';
  return null;
}

export function suggestInfo(step: string, recipient: string, view: GameView): Suggestion | null {
  const self = view.self as StorytellerSelf;
  const seats = self.grimoire;
  const grim = Object.fromEntries(seats.map(g => [g.id, g]));
  const pub = (id: string) => view.players.find(p => p.id === id);
  const name = (id: string) => pub(id)?.name ?? '?';
  const ch = (id: string | null | undefined) => CHARACTER_BY_ID[id ?? '']?.name ?? '?';
  const others = view.players.filter(p => p.id !== recipient && !p.traveller).map(p => p.id);
  const n = view.players.length;
  const idx = (id: string) => view.players.findIndex(p => p.id === id);
  const evil = (id: string) => grim[id]?.alignment === 'evil';

  const pairOf = (type: 'townsfolk' | 'outsider' | 'minion'): Suggestion | null => {
    const holders = others.filter(id => typeOf(grim[id]) === type || (type === 'outsider' && grim[id]?.characterId === 'drunk'));
    if (!holders.length) return null;
    const x = pick(holders);
    const y = pick(others.filter(id => id !== x));
    if (!y) return null;
    const [a, b] = shuffle2(x, y);
    const c = grim[x].characterId!;
    return { card: { text: 'One of these two players is this character:', playerIds: [a, b], characterIds: [c] }, pair: { a, b, c }, why: `${name(x)} really is the ${ch(c)}; ${name(y)} is a random other player.` };
  };

  switch (step) {
    case 'washerwoman': return pairOf('townsfolk');
    case 'investigator': return pairOf('minion');
    case 'librarian': return pairOf('outsider') ?? { card: { text: 'There are no Outsiders in play.' }, why: 'No Outsiders are in play.' };
    case 'chef': {
      let pairs = 0;
      for (let i = 0; i < n; i++) if (evil(view.players[i].id) && evil(view.players[(i + 1) % n].id)) pairs++;
      return { card: { text: `You learn: ${pairs}` }, value: pairs, why: `${pairs} pair${pairs === 1 ? '' : 's'} of evil players sit next to each other.` };
    }
    case 'empath': {
      const living = (dir: 1 | -1) => { for (let k = 1; k < n; k++) { const p = view.players[(idx(recipient) + dir * k + n * k) % n]; if (p.id !== recipient && p.alive) return p.id; } return null; };
      const ns = [...new Set([living(-1), living(1)].filter((x): x is string => !!x))];
      const count = ns.filter(evil).length;
      return { card: { text: `You learn: ${count}` }, value: count, why: `Living neighbours: ${ns.map(name).join(' and ')} (${count} evil).` };
    }
    case 'fortuneteller': {
      const chosen = grim[recipient]?.nightChoice ?? [];
      if (chosen.length < 2) return { card: null, why: 'Waiting for the Fortune Teller to choose two players.' };
      const hit = chosen.slice(0, 2).filter(id => typeOf(grim[id]) === 'demon' || grim[id]?.reminders.some(r => r.toLowerCase() === 'red herring'));
      return { card: { text: hit.length ? 'Yes' : 'No' }, value: hit.length ? 'yes' : 'no', why: hit.length ? `${hit.map(name).join(', ')} ${hit.length > 1 ? 'are' : 'is'} the Demon or the red herring.` : 'Neither is the Demon or the red herring.' };
    }
    case 'undertaker': {
      const ex = self.lastExecutedId;
      if (!ex) return { card: null, why: 'Nobody was executed today: the Undertaker learns nothing.' };
      const c = grim[ex]?.characterId;
      return { card: { text: 'The executed player was:', playerIds: [ex], characterIds: c ? [c] : [] }, why: `${name(ex)} was executed; they are the ${ch(c)}.` };
    }
    case 'ravenkeeper': {
      const chosen = grim[recipient]?.nightChoice?.[0];
      if (!chosen) return { card: null, why: 'Waiting for the Ravenkeeper to choose a player.' };
      const c = grim[chosen]?.characterId;
      return { card: { text: 'You learn this character:', playerIds: [chosen], characterIds: c ? [c] : [] }, why: `${name(chosen)} is the ${ch(c)}.` };
    }
    case 'clockmaker': {
      const demons = view.players.filter(p => typeOf(grim[p.id]) === 'demon').map(p => idx(p.id));
      const minions = view.players.filter(p => typeOf(grim[p.id]) === 'minion').map(p => idx(p.id));
      if (!demons.length || !minions.length) return null;
      let best = n;
      for (const d of demons) for (const m of minions) best = Math.min(best, Math.abs(d - m), n - Math.abs(d - m));
      return { card: { text: `You learn: ${best}` }, value: best, why: `The Demon is ${best} step${best === 1 ? '' : 's'} from the nearest Minion.` };
    }
    default: return null;
  }
}

/** Reminder tokens implied by a night choice, e.g. the Poisoner's target gets "Poisoned". */
export const CHOICE_REMINDER: Record<string, string> = {
  poisoner: 'Poisoned', monk: 'Protected', butler: 'Master', innkeeper: 'Protected', exorcist: 'Chosen',
  devilsadvocate: 'Safe', witch: 'Cursed', cerenovus: 'Mad', pithag: 'Changed', courtier: 'Drunk', sailor: 'Drunk',
};
/** Reminders that only last one night (offered for clearing when a new night begins). */
export const NIGHTLY_REMINDERS = ['Poisoned', 'Protected', 'Master', 'Safe', 'Cursed', 'Mad', 'Chosen', 'Dead tonight'];

/** Reasons a kill would not normally happen (shown before the Storyteller confirms a kill). */
export function killWarnings(targetId: string, view: GameView): string[] {
  const self = view.self as StorytellerSelf;
  const seat = self.grimoire.find(g => g.id === targetId);
  if (!seat) return [];
  const out: string[] = [];
  const r = seat.reminders.map(x => x.toLowerCase());
  const impaired = !!impairment(seat);
  if (r.includes('protected')) out.push('is protected tonight (Monk/Innkeeper)');
  if (r.includes('safe')) out.push('is safe from execution (Devil\'s Advocate)');
  if (seat.characterId === 'soldier' && !impaired) out.push('is the Soldier: the Demon cannot kill them');
  if (seat.characterId === 'mayor' && !impaired && view.phase === 'night') out.push('is the Mayor: you may kill someone else instead');
  if (seat.characterId === 'tealady' && !impaired) out.push('may be protected by the Tea Lady');
  return out;
}
