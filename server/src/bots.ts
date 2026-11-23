// Computer-controlled seats: for the practice game, and so a Storyteller can try a setup alone.
// Bots never speak on voice. In normal games they play a simple but sensible game in the room
// chat: they claim a character (good bots tell the truth as they know it, evil bots bluff), share
// their night information, nominate suspects, vote by what they believe, and pick targets when
// woken at night. They only use what their own seat could know. Everything goes through the
// normal Game methods. The practice game passes its own vote rule and gets none of this.
import { AVATAR_LIMITS, type Avatar } from '../../shared/types';
import { CHARACTER_BY_ID, CHARACTERS } from '../../shared/characters';
import { GameError, type Game, type Player } from './game';
import { evilTeamFor } from './views';

export const BOT_NAMES = ['Ada', 'Bram', 'Cora', 'Dorian', 'Edda', 'Finn', 'Greta', 'Hugo', 'Ines', 'Jasper'];

function randomAvatar(): Avatar {
  const a = {} as Avatar;
  for (const [k, max] of Object.entries(AVATAR_LIMITS)) (a as unknown as Record<string, number>)[k] = Math.floor(Math.random() * max);
  return a;
}

export function addBot(g: Game, name?: string, avatar?: Avatar): Player {
  if (g.phase !== 'lobby') throw new GameError('Bots can only join before the game starts.');
  const taken = new Set(g.players.map(p => p.name));
  const n = name ?? BOT_NAMES.find(x => !taken.has(x)) ?? `Bot ${g.players.length + 1}`;
  const p = g.join(n, avatar ?? randomAvatar(), { bot: true });
  g.changed();
  return p;
}

/** How a bot votes on the current nomination (practice games override this). */
export type BotVote = (g: Game, bot: Player) => boolean;

// ---------------------------------------------------------------- what each bot remembers
interface Memory {
  day: number; dayStart: number;
  chatAt: Map<string, number>;          // bot → when it speaks next today
  sharedNotes: Map<string, number>;     // bot → how many info cards it has already shared
  bluff: Map<string, string>;           // evil bot → its bluff character
  claims: Map<string, string>;          // anyone → character they claimed (from bot chat or the claim field)
  stageStart: number; stage: string | null;
  lastNomAt: number; nomsToday: number;
  awakeSince: Map<string, number>;      // bot → when it was woken tonight
}
const memories = new WeakMap<Game, Memory>();
function mem(g: Game): Memory {
  let m = memories.get(g);
  if (!m) {
    m = { day: -1, dayStart: 0, chatAt: new Map(), sharedNotes: new Map(), bluff: new Map(), claims: new Map(), stageStart: 0, stage: null, lastNomAt: 0, nomsToday: 0, awakeSince: new Map() };
    memories.set(g, m);
  }
  return m;
}
const pick = <T>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];
/** A stable "random" number in [0, 1) for a bot, a target and a day, so opinions don't flicker. */
function jitter(...parts: (string | number)[]) {
  let h = 2166136261;
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return (h % 1000) / 1000;
}
const charName = (id: string | null | undefined) => (id ? CHARACTER_BY_ID[id]?.name ?? id : '?');
const believesEvil = (p: Player) => (p.shownAlignment ?? (p.characterId === 'lunatic' ? 'evil' : p.alignment)) === 'evil';

/** The evil team as this bot knows it (empty for good bots). */
function teamOf(g: Game, bot: Player): Set<string> {
  return new Set(evilTeamFor(g, bot)?.members.map(m => m.id) ?? []);
}

/** What character the bot says it is. Good bots: what they believe. Evil bots: a steady bluff. */
function claimOf(g: Game, bot: Player, m: Memory): string | null {
  if (!believesEvil(bot)) return bot.shownCharacterId ?? bot.characterId;
  let b = m.bluff.get(bot.id);
  if (!b) {
    const inBag = new Set(g.settings.characters);
    const taken = new Set([...m.bluff.values(), ...m.claims.values()]);
    // the Demon's bluffs (a Minion would hear them from the Demon), then townsfolk not in play
    const bluffs = [...(evilTeamFor(g, bot)?.bluffs ?? []), ...g.demonBluffs];
    const pool = g.settings.script.length ? g.settings.script
      : CHARACTERS.filter(c => g.settings.edition === 'custom' ? ['tb', 'bmr', 'snv'].includes(c.edition) : c.edition === g.settings.edition).map(c => c.id);
    const options = [
      ...bluffs.filter(id => !taken.has(id)),
      ...pool.filter(id => CHARACTER_BY_ID[id]?.type === 'townsfolk' && !inBag.has(id) && !taken.has(id)),
    ];
    b = options[0] ?? pick(pool.filter(id => CHARACTER_BY_ID[id]?.type === 'townsfolk')) ?? 'soldier';
    m.bluff.set(bot.id, b);
  }
  return b;
}

/** How suspicious a player looks to this bot (higher = more likely evil). */
function suspicion(g: Game, bot: Player, target: Player, m: Memory): number {
  if (target.id === bot.id) return -99;
  const team = teamOf(g, bot);
  if (believesEvil(bot)) {
    // evil bots push suspicion onto good players, never onto their own team
    return team.has(target.id) ? -99 : 1 + jitter(bot.id, target.id, g.day) * 2;
  }
  let s = jitter(bot.id, target.id, g.day) * 0.8;
  const claim = m.claims.get(target.id) ?? (target.claim || null);
  const mine = bot.shownCharacterId ?? bot.characterId;
  if (claim) {
    if (claim === mine) s += 5; // they claim to be me: one of us is lying, and it isn't me
    const others = [...m.claims.entries()].filter(([id, c]) => c === claim && id !== target.id);
    if (others.length) s += 2;
  } else if (g.day > 1) s += 0.6; // silent players are a little suspicious
  for (const n of bot.notes) {
    if (!n.playerIds?.includes(target.id)) continue;
    const t = n.text.toLowerCase();
    // the card is in the game's language (English or Turkish)
    if (/\b(demon|minion|evil)\b|iblis|yardakçı|kötü/.test(t)) s += 1.2;
    if ((/\bgood\b|\btownsfolk\b|\biyi\b|kasabalı/.test(t)) && !/\bevil\b|kötü/.test(t)) s -= 1;
  }
  return s;
}

function topSuspect(g: Game, bot: Player, m: Memory) {
  const cands = g.players.filter(p => p.alive && p.id !== bot.id && !g.nominatedToday.has(p.id));
  return cands.map(p => ({ p, s: suspicion(g, bot, p, m) })).sort((a, b) => b.s - a.s)[0];
}

function say(g: Game, bot: Player, text: string) {
  try { g.sendChat(bot.id, text); } catch { /* not in a room anyone can hear */ }
}

/** One bot's turn to talk today. */
function talk(g: Game, bot: Player, m: Memory) {
  const claim = claimOf(g, bot, m);
  const firstTime = !m.claims.has(bot.id);
  if (claim) { m.claims.set(bot.id, claim); if (bot.claim !== claim) try { g.setClaim(bot, claim); } catch { /* claims off */ } }
  const parts: string[] = [];
  if (firstTime && claim) parts.push(g.t(pick(['I\'m the {character}.', 'Hi all, {character} here.', 'I\'ll say it openly: I\'m the {character}.'])!, { character: charName(claim) }));
  if (!believesEvil(bot)) {
    const shared = m.sharedNotes.get(bot.id) ?? 0;
    const fresh = bot.notes.slice(shared).filter(n => n.text);
    if (fresh.length) parts.push(g.t('My info: {info}', { info: fresh.map(n => n.text).join(' / ') }));
    m.sharedNotes.set(bot.id, bot.notes.length);
  } else if (g.day > 1 || !firstTime) {
    const t = topSuspect(g, bot, m);
    if (t) parts.push(g.t(pick(['Nothing clear for me last night. {name} has been quiet, though.', 'I don\'t trust {name}.', 'My information doesn\'t add up with what {name} says.'])!, { name: t.p.name }));
  }
  const t = topSuspect(g, bot, m);
  if (t && t.s >= 2 && !believesEvil(bot)) parts.push(g.t('I think {name} is lying.', { name: t.p.name }));
  if (parts.length) say(g, bot, parts.join(' '));
}

/** Called a few times a second: bots answer prompts and decide their votes (and, in normal games, play). */
export function botTick(g: Game, vote?: BotVote, now = Date.now()) {
  if (!g.players.some(p => p.bot)) return;
  const smart = !vote;
  const m = mem(g);
  if (g.phase === 'questions') {
    for (const p of g.players) if (p.bot && p.wantsQuestion === null) g.answerQuestion(p, false);
  }
  // group actions: bots answer at random
  for (const pr of g.prompts) {
    if (pr.result) continue;
    for (const id of pr.playerIds) {
      const p = g.maybePlayer(id);
      if (p?.bot && !pr.answers[id]) try { g.answerPrompt(id, pr.id, pr.options[Math.floor(Math.random() * pr.options.length)]); } catch { /* closed */ }
    }
  }
  if (smart) {
    // remember what humans claimed through the claim field
    for (const p of g.players) if (!p.bot && p.claim && CHARACTER_BY_ID[p.claim]) m.claims.set(p.id, p.claim);
    if (g.phase === 'night') night(g, m, now);
    if (g.phase === 'day') day(g, m, now);
  }
  const n = g.nomination;
  if (n && !n.done && ['accusation', 'defense', 'voting'].includes(g.stage ?? '')) {
    for (const p of g.players) {
      if (!p.bot || n.hands[p.id] !== undefined || !n.order.includes(p.id) || !g.canVote(p, n.exile)) continue;
      if (g.stage === 'voting' && n.order.indexOf(p.id) < n.voteIndex) continue;
      try { g.setHand(p, vote ? vote(g, p) : smartVote(g, p, m)); } catch { /* vote closed meanwhile */ }
    }
  }
}

function night(g: Game, m: Memory, now: number) {
  for (const p of g.players) {
    if (!p.bot) continue;
    if (!p.awake) { m.awakeSince.delete(p.id); continue; }
    if (!m.awakeSince.has(p.id)) m.awakeSince.set(p.id, now);
    if (p.nightChoice.length || now - m.awakeSince.get(p.id)! < 2500) continue;
    const ch = p.shownCharacterId ?? p.characterId;
    const type = CHARACTER_BY_ID[ch ?? '']?.type;
    const team = teamOf(g, p);
    const living = g.players.filter(x => x.alive && x.id !== p.id);
    // Demons and killers avoid their own team; everyone else picks among the living
    const targets = type === 'demon' || believesEvil(p) ? living.filter(x => !team.has(x.id)) : living;
    const n = ch === 'fortuneteller' || ch === 'seamstress' || ch === 'chambermaid' ? 2 : 1;
    const choice = [...(targets.length ? targets : living)].sort(() => Math.random() - 0.5).slice(0, n).map(x => x.id);
    try { g.nightChoose(p, choice); } catch { /* asleep again */ }
  }
}

function day(g: Game, m: Memory, now: number) {
  if (m.day !== g.day) {
    m.day = g.day; m.dayStart = now; m.nomsToday = 0; m.chatAt.clear();
    const bots = g.players.filter(p => p.bot && p.alive);
    bots.forEach((b, i) => m.chatAt.set(b.id, now + 4000 + i * 3500 + Math.random() * 3000));
  }
  if (g.stage !== m.stage) { m.stage = g.stage; m.stageStart = now; }
  for (const [id, at] of m.chatAt) {
    if (at > now) continue;
    m.chatAt.delete(id);
    const b = g.maybePlayer(id);
    if (b && b.alive && (g.stage === 'discussion' || g.stage === 'nominations' || g.stage === 'private')) talk(g, b, m);
  }
  // nominations: at most two from bots each day, spaced out so humans get the first go
  if (g.stage === 'nominations' && (!g.nomination || g.nomination.done) && !g.ability
    && now - m.stageStart > 15000 && now - m.lastNomAt > 25000 && m.nomsToday < 2) {
    const nominators = g.players.filter(p => p.bot && p.alive && !g.nominatorsToday.has(p.id));
    const options = nominators.map(b => ({ b, t: topSuspect(g, b, m) })).filter(x => x.t && (believesEvil(x.b) ? Math.random() < 0.3 : x.t.s >= 1.5));
    const o = options.sort((a, b) => b.t!.s - a.t!.s)[0];
    m.lastNomAt = now;
    if (o) {
      try {
        g.nominate(o.b.id, o.t!.p.id);
        m.nomsToday++;
        say(g, o.b, g.t(pick(['I nominate {name}.', '{name}, I don\'t believe you. I nominate you.'])!, { name: o.t!.p.name }));
      } catch { /* not allowed right now */ }
    }
  }
}

/** Vote by belief: good bots vote for players they suspect, evil bots protect their team. */
function smartVote(g: Game, bot: Player, m: Memory): boolean {
  const n = g.nomination!;
  if (n.exile) return Math.random() < 0.5;
  const nominee = g.player(n.nomineeId);
  if (nominee.id === bot.id) return false;
  const s = suspicion(g, bot, nominee, m);
  if (believesEvil(bot)) {
    if (teamOf(g, bot).has(nominee.id)) return false;
    return bot.alive ? jitter(bot.id, nominee.id, g.day, 'v') < 0.6 : false;
  }
  if (!bot.alive) return s >= 3; // a ghost vote is precious
  return s >= 1.5 || (s >= 1 && jitter(bot.id, nominee.id, g.day, 'v') < 0.5);
}
