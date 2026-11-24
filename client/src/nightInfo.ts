// Storyteller helpers worked out from the Grimoire: the "true" information for info characters,
// reminder tokens an action implies, and warnings before a kill that the rules would stop.
// These are suggestions only: the Storyteller can always change them (e.g. to lie to a drunk player).
import { CHARACTER_BY_ID } from '../../shared/characters';
import type { GameView, StorytellerSelf, GrimoireSeat } from '../../shared/types';
import { tr } from './i18n';

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
    return { card: { text: tr("One of these two players is this character:"), playerIds: [a, b], characterIds: [c] }, pair: { a, b, c }, why: tr("{x} really is the {x2}; {x3} is a random other player.", { x: name(x), x2: ch(c), x3: name(y) }) };
  };

  switch (step) {
    case 'washerwoman': return pairOf('townsfolk');
    case 'investigator': return pairOf('minion');
    case 'librarian': return pairOf('outsider') ?? { card: { text: tr("There are no Outsiders in play.") }, why: tr("No Outsiders are in play.") };
    case 'chef': {
      let pairs = 0;
      for (let i = 0; i < n; i++) if (evil(view.players[i].id) && evil(view.players[(i + 1) % n].id)) pairs++;
      return { card: { text: tr("You learn: {pairs}", { pairs }) }, value: pairs, why: tr(pairs === 1 ? "1 pair of evil players sit next to each other." : "{pairs} pairs of evil players sit next to each other.", { pairs }) };
    }
    case 'empath': {
      const living = (dir: 1 | -1) => { for (let k = 1; k < n; k++) { const p = view.players[(idx(recipient) + dir * k + n * k) % n]; if (p.id !== recipient && p.alive) return p.id; } return null; };
      const ns = [...new Set([living(-1), living(1)].filter((x): x is string => !!x))];
      const count = ns.filter(evil).length;
      return { card: { text: tr("You learn: {count}", { count }) }, value: count, why: tr("Living neighbours: {x} ({count} evil).", { x: ns.map(name).join(tr(' and ')), count }) };
    }
    case 'fortuneteller': {
      const chosen = grim[recipient]?.nightChoice ?? [];
      if (chosen.length < 2) return { card: null, why: tr("Waiting for the Fortune Teller to choose two players.") };
      const hit = chosen.slice(0, 2).filter(id => typeOf(grim[id]) === 'demon' || grim[id]?.reminders.some(r => r.toLowerCase() === 'red herring'));
      return { card: { text: tr(hit.length ? 'Yes' : 'No') }, value: hit.length ? 'yes' : 'no', why: hit.length ? tr(hit.length > 1 ? '{names} are the Demon or the red herring.' : '{names} is the Demon or the red herring.', { names: hit.map(name).join(', ') }) : tr('Neither is the Demon or the red herring.') };
    }
    case 'undertaker': {
      const ex = self.lastExecutedId;
      if (!ex) return { card: null, why: tr("Nobody was executed today: the Undertaker learns nothing.") };
      const c = grim[ex]?.characterId;
      return { card: { text: tr("The executed player was:"), playerIds: [ex], characterIds: c ? [c] : [] }, why: tr("{x} was executed; they are the {x2}.", { x: name(ex), x2: ch(c) }) };
    }
    case 'ravenkeeper': {
      const chosen = grim[recipient]?.nightChoice?.[0];
      if (!chosen) return { card: null, why: tr("Waiting for the Ravenkeeper to choose a player.") };
      const c = grim[chosen]?.characterId;
      return { card: { text: tr("You learn this character:"), playerIds: [chosen], characterIds: c ? [c] : [] }, why: tr("{x} is the {x2}.", { x: name(chosen), x2: ch(c) }) };
    }
    case 'clockmaker': {
      const demons = view.players.filter(p => typeOf(grim[p.id]) === 'demon').map(p => idx(p.id));
      const minions = view.players.filter(p => typeOf(grim[p.id]) === 'minion').map(p => idx(p.id));
      if (!demons.length || !minions.length) return null;
      let best = n;
      for (const d of demons) for (const m of minions) best = Math.min(best, Math.abs(d - m), n - Math.abs(d - m));
      return { card: { text: tr("You learn: {best}", { best }) }, value: best, why: tr(best === 1 ? "The Demon is 1 step from the nearest Minion." : "The Demon is {best} steps from the nearest Minion.", { best }) };
    }
    // ---- Bad Moon Rising, Sects & Violets, Experimental
    case 'oracle': {
      const dead = seats.filter(g => !pub(g.id)?.alive && g.alignment === 'evil').length;
      return { card: { text: tr('You learn: {n}', { n: dead }) }, value: dead, why: tr('{n} dead players are evil.', { n: dead }) };
    }
    case 'flowergirl': {
      const demons = seats.filter(g => typeOf(g) === 'demon').map(g => g.id);
      const voted = (self.allVotes ?? []).some(v => v.day === view.day && v.yes.some(id => demons.includes(id)));
      return { card: { text: tr(voted ? 'Yes' : 'No') }, value: voted ? 'yes' : 'no', why: tr(voted ? 'The Demon voted today.' : 'The Demon did not vote today (secret votes are not counted here).') };
    }
    case 'towncrier': {
      const minions = seats.filter(g => typeOf(g) === 'minion').map(g => g.id);
      const nominated = (self.allVotes ?? []).some(v => v.day === view.day && !v.exile && minions.includes(v.nominatorId));
      return { card: { text: tr(nominated ? 'Yes' : 'No') }, value: nominated ? 'yes' : 'no', why: tr(nominated ? 'A Minion nominated today.' : 'No Minion nominated today.') };
    }
    case 'seamstress': {
      const chosen = grim[recipient]?.nightChoice ?? [];
      if (chosen.length < 2) return { card: null, why: tr('Waiting for the Seamstress to choose two players (or not to use the ability tonight).') };
      const same = grim[chosen[0]]?.alignment === grim[chosen[1]]?.alignment;
      return { card: { text: tr(same ? 'Yes' : 'No') }, value: same ? 'yes' : 'no', why: tr(same ? '{a} and {b} are on the same team.' : '{a} and {b} are on different teams.', { a: name(chosen[0]), b: name(chosen[1]) }) };
    }
    case 'chambermaid': {
      const chosen = (grim[recipient]?.nightChoice ?? []).slice(0, 2);
      if (chosen.length < 2) return { card: null, why: tr('Waiting for the Chambermaid to choose two players.') };
      const tonight = new Set(self.nightOrder.map(s => s.id));
      const woke = chosen.filter(id => tonight.has(grim[id]?.characterId ?? '')).length;
      return { card: { text: tr('You learn: {n}', { n: woke }) }, value: woke, why: tr('{n} of them have a character on tonight\'s night order (check whether they really woke).', { n: woke }) };
    }
    case 'dreamer': {
      const t = grim[recipient]?.nightChoice?.[0];
      if (!t) return { card: null, why: tr('Waiting for the Dreamer to choose a player.') };
      const own = grim[t]?.characterId;
      if (!own) return null;
      const good = grim[t].alignment === 'good';
      const inPlay = new Set(seats.map(g => g.characterId));
      const pool = (self.settings.script.length ? self.settings.script : Object.keys(CHARACTER_BY_ID))
        .filter(id => !inPlay.has(id) && (good ? ['minion', 'demon'] : ['townsfolk', 'outsider']).includes(CHARACTER_BY_ID[id]?.type ?? ''));
      const other = pick(pool);
      if (!other) return null;
      const [x, y] = shuffle2(own, other);
      return { card: { text: tr('This player is one of these characters:'), playerIds: [t], characterIds: [x, y] }, why: tr('{name} is the {a}; the {b} is a random character from the other team.', { name: name(t), a: ch(own), b: ch(other) }) };
    }
    case 'sage': {
      const demon = seats.find(g => typeOf(g) === 'demon' && pub(g.id)?.alive);
      if (!demon) return null;
      const y = pick(others.filter(id => id !== demon.id));
      if (!y) return null;
      const [a, b] = shuffle2(demon.id, y);
      return { card: { text: tr('One of these two players is the Demon:'), playerIds: [a, b] }, why: tr('{name} is the Demon; {other} is a random other player.', { name: name(demon.id), other: name(y) }) };
    }
    case 'noble': {
      const evils = others.filter(evil), goods = others.filter(id => !evil(id));
      if (!evils.length || goods.length < 2) return null;
      const e = pick(evils), g1 = pick(goods), g2 = pick(goods.filter(id => id !== g1));
      const three = [e, g1, g2].sort(() => Math.random() - 0.5);
      return { card: { text: tr('Exactly one of these three players is evil:'), playerIds: three }, why: tr('{name} is the evil one.', { name: name(e) }) };
    }
    case 'knight': {
      const notDemon = others.filter(id => typeOf(grim[id]) !== 'demon');
      const a = pick(notDemon), b = pick(notDemon.filter(id => id !== a));
      if (!a || !b) return null;
      return { card: { text: tr('Neither of these players is the Demon:'), playerIds: [a, b] }, why: tr('Two random players who are not the Demon.') };
    }
    case 'steward': {
      const goods = others.filter(id => !evil(id));
      const a = pick(goods);
      if (!a) return null;
      return { card: { text: tr('This player is good:'), playerIds: [a] }, why: tr('{name} is good.', { name: name(a) }) };
    }
    case 'bountyhunter': {
      const evils = others.filter(evil);
      const a = pick(evils);
      if (!a) return null;
      return { card: { text: tr('This player is evil:'), playerIds: [a] }, why: tr('{name} is evil.', { name: name(a) }) };
    }
    case 'villageidiot': {
      const t = grim[recipient]?.nightChoice?.[0];
      if (!t) return { card: null, why: tr('Waiting for the Village Idiot to choose a player.') };
      const e = evil(t);
      return { card: { text: tr(e ? 'This player is evil:' : 'This player is good:'), playerIds: [t] }, why: tr(e ? '{name} is evil.' : '{name} is good.', { name: name(t) }) };
    }
    case 'king': {
      const alive = view.players.filter(p => p.alive && !p.traveller), dead = view.players.filter(p => !p.alive && !p.traveller);
      if (dead.length < alive.length) return { card: null, why: tr('Fewer dead than living: the King learns nothing tonight.') };
      const a = pick(alive.filter(p => p.id !== recipient));
      if (!a) return null;
      const c = grim[a.id]?.characterId;
      return { card: { text: tr('One living character is:'), characterIds: c ? [c] : [] }, why: tr('{name} is the {character}.', { name: a.name, character: ch(c) }) };
    }
    case 'shugenja': {
      const i = idx(recipient);
      let cw = 0, ccw = 0;
      for (let k = 1; k < n && !cw; k++) if (evil(view.players[(i + k) % n].id)) cw = k;
      for (let k = 1; k < n && !ccw; k++) if (evil(view.players[(i - k + n) % n].id)) ccw = k;
      if (!cw && !ccw) return null;
      const dir = cw && (!ccw || cw < ccw) ? 'clockwise' : ccw && (!cw || ccw < cw) ? 'anticlockwise' : pick(['clockwise', 'anticlockwise']);
      return { card: { text: tr(dir === 'clockwise' ? 'Your closest evil player is clockwise from you.' : 'Your closest evil player is anticlockwise from you.') }, why: tr(cw === ccw ? 'Equally close both ways: you may pick either.' : 'Closest evil player: {n} seats {dir}.', { n: Math.min(cw || 99, ccw || 99), dir: tr(dir) }) };
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
  if (r.includes('protected')) out.push(tr('is protected tonight (Monk/Innkeeper)'));
  if (r.includes('safe')) out.push(tr('is safe from execution (Devil\'s Advocate)'));
  if (seat.characterId === 'soldier' && !impaired) out.push(tr('is the Soldier: the Demon cannot kill them'));
  if (seat.characterId === 'mayor' && !impaired && view.phase === 'night') out.push(tr('is the Mayor: you may kill someone else instead'));
  if (seat.characterId === 'tealady' && !impaired) out.push(tr('may be protected by the Tea Lady'));
  return out;
}
