// Per-viewer redaction. The full Game object never leaves the server; every
// client receives ONLY what its seat is allowed to know.
import { CHARACTER_BY_ID, FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER, NIGHT_PSEUDO } from '../../shared/characters';
import type {
  GameView, PublicPlayer, SelfView, StorytellerSelf, EvilTeamView, NominationView, AbilityEventView, LobbyEntry,
} from '../../shared/types';
import { MAX_PLAYERS, resolveWeather } from '../../shared/types';
import type { Game, Player, Spectator } from './game';

export function evilInfoGiven(g: Game) {
  // Tor: Minions and the Demon do not know each other; Poppy Grower: not while the Poppy Grower lives
  if (g.settings.fabled.includes('tor')) return false;
  const poppy = g.players.find(p => p.characterId === 'poppygrower');
  if (poppy && poppy.alive && !poppy.reminders.some(r => /poison|drunk/i.test(r))) return false;
  return g.residents.length >= 7 || g.settings.houseRules.evilInfoSmallGames;
}

/** What evil-team information this player believes they have. Real and fake (Lunatic) share one shape. */
export function evilTeamFor(g: Game, p: Player): EvilTeamView | null {
  if (!['questions', 'night', 'day', 'ended'].includes(g.phase)) return null;
  const type = (id: string | null) => CHARACTER_BY_ID[id ?? '']?.type;
  if (p.characterId === 'lunatic') {
    if (!evilInfoGiven(g)) return { members: [{ id: p.id, role: 'demon' }], bluffs: [] };
    return {
      members: [{ id: p.id, role: 'demon' }, ...p.fakeEvilTeam.map(id => ({ id, role: 'minion' as const }))],
      bluffs: [...g.lunaticBluffs],
    };
  }
  if (p.alignment !== 'evil') return null;
  // Travellers: an evil Traveller's alignment is told only to the Traveller and the Demon.
  if (p.traveller) return { members: [{ id: p.id, role: 'evil' }], bluffs: [] };
  const myRole = type(p.characterId) === 'demon' ? 'demon' : type(p.characterId) === 'minion' ? 'minion' : 'evil';
  if (!evilInfoGiven(g)) return { members: [{ id: p.id, role: myRole }], bluffs: [] };
  const members = g.players
    .filter(o => o.alignment === 'evil' && o.characterId !== 'lunatic' && (!o.traveller || myRole === 'demon'))
    .map(o => ({ id: o.id, role: (type(o.characterId) === 'demon' ? 'demon' : type(o.characterId) === 'minion' ? 'minion' : 'evil') as 'demon' | 'minion' | 'evil' }));
  return { members, bluffs: myRole === 'demon' ? [...g.demonBluffs] : [] };
}

function publicPlayers(g: Game, viewer: Player | null, evil: EvilTeamView | null): PublicPlayer[] {
  const evilIds = new Set(evil && evil.members.length > 1 ? evil.members.map(m => m.id) : []);
  const night = g.phase === 'night';
  return g.players.map(p => ({
    id: p.id, name: p.name, seat: p.seat, avatar: p.avatar, alive: p.alive, ghostVoteUsed: p.ghostVoteUsed,
    claim: p.claim,
    location: night ? null : p.location,
    joining: night ? false : p.joining,
    muted: p.muted, connected: p.connected, traveller: p.traveller, bot: !!p.bot, offlineSince: !p.connected && p.offlineNoticed ? p.offlineSince ?? null : null,
    travellerCharacter: p.traveller ? p.characterId : null,
    revealedCharacter: p.revealed ? p.characterId : null,
    revealedGrimoire: g.phase === 'ended' && g.settings.houseRules.grimoireRevealAtEnd
      ? { alignment: p.alignment, shownCharacterId: p.shownCharacterId, reminders: [...p.reminders] } : null,
    evilMark: !!viewer && evilIds.has(p.id),
    pos: night ? null : p.location === 'square' || !viewer || viewer.location === p.location ? p.pos : null, // inside a building: only its occupants
  }));
}

function nominationView(g: Game, viewerId: string | null, isST: boolean): NominationView | null {
  const n = g.nomination;
  if (!n) return null;
  const anon = g.settings.houseRules.anonymousVotes;
  // Organ Grinder: players only see their own hand, and never the tally
  const secret = !!n.secret && !isST;
  const own = (rec: Record<string, boolean>) => (viewerId && viewerId in rec ? { [viewerId]: rec[viewerId] } : {});
  return {
    nominatorId: n.nominatorId, nomineeId: n.nomineeId, exile: n.exile, order: n.order, voteIndex: n.voteIndex,
    hands: secret ? own(n.hands) : anon ? {} : { ...n.hands }, locked: secret ? own(n.locked) : anon ? {} : { ...n.locked },
    tally: secret || (anon && !n.done) ? 0 : g.tally(n), needed: n.needed, done: n.done, result: n.result, secret: !!n.secret,
  };
}
const secretToday = (g: Game) => g.voteHistory.some(v => v.day === g.day && v.votes === -1) || !!g.nomination?.secret;
export const torActive = (g: Game) => g.settings.fabled.includes('tor');

/** Public ability shape: NO real/bluff field, ever. */
function abilityView(g: Game): AbilityEventView | null {
  const a = g.ability;
  if (!a) return null;
  return { id: a.id, playerId: a.playerId, characterId: a.characterId, stage: a.stage, needsTarget: a.needsTarget, targetId: a.targetId, prompt: a.prompt, result: a.result };
}

function characterList(g: Game) {
  if (!['questions', 'night', 'day', 'ended'].includes(g.phase)) return null;
  const pl = g.settings.publicList;
  if (!pl.visible && g.phase !== 'ended') return null;
  const all = g.settings.characters;
  const hidden = g.phase === 'ended' ? [] : all.filter(id => pl.hidden.includes(id));
  return {
    visible: true,
    characters: all.filter(id => !hidden.includes(id)),
    hiddenCount: pl.showHiddenCount ? hidden.length : null,
    hiddenExists: hidden.length > 0,
    fabled: [...g.settings.fabled],
    bootleggerRules: g.settings.fabled.includes('bootlegger') ? g.settings.bootleggerRules : '',
    djinnRules: g.settings.fabled.includes('djinn') ? g.settings.djinnRules : '',
  };
}

function tableRules(g: Game): string[] {
  const h = g.settings.houseRules;
  const out = ['You may say anything, at any time, in public or in private.', 'No peeking: never show your character, and never look at the Grimoire.'];
  if (h.noOaths) out.push('No oaths: do not swear real-world oaths to prove a claim.');
  if (h.noScreenshots) out.push('No screenshots: never show screenshots or share your screen of your character card or night info.');
  if (h.holySpirit) out.push('Holy Spirit: a good player who kills a good Saint with an ability causes an execution, so good loses.');
  if (h.maxWhispersPerDay) out.push(`Each player may visit side rooms at most ${h.maxWhispersPerDay} times per day.`);
  if (h.privateRoomCapMinutes) out.push(`Each player may spend at most ${h.privateRoomCapMinutes} minutes in side rooms per day.`);
  if (h.abilityDeclarationLimit) out.push(`At most ${h.abilityDeclarationLimit} public ability declarations per day.`);
  if (g.transcriptActive()) out.push('Voice transcript: the Storyteller keeps a written transcript of what players who agreed say (only the Storyteller can read it). You can say no or withdraw in ⚙ Voice settings.');
  if (h.travellersCantBeChanged) out.push('Travellers can\'t be changed by character-changing abilities.');
  // timer lengths, so everyone knows how long each part of the day lasts
  const t = g.settings.timers;
  const len = (s: number | null) => s === null ? 'no time limit (the Storyteller ends it)' : s % 60 === 0 ? `${s / 60} min` : s > 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
  out.push(`Timers: town discussion ${len(t.discussion)} · private conversations ${len(t.privateRooms)} · nominations ${len(t.nominations)} · accusation ${len(t.accusation)} · defence ${len(t.defense)} · questions with the Storyteller ${len(t.question)} · ${t.voteSeconds} s per voter when votes are counted${h.speedRound ? ` · speed round ${t.speedRound} s per player` : ''}.`);
  return out;
}

function baseView(g: Game, viewer: Player | null, evil: EvilTeamView | null, asStoryteller = viewer === null): Omit<GameView, 'self'> {
  const night = g.phase === 'night';
  const isST = asStoryteller;
  return {
    id: g.id, code: g.code, name: g.name, visibility: g.visibility, phase: g.phase, stage: g.stage,
    day: g.day, night: g.night, paused: g.paused,
    storyteller: { name: g.storyteller.name, avatar: g.storyteller.avatar, location: night && !isST ? null : g.storyteller.location, connected: g.storyteller.connected, pos: night ? null : g.storyteller.pos },
    canWalk: g.canWalk(),
    players: publicPlayers(g, viewer, evil),
    rooms: g.rooms().map(r => night && !isST ? { ...r, occupants: [] } : r),
    timer: g.timer ? { label: g.timer.label, endsAt: g.timer.endsAt, remainingMs: g.timer.remainingMs, paused: g.paused } : null,
    nomination: nominationView(g, viewer?.id ?? null, isST),
    nominatedToday: [...g.nominatedToday],
    nominatorsToday: [...g.nominatorsToday],
    aboutToDie: !isST && secretToday(g) ? null : g.aboutToDie,
    ability: abilityView(g),
    questions: {
      active: g.phase === 'questions', currentId: g.studyGuest,
      done: g.questionsDone, total: g.players.filter(p => p.wantsQuestion).length,
      queue: [...g.questionQueue],
    },
    characterList: characterList(g),
    houseRules: g.settings.houseRules,
    timers: g.settings.timers,
    announcements: g.announcements.slice(-15),
    winner: g.winner,
    voice: { enabled: false, region: g.region },
    speakerId: g.speakerId,
    tableRules: tableRules(g),
    spectators: g.spectators.map(s => ({ id: s.id, name: s.name, connected: s.connected })),
    story: g.phase === 'ended' ? {
      log: g.log.slice(-400),
      votes: g.voteHistory,
      grimoire: g.players.map(p => ({ id: p.id, name: p.name, characterId: p.characterId, shownCharacterId: p.shownCharacterId, alignment: p.alignment, alive: p.alive, reminders: [...p.reminders], traveller: p.traveller })),
      demonBluffs: [...g.demonBluffs],
    } : null,
    whispers: isST ? g.whispers : viewer ? g.whispers.filter(w => w.playerId === viewer.id) : [],
    scheduledFor: g.scheduledFor ?? null,
    prompts: (g.prompts ?? []).filter(pr => isST || pr.public || (viewer && pr.playerIds.includes(viewer.id))).map(pr => ({
      ...pr, answers: isST || pr.public ? { ...pr.answers } : viewer && pr.answers[viewer.id] ? { [viewer.id]: pr.answers[viewer.id] } : {},
    })),
    ugHat: g.settings.fabled.includes('godofug') ? g.ugHat ?? null : null,
    torActive: torActive(g),
    mvp: g.phase === 'ended' ? { votes: g.mvpTally(), mine: g.mvpVotes[isST ? 'st' : viewer?.id ?? ''] ?? null } : null,
    weather: resolveWeather(g.settings.weather ?? 'clear', g.id, g.day),
    voteHistory: g.settings.houseRules.openVoteRecord
      ? g.voteHistory.map(v => ({ ...v, yes: g.settings.houseRules.anonymousVotes ? [] : v.yes })) : null,
  };
}

/** What a spectator sees: only public information, like a player with no character. */
export function spectatorView(g: Game, s: Spectator): GameView {
  const self: SelfView = {
    id: s.id, isStoryteller: false, spectator: true, characterId: null, alignment: null, evilTeam: null, notes: [],
    awake: false, questionAnswered: true, abilityAvailable: false, claimsUsed: {}, nominatedToday: false,
    privateMsUsedToday: 0, revealedTo: [],
  };
  const view = { ...baseView(g, null, null, false), self } as GameView;
  if (g.phase === 'night') view.announcements = view.announcements.filter(a => a.ts <= g.lastNightStart);
  return view;
}

export function playerView(g: Game, p: Player): GameView {
  const revealed = ['questions', 'night', 'day', 'ended'].includes(g.phase);
  const evil = evilTeamFor(g, p);
  const believedAlignment = p.shownAlignment ?? (p.characterId === 'lunatic' ? 'evil' : p.alignment);
  const self: SelfView = {
    id: p.id, isStoryteller: false,
    characterId: revealed || p.traveller ? p.shownCharacterId : null,
    alignment: revealed || p.traveller ? (p.traveller ? p.alignment : believedAlignment) : null,
    evilTeam: evil,
    notes: p.notes,
    awake: p.awake,
    questionAnswered: p.wantsQuestion !== null,
    abilityAvailable: g.abilityAvailable(p),
    claimsUsed: { ...p.claimUses },
    nominatedToday: g.nominatorsToday.has(p.id),
    privateMsUsedToday: p.privateMsToday,
    revealedTo: p.revealedTo,
    transcriptConsent: p.transcriptConsent ?? null,
    transcriptActive: g.transcriptActive(),
    tutorial: g.tutorial && g.tutorial.humanId === p.id ? { ...g.tutorial.tip, done: g.tutorial.done } : null,
  };
  // Tor: your character and alignment stay hidden until you die
  if (torActive(g) && p.alive && g.phase !== 'ended' && !p.traveller) { self.characterId = null; self.alignment = null; self.evilTeam = null; self.abilityAvailable = false; }
  const view = { ...baseView(g, p, self.evilTeam, false), self } as GameView;
  if (g.phase === 'night' && !p.awake) {
    // A sleeping player sees nothing that happens at night.
    view.announcements = view.announcements.filter(a => a.ts <= g.lastNightStart);
  }
  return view;
}

export function nightOrder(g: Game) {
  const order = g.night <= 1 ? FIRST_NIGHT_ORDER : OTHER_NIGHT_ORDER;
  const holders = (id: string) => g.players.filter(p => p.characterId === id || p.shownCharacterId === id).map(p => p.id);
  const evilInfo = evilInfoGiven(g);
  return order.flatMap(id => {
    if (NIGHT_PSEUDO[id]) {
      if ((id === 'minioninfo' || id === 'demoninfo') && (!evilInfo || g.night > 1)) return [];
      return [{ id, name: NIGHT_PSEUDO[id].name, text: NIGHT_PSEUDO[id].text, players: [] as string[] }];
    }
    const ps = holders(id);
    if (!ps.length) return [];
    const ch = CHARACTER_BY_ID[id];
    return [{ id, name: ch.name, text: ch.ability, players: ps }];
  });
}

export function storytellerView(g: Game): GameView {
  const self: StorytellerSelf = {
    id: 'st', isStoryteller: true, settings: g.settings,
    grimoire: g.players.map(p => ({
      id: p.id, characterId: p.characterId, shownCharacterId: p.shownCharacterId, alignment: p.alignment,
      shownAlignment: p.shownAlignment, reminders: p.reminders, fakeEvilTeam: p.fakeEvilTeam, notes: p.notes,
      nightChoice: p.nightChoice, awake: p.awake, wantsQuestion: p.wantsQuestion, abilityUses: p.abilityUses,
    })),
    demonBluffs: g.demonBluffs, lunaticBluffs: g.lunaticBluffs, pendingDawnDeaths: g.pendingDawnDeaths,
    pendingAbility: g.pendingAbility, privateRequests: g.privateRequests, notes: g.stNotes, log: g.log.slice(-200),
    regionsRtt: Object.fromEntries(g.players.map(p => [p.id, p.rtt])),
    availableRegions: [], nightOrder: nightOrder(g), focusId: g.focusId, winHint: g.winHint(), lastExecutedId: g.lastExecutedId, secretWords: g.secretWords ?? { mezepheles: '', yaggababble: '' }, yaggababbleCount: g.yaggababbleCount ?? 0, winRules: g.specialWinRules(), wordHits: g.wordHits ?? [], transcriptActive: g.transcriptActive(),
  };
  return { ...baseView(g, null, null), self } as GameView;
}

export function lobbyEntry(g: Game): LobbyEntry {
  return {
    id: g.id, code: g.code, name: g.name, players: g.players.length, max: MAX_PLAYERS,
    edition: g.settings.edition === 'custom' ? 'Custom script' : ({ tb: 'Trouble Brewing', bmr: 'Bad Moon Rising', snv: 'Sects & Violets' } as const)[g.settings.edition],
    status: g.phase === 'lobby' ? 'waiting' : g.phase === 'ended' ? 'ended' : 'in progress',
    scheduledFor: g.scheduledFor ?? null,
  };
}
