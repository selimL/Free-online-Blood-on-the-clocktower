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
  /** The card goes to this player instead of the one being woken (e.g. the Nightwatchman's choice). */
  to?: string;
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
    // ---- more information characters
    case 'grandmother': {
      const goods = others.filter(id => !evil(id) && grim[id]?.characterId);
      const a = pick(goods);
      if (!a) return null;
      return { card: { text: tr('Your grandchild is:'), playerIds: [a], characterIds: [grim[a].characterId!] }, why: tr('{name} is the {character}. Mark them as the Grandchild.', { name: name(a), character: ch(grim[a].characterId) }) };
    }
    case 'pixie': {
      const tf = others.filter(id => typeOf(grim[id]) === 'townsfolk');
      const a = pick(tf);
      if (!a) return null;
      const c = grim[a].characterId!;
      return { card: { text: tr('This Townsfolk is in play:'), characterIds: [c] }, why: tr('{name} is the {character}.', { name: name(a), character: ch(c) }) };
    }
    case 'godfather': {
      if (view.night > 1) return { card: null, why: tr('If an Outsider died today, the Godfather chooses a player to kill (use the kill button below).') };
      const outs = seats.filter(g => typeOf(g) === 'outsider').map(g => g.characterId!);
      return { card: { text: outs.length ? tr('These Outsiders are in play:') : tr('There are no Outsiders in play.'), characterIds: outs }, why: tr('{n} Outsider(s) in play.', { n: outs.length }) };
    }
    case 'alchemist': {
      if (view.night > 1) return null;
      const inPlay = new Set(seats.map(g => g.characterId));
      const pool = (self.settings.script.length ? self.settings.script : Object.keys(CHARACTER_BY_ID)).filter(id => CHARACTER_BY_ID[id]?.type === 'minion' && !inPlay.has(id));
      const m = pick(pool);
      if (!m) return null;
      return { card: { text: tr('You have the ability of this Minion:'), characterIds: [m] }, why: tr('A Minion not in play. Mark the Alchemist with "Is the Alchemist" if you like.') };
    }
    case 'balloonist': {
      const a = pick(others);
      if (!a) return null;
      return { card: { text: tr('You learn this player:'), playerIds: [a] }, why: tr('{name} is a {type}. Choose a different character type from the one you showed last night.', { name: name(a), type: tr(TYPE_WORD[typeOf(grim[a]) ?? 'townsfolk'] ?? 'Townsfolk') }) };
    }
    case 'mathematician': {
      const broken = seats.filter(g => g.reminders.some(r => /poisoned|drunk/i.test(r)) && ['townsfolk', 'outsider'].includes(typeOf(g) ?? '')).length;
      return { card: { text: tr('You learn: {n}', { n: broken }) }, value: broken, why: tr('{n} good players are marked drunk or poisoned. Count only abilities that actually malfunctioned since dawn, so adjust if needed.', { n: broken }) };
    }
    case 'general': {
      const alive = seats.filter(g => pub(g.id)?.alive && !pub(g.id)?.traveller);
      const good = alive.filter(g => g.alignment === 'good').length, bad = alive.length - good;
      const verdict = bad === 0 ? 'Good' : alive.length <= 4 || bad * 2 >= alive.length ? 'Evil' : good >= bad * 3 ? 'Good' : 'Neither';
      return { card: { text: tr(verdict === 'Good' ? 'The good team is winning.' : verdict === 'Evil' ? 'The evil team is winning.' : 'Neither team is winning.') }, why: tr('{good} good and {evil} evil players are alive. This is your judgement: change it if you see the game differently.', { good, evil: bad }) };
    }
    case 'highpriestess': {
      const a = pick(others.filter(id => pub(id)?.alive));
      if (!a) return null;
      return { card: { text: tr('Talk to this player:'), playerIds: [a] }, why: tr('Your choice: pick the player you think they should talk to most (a random living player is suggested).') };
    }
    case 'nightwatchman': {
      const t = grim[recipient]?.nightChoice?.[0];
      if (!t) return { card: null, why: tr('Waiting for the Nightwatchman to choose a player (once per game).') };
      return { card: { text: tr('This player is the Nightwatchman:'), playerIds: [recipient] }, to: t, why: tr('Wake {name} and show them who the Nightwatchman is.', { name: name(t) }) };
    }
    case 'preacher': {
      const t = grim[recipient]?.nightChoice?.[0];
      if (!t) return { card: null, why: tr('Waiting for the Preacher to choose a player.') };
      if (typeOf(grim[t]) !== 'minion') return { card: null, why: tr('{name} is not a Minion: nothing happens.', { name: name(t) }) };
      return { card: { text: tr('The Preacher has chosen you: you are at a sermon and have lost your ability.') }, to: t, why: tr('{name} is a Minion: wake them, tell them, and mark them "At a sermon".', { name: name(t) }) };
    }
    case 'exorcist': {
      const t = grim[recipient]?.nightChoice?.[0];
      if (!t) return { card: null, why: tr('Waiting for the Exorcist to choose a player.') };
      if (typeOf(grim[t]) !== 'demon') return { card: null, why: tr('{name} is not the Demon: nothing happens.', { name: name(t) }) };
      return { card: { text: tr('This player is the Exorcist:'), playerIds: [recipient] }, to: t, why: tr('{name} is the Demon: show them the Exorcist. The Demon does not wake to kill tonight.', { name: name(t) }) };
    }
    case 'harlot': {
      const t = grim[recipient]?.nightChoice?.[0];
      if (!t) return { card: null, why: tr('Waiting for the Harlot to choose a player.') };
      const c = grim[t]?.characterId;
      return { card: { text: tr('If they agreed, this is their character:'), playerIds: [t], characterIds: c ? [c] : [] }, why: tr('Wake {name} and ask whether they agree. If they do, show the Harlot their character (and decide whether both die if one is evil).', { name: name(t) }) };
    }
    case 'choirboy': {
      const king = seats.find(g => g.characterId === 'king');
      const demon = seats.find(g => typeOf(g) === 'demon');
      if (!king || pub(king.id)?.alive || !demon) return { card: null, why: tr('Only wakes if the Demon killed the King.') };
      return { card: { text: tr('This player is the Demon:'), playerIds: [demon.id] }, why: tr('{name} is the Demon.', { name: name(demon.id) }) };
    }
    case 'eviltwin': {
      const twin = seats.find(g => g.reminders.includes('Twin'));
      if (!twin) return { card: null, why: tr('Choose a good player as the twin and mark them "Twin"; then both learn each other.') };
      return { card: { text: tr('Your twin is:'), playerIds: [twin.id], characterIds: twin.characterId ? [twin.characterId] : [] }, why: tr('Show the Evil Twin their twin, then wake {name} and show them the Evil Twin.', { name: name(twin.id) }) };
    }
    case 'boffin': {
      const inPlay = new Set(seats.map(g => g.characterId));
      const pool = (self.settings.script.length ? self.settings.script : Object.keys(CHARACTER_BY_ID)).filter(id => ['townsfolk', 'outsider'].includes(CHARACTER_BY_ID[id]?.type ?? '') && !inPlay.has(id));
      const c = pick(pool);
      if (!c) return null;
      return { card: { text: tr('The Demon has the ability of:'), characterIds: [c] }, why: tr('A good character not in play: show it to the Boffin and to the Demon.') };
    }
    case 'summoner': {
      if (view.night <= 1) {
        const inPlay = new Set(seats.map(g => g.characterId));
        const pool = (self.settings.script.length ? self.settings.script : Object.keys(CHARACTER_BY_ID)).filter(id => CHARACTER_BY_ID[id]?.type === 'townsfolk' && !inPlay.has(id));
        const three = [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
        return { card: { text: tr('Three characters not in play (your bluffs):'), characterIds: three }, why: tr('Give the Summoner three bluffs. On the third night they choose who becomes the Demon.') };
      }
      return { card: null, why: tr(view.night === 3 ? 'Third night: the Summoner chooses a player and a Demon; that player becomes that evil Demon (change it in the Grimoire).' : 'The Summoner does nothing tonight (they act on the third night).') };
    }
    case 'spy': case 'widow':
      return { card: null, why: tr('Let them see the Grimoire: show them the characters and reminders, then let them choose (the Widow chooses who to poison on the first night).') };
    default: {
      const g = GUIDE[step];
      if (!g) return null;
      const c = grim[recipient]?.nightChoice ?? [];
      return { card: null, why: tr(g, { target: c[0] ? name(c[0]) : tr('(no choice yet)'), target2: c[1] ? name(c[1]) : tr('(no choice yet)') }) };
    }
  }
}

const TYPE_WORD: Record<string, string> = { townsfolk: 'Townsfolk', outsider: 'Outsider', minion: 'Minion', demon: 'Demon', traveller: 'Traveller' };

/** What to do with each acting character's choice (English; translated where shown). */
export const GUIDE: Record<string, string> = {
  poisoner: 'Mark {target} as Poisoned: their ability fails tonight and tomorrow.',
  monk: 'Mark {target} as Protected: the Demon cannot kill them tonight.',
  butler: 'Mark {target} as the Butler\'s Master.',
  innkeeper: '{target} and {target2} cannot die tonight. Mark them Protected, and mark one of them Drunk until dusk.',
  sailor: 'Either the Sailor or {target} is drunk until dusk: mark one of them Drunk.',
  devilsadvocate: 'Mark {target} as Safe: if executed tomorrow, they survive.',
  witch: 'Mark {target} as Cursed: if they nominate tomorrow, they die.',
  cerenovus: 'Wake {target} and tell them which character they must be "mad" about tomorrow. Mark them Mad.',
  pithag: '{target} becomes the chosen character (change it in the Grimoire). If it is a Demon, you decide tonight\'s deaths.',
  courtier: 'The named character is drunk for three days and nights: mark its holder Drunk 1.',
  bureaucrat: 'Mark {target} with "3 votes": their vote counts three times tomorrow.',
  thief: 'Mark {target} with "Negative vote": their vote counts as minus one tomorrow.',
  harpy: 'Wake {target}: tomorrow they must be "mad" that {target2} is evil. Mark them Mad and 2nd.',
  fearmonger: 'Mark {target} with Fear. If it is a new player, announce that the Fearmonger has chosen someone.',
  pukka: 'Mark {target} as Poisoned. Whoever the Pukka poisoned before dies now (use the kill button for them).',
  lleech: 'First night: mark {target} as Poisoned (the Lleech dies only if they die). Later nights: {target} dies.',
  snakecharmer: 'If {target} is the Demon, swap their characters and alignments (Grimoire), and mark the old Demon Poisoned.',
  barista: 'Choose a player: either they are sober and get true information, or their ability works twice, until dusk. Tell them which.',
  bonecollector: '{target} (dead) gets their ability back until dusk: mark them "Has ability".',
  professor: 'If {target} is a dead Townsfolk, they come back to life (use Revive in the Grimoire).',
  gambler: 'The Gambler guessed a character for {target}. If the guess is wrong, the Gambler dies (kill them).',
  assassin: '{target} dies, even if something would normally protect them. Mark the Assassin "No ability".',
  godfather: 'If an Outsider died today, {target} dies.',
  acrobat: 'If {target} is or becomes drunk or poisoned tonight, the Acrobat dies.',
  lycanthrope: 'If {target} is good, they die and the Demon does not kill tonight.',
  huntsman: 'If {target} is the Damsel, she becomes a Townsfolk not in play (change it in the Grimoire). Mark the Huntsman "No ability".',
  ogre: 'The Ogre secretly takes {target}\'s alignment. Mark {target} as Friend.',
  cultleader: 'The Cult Leader takes the alignment of one of their living neighbours. Change it in the Grimoire if needed.',
  philosopher: 'If they choose a good character, they gain its ability; if it is in play, its holder becomes drunk. Mark "Is the Philosopher".',
  engineer: 'If they use it, change the evil characters (Grimoire) to the ones they name.',
  organgrinder: 'Ask whether they want to be drunk until dusk; mark them Drunk if so.',
  wraith: 'The Wraith may open their eyes whenever other evil players are woken tonight.',
  lunatic: 'Wake the Lunatic as if they were the Demon. The real Demon learns whom they chose.',
  magician: 'The Demon thinks the Magician is a Minion, and Minions think they are the Demon: show info accordingly.',
  poppygrower: 'While the Poppy Grower lives, Minions and the Demon do not learn each other.',
  marionette: 'The Marionette thinks they are good. Make sure the Demon knows who they are.',
  snitch: 'Give each Minion three characters not in play as bluffs.',
  damsel: 'All Minions learn that a Damsel is in play.',
  xaan: 'On night X, all Townsfolk are poisoned until dusk.',
  yaggababble: 'Give the Yaggababble their secret phrase (⚖ Special rules). Tonight, kill up to as many players as times they said it.',
  mezepheles: 'Give the Mezepheles their secret word (⚖ Special rules). If a good player said it, they turn evil tonight.',
  amnesiac: 'The Amnesiac does not know their ability. Act on it as you decided.',
  apprentice: 'Show the Apprentice the ability they receive (a Townsfolk if good, a Minion if evil).',
  juggler: 'Count how many of the Juggler\'s guesses today were right, and show the number.',
  hatter: 'If the Hatter died today, the Minions and Demon may choose new characters.',
  barber: 'If the Barber died, the Demon may choose two players to swap characters.',
  sweetheart: 'When the Sweetheart dies, choose a player to be drunk for the rest of the game.',
  banshee: 'If the Demon killed the Banshee, announce it: from now on they may nominate twice and vote twice.',
  farmer: 'If the Farmer died tonight, a living good player becomes a Farmer: wake them and tell them.',
  tinker: 'The Tinker might die tonight: your choice.',
  moonchild: 'If the Moonchild chose a good player, that player dies tonight.',
  gossip: 'If the Gossip\'s statement today was true, choose a player to die tonight.',
  scarletwoman: 'If the Demon died with 5 or more players alive, the Scarlet Woman becomes the Demon: change it in the Grimoire and tell them.',
  imp: '{target} dies tonight. If the Imp chose themselves, a Minion becomes the Imp.',
  zombuul: 'If nobody died today, {target} dies tonight.',
  shabaloth: '{target} and {target2} die tonight. You may bring back one player the Shabaloth killed last night.',
  po: 'If the Po chose nobody last night, they choose three players tonight; otherwise {target} dies.',
  fanggu: '{target} dies. If {target} is an Outsider (first time), they become an evil Fang Gu instead and the Fang Gu dies.',
  nodashii: '{target} dies. The No Dashii\'s two nearest Townsfolk neighbours are poisoned.',
  vortox: '{target} dies. Remember: Townsfolk only receive false information.',
  vigormortis: '{target} dies. If it is a Minion, they keep their ability and poison a neighbouring Townsfolk.',
  ojo: 'The Ojo names a character: its holder dies. If it is not in play, you choose who dies.',
  alhadikhia: 'Announce the three chosen players at dawn: each secretly chooses to live or die (⚖ Group actions).',
  lordoftyphon: '{target} dies tonight.',
  kazali: '{target} dies tonight.',
  legion: 'A player might die tonight: your choice among the Legion\'s nominations.',
  lilmonsta: 'The Minions choose who babysits Lil\' Monsta. {target} might die tonight.',
};


/** Reminder tokens implied by a night choice, e.g. the Poisoner's target gets "Poisoned". */
export const CHOICE_REMINDER: Record<string, string> = {
  poisoner: 'Poisoned', monk: 'Protected', butler: 'Master', innkeeper: 'Protected', exorcist: 'Chosen',
  devilsadvocate: 'Safe', witch: 'Cursed', cerenovus: 'Mad', pithag: 'Changed', courtier: 'Drunk', sailor: 'Drunk',
  bureaucrat: '3 votes', thief: 'Negative vote', harpy: 'Mad', fearmonger: 'Fear', preacher: 'At a sermon', widow: 'Poisoned',
  pukka: 'Poisoned', lleech: 'Poisoned', ogre: 'Friend', bonecollector: 'Has ability',
};
/** Characters whose choice can kill: the helper offers a kill button for each chosen player. */
export const KILLERS = new Set(['imp', 'po', 'shabaloth', 'fanggu', 'nodashii', 'vortox', 'vigormortis', 'zombuul', 'lleech', 'lordoftyphon', 'kazali',
  'legion', 'lilmonsta', 'lycanthrope', 'assassin', 'godfather', 'gossip', 'moonchild', 'yaggababble']);
/** Reminders that only last one night (offered for clearing when a new night begins). */
export const NIGHTLY_REMINDERS = ['Poisoned', 'Protected', 'Master', 'Safe', 'Cursed', 'Mad', 'Chosen', 'Dead tonight', '3 votes', 'Negative vote'];

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
