import { customAlphabet, nanoid } from 'nanoid';
import {
  CHARACTER_BY_ID, CHARACTERS, DAY_ABILITIES, CLAIMABLE_ABILITIES, ROOM_NAMES, ROOM_ICONS,
  defaultAlignment, parseScript, type Alignment, type Character,
} from '../../shared/characters';
import {
  MIN_PLAYERS, MAX_PLAYERS, JOIN_DELAY_MS, defaultSettings, AVATAR_LIMITS,
  type Avatar, type Phase, type DayStage, type Settings, type InfoCard, type Announcement,
  type RoomView, type PendingAbility, type HouseRules, type Timers, type VoteRecord, NUMERIC_HOUSE_RULES,
} from '../../shared/types';

const makeCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

export class GameError extends Error {}
const fail = (msg: string): never => { throw new GameError(msg); };

export interface Player {
  id: string;
  token: string;
  name: string;
  seat: number;
  avatar: Avatar;
  connected: boolean;
  characterId: string | null;      // true character
  shownCharacterId: string | null; // what the player believes (Drunk, Lunatic, …)
  alignment: Alignment;            // true alignment
  shownAlignment: Alignment | null;// override for what the player believes
  alive: boolean;
  ghostVoteUsed: boolean;
  claim: string;
  location: string | null;
  joining: boolean;
  joinReadyAt: number;
  muted: boolean;
  reminders: string[];
  notes: InfoCard[];
  nightChoice: string[];
  awake: boolean;
  wantsQuestion: boolean | null;
  abilityUses: Record<string, number>; // characterId → day used
  claimUses: Record<string, number>;
  traveller: boolean;
  fakeEvilTeam: string[];          // Lunatic only: ids shown as "evil"
  privateMsToday: number;
  revealed: boolean;               // character publicly revealed (end / reveal-on-death)
  revealedTo: { fromId: string; characterId: string }[];
  rtt: Record<string, number>;
  whispersToday: number;            // side-room entries today (house rule)
  butlerMaster: string | null;      // Butler's latest night choice
}

export interface Nomination {
  nominatorId: string; nomineeId: string; exile: boolean;
  order: string[]; voteIndex: number; hands: Record<string, boolean>; locked: Record<string, boolean>;
  needed: number; done: boolean; result: string | null; deadline: number;
}

export interface AbilityEvent {
  id: string; playerId: string; characterId: string; real: boolean;
  stage: 'gathering' | 'acting' | 'pending' | 'resolved';
  needsTarget: boolean; targetId: string | null; prompt: string; result: string | null;
  stageEndsAt: number; prevStage: DayStage | null; prevTimerRemaining: number | null;
}

interface Timer { label: string; endsAt: number | null; remainingMs: number | null; onExpire: (() => void) | null }

export interface Storyteller { id: 'st'; token: string; name: string; avatar: Avatar; connected: boolean; location: string | null }

export type Emit = (audience: string[] | 'all', event: string, payload: unknown) => void;

export const SQUARE = 'square';
export const STUDY = 'study';
export const nightRoom = (pid: string) => `night:${pid}`;

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const clampInt = (v: unknown, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 && n < max ? n : 0;
};
export const sanitizeAvatar = (a: Partial<Avatar> | undefined): Avatar => {
  const out = {} as Avatar;
  for (const k of Object.keys(AVATAR_LIMITS) as (keyof Avatar)[]) out[k] = clampInt(a?.[k], AVATAR_LIMITS[k]);
  return out;
};
export const cleanText = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export class Game {
  readonly id = nanoid(10);
  readonly code = makeCode();
  readonly createdAt = Date.now();
  lastActivity = Date.now();
  name: string;
  visibility: 'public' | 'private';
  storyteller: Storyteller;
  players: Player[] = [];
  banned = new Set<string>();
  settings: Settings = defaultSettings();
  phase: Phase = 'lobby';
  stage: DayStage | null = null;
  day = 0;
  night = 0;
  paused = false;
  pausedAt = 0;
  timer: Timer | null = null;
  nomination: Nomination | null = null;
  nominatedToday = new Set<string>();
  nominatorsToday = new Set<string>();
  voteHistory: VoteRecord[] = [];
  abilityDeclarationsToday = 0;
  speedQueue: string[] = [];
  aboutToDie: { playerId: string; votes: number } | null = null;
  highestVotes = 0;
  executedToday = false;
  speakerId: string | null = null;
  ability: AbilityEvent | null = null;
  pendingAbility: PendingAbility | null = null;
  privateRequests: { playerId: string; characterId: string; eventId: string }[] = [];
  questionQueue: string[] = [];
  questionsDone = 0;
  studyGuest: string | null = null;
  demonBluffs: string[] = [];
  lunaticBluffs: string[] = [];
  pendingDawnDeaths: string[] = [];
  announcements: Announcement[] = [];
  winner: Alignment | null = null;
  stNotes = '';
  log: string[] = [];
  focusId: string | null = null;
  region: string | null = null;
  lastNightStart = 0;
  pausedBySTDisconnect = false;

  /** Set by the server wiring. */
  onChange: () => void = () => {};
  emit: Emit = () => {};

  constructor(opts: { name: string; visibility: 'public' | 'private'; stName: string; stAvatar?: Partial<Avatar> }) {
    this.name = cleanText(opts.name, 40) || 'Untitled Game';
    this.visibility = opts.visibility === 'private' ? 'private' : 'public';
    this.storyteller = { id: 'st', token: nanoid(24), name: cleanText(opts.stName, 24) || 'Storyteller', avatar: sanitizeAvatar(opts.stAvatar), connected: false, location: SQUARE };
  }

  // ------------------------------------------------------------ helpers
  changed() { this.lastActivity = Date.now(); this.onChange(); }
  player(id: string): Player { return this.players.find(p => p.id === id) ?? fail('No such player'); }
  maybePlayer(id: string | null | undefined) { return this.players.find(p => p.id === id); }
  nameOf(id: string) { return id === 'st' ? this.storyteller.name : this.maybePlayer(id)?.name ?? '?'; }
  get residents() { return this.players.filter(p => !p.traveller); }
  get alivePlayers() { return this.players.filter(p => p.alive); }
  get started() { return this.phase !== 'lobby'; }
  when() { return this.phase === 'night' ? `Night ${this.night}` : this.phase === 'day' ? `Day ${this.day}` : 'Setup'; }
  addLog(s: string) { this.log.push(`[${this.when()}] ${s}`); if (this.log.length > 500) this.log.shift(); }
  announce(text: string, kind: Announcement['kind'] = 'info') {
    const a = { id: nanoid(8), text, ts: Date.now(), kind };
    this.announcements.push(a);
    if (this.announcements.length > 30) this.announcements.shift();
    this.emit('all', 'announcement', a);
  }
  private requireST(phase?: Phase[]) { if (phase && !phase.includes(this.phase)) fail(`Not allowed during ${this.phase}`); }

  // ------------------------------------------------------------ rooms
  get roomCount() { return Math.max(3, Math.ceil(this.players.length / 2)); }
  get roomCapacity() { return this.settings.houseRules.roomCapOverride ?? Math.max(1, Math.floor(this.players.length / 2)); }
  privateRoomIds() { return Array.from({ length: this.roomCount }, (_, i) => `r${i}`); }

  rooms(): RoomView[] {
    const occ = (id: string) => [
      ...this.players.filter(p => p.location === id).map(p => p.id),
      ...(this.storyteller.location === id ? ['st'] : []),
    ];
    return [
      { id: SQUARE, name: 'Town Square', icon: '🕯️', kind: 'square' as const, capacity: null, occupants: occ(SQUARE) },
      ...this.privateRoomIds().map((id, i) => ({
        id, name: ROOM_NAMES[i % ROOM_NAMES.length], icon: ROOM_ICONS[i % ROOM_ICONS.length],
        kind: 'private' as const, capacity: this.roomCapacity, occupants: occ(id),
      })),
      { id: STUDY, name: "Storyteller's Study", icon: '📜', kind: 'study' as const, capacity: null, occupants: occ(STUDY) },
    ];
  }
  isPrivateRoom(id: string | null) { return !!id && /^r\d+$/.test(id); }

  /** Returns an error message, or null if the player may enter. */
  canEnter(p: Player, roomId: string): string | null {
    if (this.phase === 'night') return 'Everyone is asleep.';
    if (this.phase === 'ended') return null;
    if (p.location === roomId) return 'You are already here.';
    if (roomId === STUDY) return 'Only the Storyteller can invite you to the Study.';
    if (p.location === STUDY) return 'You are with the Storyteller.';
    if (this.ability && this.ability.stage !== 'resolved') return 'An ability is being used in the Town Square.';
    if (roomId === SQUARE) return null;
    if (!this.privateRoomIds().includes(roomId)) return 'No such room.';
    if (this.phase === 'day') {
      if (this.stage === 'discussion') return 'Side rooms are closed during the opening discussion.';
      if (this.stage === 'speedround') return 'Side rooms are closed during the speed round.';
      if (['accusation', 'defense', 'voting'].includes(this.stage ?? '')) return 'A nomination is in progress.';
      if ((this.stage === 'nominations' || this.stage === 'closed') && !this.settings.houseRules.privateRoomsDuringNominations) return 'Side rooms are closed during nominations.';
      const cap = this.settings.houseRules.privateRoomCapMinutes;
      if (cap && p.privateMsToday >= cap * 60000) return 'You have used all your private-room time today.';
    }
    if (!p.alive && !this.settings.houseRules.ghostsInPrivateRooms) return 'Ghosts may not enter side rooms (house rule).';
    const wl = this.settings.houseRules.maxWhispersPerDay;
    if (this.phase === 'day' && wl && p.whispersToday >= wl) return `You have used all ${wl} side-room visits for today.`;
    const count = this.players.filter(o => o.location === roomId).length; // includes joining players
    if (count >= this.roomCapacity) return `This room is full (max ${this.roomCapacity}).`;
    return null;
  }

  /** Move a player with the 3-second join delay and an alert to the room's current occupants. */
  movePlayer(p: Player, roomId: string | null, opts: { silentAlert?: boolean } = {}) {
    if (p.location === roomId) return;
    p.location = roomId;
    if (roomId === null) { p.joining = false; return; }
    p.joining = true;
    p.joinReadyAt = Date.now() + JOIN_DELAY_MS;
    if (!opts.silentAlert) {
      const audience = this.occupantsHearing(roomId).filter(id => id !== p.id);
      if (audience.length) this.emit(audience, 'alert', { text: `${p.name} is joining…`, kind: 'join' });
    }
  }
  /** Ids (players + 'st') settled in a room and able to hear. */
  occupantsHearing(roomId: string): string[] {
    const ids = this.players.filter(o => o.location === roomId && !o.joining).map(o => o.id);
    if (this.storyteller.location === roomId) ids.push('st');
    return ids;
  }
  forceAllTo(roomId: string, alertText: string) {
    const settled = new Set(this.occupantsHearing(roomId));
    for (const p of this.players) {
      if (p.location === roomId) continue;
      this.movePlayer(p, roomId, { silentAlert: true });
    }
    this.emit([...settled], 'alert', { text: alertText, kind: 'join' });
    this.moveST(roomId);
  }
  moveST(roomId: string | null) {
    if (this.storyteller.location === roomId) return;
    this.storyteller.location = roomId;
    if (roomId) {
      const audience = this.occupantsHearing(roomId).filter(id => id !== 'st');
      if (audience.length) this.emit(audience, 'alert', { text: `The Storyteller is joining…`, kind: 'join' });
    }
  }

  // ------------------------------------------------------------ voice / chat permissions (server-enforced)
  speechMuted(id: string) {
    return this.settings.houseRules.autoMuteDuringSpeeches && (this.stage === 'accusation' || this.stage === 'defense' || this.stage === 'speedround') && id !== this.speakerId;
  }
  voiceTarget(id: string): { room: string | null; publish: boolean; subscribe: boolean } {
    if (id === 'st') {
      return { room: this.storyteller.location, publish: true, subscribe: true };
    }
    const p = this.maybePlayer(id);
    if (!p) return { room: null, publish: false, subscribe: false };
    if (this.phase === 'night') {
      if (!p.awake) return { room: null, publish: false, subscribe: false };
      return { room: nightRoom(p.id), publish: !p.muted, subscribe: true };
    }
    if (!p.location) return { room: null, publish: false, subscribe: false };
    if (p.joining) return { room: p.location, publish: false, subscribe: false };
    return { room: p.location, publish: !p.muted && !this.speechMuted(p.id), subscribe: true };
  }
  sendChat(fromId: string, text: string) {
    const t = cleanText(text, 300);
    if (!t) return;
    const me = this.voiceTarget(fromId);
    if (!me.room || !me.publish) fail(fromId !== 'st' && this.maybePlayer(fromId)?.muted ? 'You are muted by the Storyteller.' : 'Nobody can hear you right now.');
    const audience = ['st', ...this.players.map(p => p.id)].filter(id => {
      const v = this.voiceTarget(id);
      return v.room === me.room && v.subscribe;
    });
    this.emit(audience, 'chat', { id: nanoid(8), fromId, name: this.nameOf(fromId), text: t, ts: Date.now(), room: me.room });
  }

  // ------------------------------------------------------------ lobby
  join(name: string, avatar: Partial<Avatar> | undefined): Player {
    if (this.phase === 'ended') fail('This game has ended.');
    if (this.players.length >= MAX_PLAYERS) fail(`The game is full (${MAX_PLAYERS} players).`);
    const traveller = this.started;
    if (traveller && !this.settings.houseRules.allowTravellers) fail('This game is in progress and is not accepting Travellers.');
    const p: Player = {
      id: nanoid(10), token: nanoid(24), name: cleanText(name, 24) || `Player ${this.players.length + 1}`,
      seat: this.players.length, avatar: sanitizeAvatar(avatar), connected: true,
      characterId: null, shownCharacterId: null, alignment: 'good', shownAlignment: null, alive: true, ghostVoteUsed: false,
      claim: '', location: null, joining: false, joinReadyAt: 0, muted: false, reminders: [], notes: [], nightChoice: [],
      awake: false, wantsQuestion: null, abilityUses: {}, claimUses: {}, traveller, fakeEvilTeam: [],
      privateMsToday: 0, revealed: false, revealedTo: [], rtt: {}, whispersToday: 0, butlerMaster: null,
    };
    this.players.push(p);
    if (this.phase !== 'night') this.movePlayer(p, SQUARE);
    this.addLog(`${p.name} joined${traveller ? ' as a Traveller' : ''}.`);
    if (traveller) this.announce(`${p.name} has arrived as a Traveller.`);
    this.changed();
    return p;
  }
  setProfile(p: Player, name: string | undefined, avatar: Partial<Avatar> | undefined) {
    if (name !== undefined) p.name = cleanText(name, 24) || p.name;
    if (avatar) p.avatar = sanitizeAvatar(avatar);
    this.changed();
  }
  reseat() { this.players.forEach((p, i) => (p.seat = i)); }
  kick(id: string) {
    const p = this.player(id);
    this.banned.add(p.token);
    this.players = this.players.filter(o => o.id !== id);
    this.reseat();
    this.emit([id], 'kicked', { reason: 'The Storyteller removed you from the game.' });
    this.addLog(`${p.name} was kicked.`);
    this.announce(`${p.name} has left the town.`);
    // Rooms may have shrunk.
    const ids = new Set([SQUARE, STUDY, ...this.privateRoomIds()]);
    for (const o of this.players) if (o.location && !ids.has(o.location)) this.movePlayer(o, SQUARE);
    this.changed();
  }
  moveSeat(id: string, toSeat: number) {
    const p = this.player(id);
    const i = this.players.indexOf(p);
    const j = Math.max(0, Math.min(this.players.length - 1, Math.floor(toSeat)));
    this.players.splice(i, 1);
    this.players.splice(j, 0, p);
    this.reseat();
    this.changed();
  }
  updateSettings(patch: Partial<Settings>) {
    const s = this.settings;
    const known = (ids: unknown, filter: (c: Character) => boolean) =>
      Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && !!CHARACTER_BY_ID[id] && filter(CHARACTER_BY_ID[id])) : undefined;
    if (patch.edition && ['tb', 'bmr', 'snv', 'custom'].includes(patch.edition)) s.edition = patch.edition;
    if (patch.characters && !this.started) {
      const list = known(patch.characters, ch => !['traveller', 'fabled'].includes(ch.type));
      if (list) s.characters = [...new Set(list)];
    }
    if (patch.fabled) s.fabled = known(patch.fabled, ch => ch.type === 'fabled') ?? s.fabled;
    if (patch.bootleggerRules !== undefined) s.bootleggerRules = cleanText(patch.bootleggerRules, 2000);
    if (patch.djinnRules !== undefined) s.djinnRules = cleanText(patch.djinnRules, 2000);
    if (Array.isArray(patch.script) && !this.started) {
      s.script = patch.script.filter((id): id is string => typeof id === 'string' && !!CHARACTER_BY_ID[id]);
      s.scriptName = typeof patch.scriptName === 'string' ? cleanText(patch.scriptName, 60) || null : null;
      if (s.script.length) s.edition = 'custom';
    }
    if (patch.publicList) {
      const pl = patch.publicList;
      if (typeof pl.visible === 'boolean') s.publicList.visible = pl.visible;
      if (typeof pl.showHiddenCount === 'boolean') s.publicList.showHiddenCount = pl.showHiddenCount;
      if (pl.hidden) s.publicList.hidden = known(pl.hidden, () => true) ?? s.publicList.hidden;
    }
    if (patch.timers) {
      for (const k of Object.keys(s.timers) as (keyof Timers)[]) {
        if (!(k in patch.timers)) continue;
        const v = (patch.timers as unknown as Record<string, unknown>)[k];
        if (k === 'voteSeconds') s.timers.voteSeconds = Math.max(1, Math.min(30, Number(v) || 3));
        else (s.timers as unknown as Record<string, number | null>)[k] = v === null ? null : Math.max(5, Math.min(3600, Number(v) || 60));
      }
    }
    if (patch.houseRules) {
      for (const k of Object.keys(s.houseRules) as (keyof HouseRules)[]) {
        if (!(k in patch.houseRules)) continue;
        const v = (patch.houseRules as unknown as Record<string, unknown>)[k];
        const num = NUMERIC_HOUSE_RULES[k];
        if (num) (s.houseRules as unknown as Record<string, number | null>)[k] = v === null ? null : Math.max(num.min, Math.min(num.max, Math.floor(Number(v)) || num.default));
        else (s.houseRules as unknown as Record<string, boolean>)[k] = !!v;
      }
    }
    if (s.houseRules.beginnerMode) for (const f of ['toymaker', 'angel', 'buddhist']) if (!s.fabled.includes(f)) s.fabled.push(f);
    if (patch.region !== undefined) s.region = typeof patch.region === 'string' ? patch.region : null;
    this.changed();
  }

  // ------------------------------------------------------------ dealing
  deal() {
    this.requireST(['lobby', 'dealt']);
    const residents = this.residents;
    if (residents.length < MIN_PLAYERS) fail(`Need at least ${MIN_PLAYERS} players (have ${residents.length}).`);
    if (residents.length > MAX_PLAYERS) fail(`At most ${MAX_PLAYERS} players.`);
    const bag = this.settings.characters;
    if (bag.length !== residents.length) fail(`Select exactly ${residents.length} characters (selected ${bag.length}).`);
    if (!bag.some(id => CHARACTER_BY_ID[id].type === 'demon')) fail('The bag needs a Demon.');
    const editions = new Set(bag.map(id => CHARACTER_BY_ID[id].edition));
    const pool = (type: Character['type']) => CHARACTERS.filter(ch => ch.type === type && editions.has(ch.edition) && !bag.includes(ch.id));
    const shuffled = shuffle(bag);
    residents.forEach((p, i) => {
      const ch = CHARACTER_BY_ID[shuffled[i]];
      p.characterId = ch.id;
      p.alignment = defaultAlignment(ch.type);
      p.shownAlignment = null;
      p.shownCharacterId = ch.id;
      p.reminders = []; p.notes = []; p.fakeEvilTeam = [];
    });
    const usedShown = new Set<string>();
    for (const p of residents) {
      if (p.characterId === 'drunk') {
        const opts = pool('townsfolk').filter(ch => !usedShown.has(ch.id));
        p.shownCharacterId = opts.length ? shuffle(opts)[0].id : 'washerwoman';
        usedShown.add(p.shownCharacterId);
        p.reminders.push('Drunk');
      }
      if (p.characterId === 'lunatic') {
        p.shownCharacterId = bag.find(id => CHARACTER_BY_ID[id].type === 'demon') ?? 'imp';
        p.shownAlignment = 'evil';
        const minions = bag.filter(id => CHARACTER_BY_ID[id].type === 'minion').length;
        p.fakeEvilTeam = shuffle(residents.filter(o => o.id !== p.id).map(o => o.id)).slice(0, minions);
      }
    }
    const goodPool = shuffle([...pool('townsfolk'), ...pool('outsider')].filter(ch => !usedShown.has(ch.id)));
    this.demonBluffs = goodPool.slice(0, 3).map(ch => ch.id);
    this.lunaticBluffs = shuffle(goodPool).slice(0, 3).map(ch => ch.id);
    this.phase = 'dealt';
    this.addLog('Characters dealt (not yet revealed to players).');
    this.changed();
  }
  reveal() {
    this.requireST(['dealt']);
    this.phase = 'questions';
    this.pickRegion();
    for (const p of this.players) { p.wantsQuestion = null; }
    this.questionQueue = [];
    this.questionsDone = 0;
    for (const l of this.players.filter(x => x.characterId === 'lunatic')) this.tellDemons(`The Lunatic is ${l.name}. They believe they are the Demon.`, [l.id], ['lunatic']);
    this.announce('Characters have been dealt. Check your character with the [Character] button (P).', 'phase');
    this.changed();
  }
  answerQuestion(p: Player, yes: boolean) {
    if (this.phase !== 'questions' || p.wantsQuestion !== null) return;
    p.wantsQuestion = !!yes;
    if (yes) {
      this.questionQueue.push(p.id);
      this.emit(['st'], 'alert', { text: `${p.name} would like to ask a question.`, kind: 'info' });
    }
    this.changed();
  }
  nextQuestion() {
    this.requireST(['questions']);
    if (this.studyGuest) { this.questionsDone++; this.endStudy(); }
    const next = this.questionQueue.shift();
    if (next) {
      this.startStudy(next);
      const t = this.settings.timers.question;
      this.setTimer('Private question', t, () => this.nextQuestion());
    } else {
      this.clearTimer();
    }
    this.changed();
  }
  startStudy(pid: string) {
    const p = this.player(pid);
    if (this.studyGuest && this.studyGuest !== pid) this.endStudy();
    this.studyGuest = pid;
    this.movePlayer(p, STUDY);
    this.moveST(STUDY);
  }
  endStudy() {
    const g = this.maybePlayer(this.studyGuest);
    this.studyGuest = null;
    if (g && g.location === STUDY) this.movePlayer(g, this.phase === 'night' ? null : SQUARE);
    if (this.storyteller.location === STUDY) this.moveST(this.phase === 'night' ? null : SQUARE);
  }

  pickRegion() {
    if (this.settings.region) { this.region = this.settings.region; return; }
    const regions = new Set(this.players.flatMap(p => Object.keys(p.rtt)));
    let best: string | null = null, bestWorst = Infinity;
    for (const r of regions) {
      const worst = Math.max(...this.players.map(p => p.rtt[r] ?? 9999));
      if (worst < bestWorst) { bestWorst = worst; best = r; }
    }
    this.region = best;
  }

  // ------------------------------------------------------------ timers
  setTimer(label: string, seconds: number | null, onExpire: (() => void) | null) {
    this.timer = { label, endsAt: seconds === null ? null : Date.now() + seconds * 1000, remainingMs: null, onExpire };
  }
  clearTimer() { this.timer = null; }
  addTime(seconds: number) {
    if (this.timer?.endsAt) this.timer.endsAt += seconds * 1000;
    else if (this.timer?.remainingMs !== null && this.timer?.remainingMs !== undefined) this.timer.remainingMs += seconds * 1000;
    this.changed();
  }
  expireTimer() {
    const t = this.timer;
    if (!t) return;
    this.timer = null;
    t.onExpire?.();
    this.changed();
  }

  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    const now = Date.now();
    if (paused) {
      this.paused = true; this.pausedAt = now;
      this.announce('The game is paused.', 'phase');
    } else {
      const delta = now - this.pausedAt;
      if (this.timer?.endsAt) this.timer.endsAt += delta;
      if (this.nomination) this.nomination.deadline += delta;
      if (this.ability) this.ability.stageEndsAt += delta;
      this.paused = false;
      this.announce('The game resumes.', 'phase');
    }
    this.changed();
  }

  /** Called ~4×/second by the server. */
  tick(now = Date.now()) {
    let dirty = false;
    for (const p of this.players) {
      if (p.joining && now >= p.joinReadyAt) { p.joining = false; dirty = true; }
    }
    if (this.paused) { if (dirty) this.changed(); return; }
    // private-room time accounting + cap
    if (this.phase === 'day') {
      const cap = this.settings.houseRules.privateRoomCapMinutes;
      for (const p of this.players) {
        if (this.isPrivateRoom(p.location)) {
          p.privateMsToday += 250;
          if (cap && p.privateMsToday >= cap * 60000) {
            this.movePlayer(p, SQUARE);
            this.emit([p.id], 'alert', { text: 'Your private-room time for today is used up.', kind: 'info' });
            dirty = true;
          }
        }
      }
    }
    if (this.timer?.endsAt && now >= this.timer.endsAt) {
      if (this.settings.houseRules.timersAutoAdvance || this.timer.label === 'Private question') this.expireTimer();
      else { this.timer.endsAt = now; this.timer.onExpire = null; }
      dirty = true;
    }
    if (this.nomination && !this.nomination.done && this.stage === 'voting' && now >= this.nomination.deadline) {
      this.lockCurrentVote(now); dirty = true;
    }
    if (this.ability && now >= this.ability.stageEndsAt) {
      if (this.ability.stage === 'gathering') { this.ability.stage = 'acting'; this.ability.stageEndsAt = Infinity; dirty = true; }
      else if (this.ability.stage === 'resolved') { this.finishAbility(); dirty = true; }
    }
    if (dirty) this.changed();
  }

  // ------------------------------------------------------------ night
  beginNight() {
    this.requireST(['questions', 'day', 'dealt']);
    if (this.phase === 'dealt') this.reveal();
    if (this.studyGuest) this.endStudy();
    this.phase = 'night';
    this.night++;
    this.stage = null;
    this.clearTimer();
    this.nomination = null;
    this.speakerId = null;
    this.ability = null; this.pendingAbility = null;
    this.focusId = null;
    for (const p of this.players) { p.awake = false; p.nightChoice = []; this.movePlayer(p, null); }
    this.moveST(null);
    this.addLog(`Night ${this.night} begins.`);
    this.announce(`Night ${this.night} falls over the town. Everyone sleeps.`, 'phase');
    this.lastNightStart = Date.now();
    this.emit('all', 'transition', { to: 'night' });
    this.changed();
  }
  toggleWake(pid: string) {
    this.requireST(['night']);
    const p = this.player(pid);
    p.awake = !p.awake;
    if (p.awake) {
      p.nightChoice = [];
      this.focusId = p.id;
      this.storyteller.location = nightRoom(p.id);
      this.emit([p.id], 'alert', { text: 'You have been woken by the Storyteller.', kind: 'wake' });
    } else if (this.focusId === p.id) {
      const other = this.players.find(o => o.awake);
      this.focusId = other?.id ?? null;
      this.storyteller.location = other ? nightRoom(other.id) : null;
    }
    this.changed();
  }
  setFocus(pid: string) {
    const p = this.player(pid);
    if (this.phase !== 'night' || !p.awake) fail('That player is not awake.');
    this.focusId = p.id;
    this.storyteller.location = nightRoom(p.id);
    this.changed();
  }
  nightChoose(p: Player, ids: string[]) {
    if (this.phase !== 'night' || !p.awake) fail('You are asleep.');
    p.nightChoice = ids.filter(id => this.maybePlayer(id)).slice(0, 5);
    this.emit(['st'], 'alert', { text: `${p.name} chose: ${p.nightChoice.map(id => this.nameOf(id)).join(', ') || 'nobody'}`, kind: 'info' });
    if (p.characterId === 'butler') p.butlerMaster = p.nightChoice[0] ?? null;
    if (p.characterId === 'lunatic') this.tellDemons(`Night ${this.night}: the Lunatic (${p.name}) chose ${p.nightChoice.map(id => this.nameOf(id)).join(', ') || 'nobody'}.`, p.nightChoice, []);
    this.changed();
  }
  sendInfoCard(pid: string, card: { text?: string; playerIds?: string[]; characterIds?: string[]; alignment?: Alignment }) {
    const p = this.player(pid);
    const info: InfoCard = {
      id: nanoid(8), when: this.when(), text: cleanText(card.text, 500),
      playerIds: (card.playerIds ?? []).filter(id => this.maybePlayer(id)).slice(0, 10),
      characterIds: (card.characterIds ?? []).filter(id => CHARACTER_BY_ID[id]).slice(0, 10),
      alignment: card.alignment === 'good' || card.alignment === 'evil' ? card.alignment : undefined,
    };
    if (!info.text && !info.playerIds.length && !info.characterIds.length && !info.alignment) fail('Empty info card.');
    p.notes.push(info);
    this.emit([p.id], 'infoCard', info);
    this.addLog(`Info to ${p.name}: ${info.text} ${info.playerIds.map(i => this.nameOf(i)).join('/')} ${info.characterIds.join('/')} ${info.alignment ?? ''}`);
    this.changed();
  }

  // ------------------------------------------------------------ day
  beginDay() {
    this.requireST(['night']);
    this.phase = 'day';
    this.day++;
    for (const p of this.players) { p.awake = false; }
    this.focusId = null;
    const deaths = this.pendingDawnDeaths.map(id => this.maybePlayer(id)).filter((p): p is Player => !!p);
    this.pendingDawnDeaths = [];
    this.nominatedToday.clear(); this.nominatorsToday.clear(); this.abilityDeclarationsToday = 0;
    this.aboutToDie = null; this.highestVotes = 0; this.executedToday = false; this.nomination = null;
    for (const p of this.players) { p.privateMsToday = 0; p.whispersToday = 0; }
    this.addLog(`Day ${this.day} begins.`);
    this.emit('all', 'transition', { to: 'day' });
    this.announce(`Dawn breaks. Day ${this.day} begins.`, 'phase');
    if (deaths.length === 0) this.announce('Nobody died in the night.', 'info');
    for (const p of deaths) this.applyDeath(p, `${p.name} died in the night.`);
    this.setStage('discussion');
  }
  setStage(stage: DayStage) {
    this.requireST(['day']);
    if (this.ability && this.ability.stage !== 'resolved') fail('Resolve the ability first.');
    if (this.stage === 'voting' && this.nomination && !this.nomination.done) fail('A vote is in progress.');
    this.stage = stage;
    this.speakerId = null;
    const t = this.settings.timers;
    switch (stage) {
      case 'discussion':
        this.forceAllTo(SQUARE, 'Everyone is gathering in the Town Square…');
        this.setTimer('Discussion', t.discussion, () => this.setStage('private'));
        break;
      case 'private':
        this.announce('The side rooms are open for private conversations.', 'phase');
        this.setTimer('Private conversations', t.privateRooms, () => this.setStage('nominations'));
        break;
      case 'nominations':
        if (!this.settings.houseRules.privateRoomsDuringNominations) this.forceAllTo(SQUARE, 'Everyone is gathering for nominations…');
        this.nomination = this.nomination?.done ? this.nomination : null;
        this.announce('Nominations are open.', 'phase');
        this.setTimer('Nominations', t.nominations, () => this.setStage('closed'));
        break;
      case 'speedround': {
        if (!this.settings.houseRules.speedRound) fail('The speed-round house rule is off.');
        this.forceAllTo(SQUARE, 'Everyone is gathering for the speed round…');
        this.speedQueue = this.players.filter(p => p.alive).map(p => p.id);
        this.announce('Speed round: each living player states their claim in seat order.', 'phase');
        this.nextSpeaker();
        return;
      }
      case 'closed':
        this.announce('Nominations are closed.', 'phase');
        this.clearTimer();
        break;
      default: fail('Use nominations to start speeches and votes.');
    }
    this.changed();
  }
  nextSpeaker() {
    if (this.stage !== 'speedround') return;
    const next = this.speedQueue.shift();
    if (!next) { this.speakerId = null; this.setStage('nominations'); return; }
    this.speakerId = next;
    this.setTimer(`${this.nameOf(next)} states their claim`, this.settings.timers.speedRound, () => this.nextSpeaker());
    this.changed();
  }
  nominate(nominatorId: string, nomineeId: string, exile = false) {
    if (this.phase !== 'day' || this.stage !== 'nominations') fail('Nominations are not open.');
    if (this.ability) fail('An ability is being used.');
    const nominator = this.player(nominatorId);
    const nominee = this.player(nomineeId);
    if (exile) {
      if (!nominee.traveller) fail('Only Travellers can be exiled.');
    } else {
      if (!nominator.alive) fail('Dead players cannot nominate.');
      if (this.nominatorsToday.has(nominator.id)) fail('You have already nominated today.');
      if (this.nominatedToday.has(nominee.id)) fail(`${nominee.name} has already been nominated today.`);
      this.nominatorsToday.add(nominator.id);
      this.nominatedToday.add(nominee.id);
    }
    const i = this.players.indexOf(nominee);
    const order = [...this.players.slice(i + 1), ...this.players.slice(0, i + 1)].map(p => p.id);
    this.nomination = {
      nominatorId: nominator.id, nomineeId: nominee.id, exile, order, voteIndex: 0, hands: {}, locked: {},
      needed: exile ? Math.ceil(this.players.length / 2) : Math.ceil(this.alivePlayers.length / 2), done: false, result: null, deadline: Infinity,
    };
    this.addLog(`${nominator.name} ${exile ? 'called for the exile of' : 'nominated'} ${nominee.name}.`);
    this.announce(`${nominator.name} ${exile ? 'calls for the exile of' : 'nominates'} ${nominee.name}!`, 'vote');
    this.emit('all', 'alert', { text: `${nominator.name} ${exile ? 'calls for the exile of' : 'nominates'} ${nominee.name}!`, kind: 'nomination' });
    if (!exile && this.checkVirgin(nominator, nominee)) { this.changed(); return; }
    this.stage = 'accusation';
    this.speakerId = nominator.id;
    this.setTimer(`${nominator.name} accuses`, this.settings.timers.accusation, () => this.startDefense());
    this.changed();
  }
  /** Virgin: on her first nomination, a Townsfolk nominator is executed immediately. Returns true if that happened. */
  checkVirgin(nominator: Player, nominee: Player): boolean {
    if (nominee.characterId !== 'virgin' || nominee.reminders.includes('No ability')) return false;
    nominee.reminders.push('No ability'); // the ability is spent on the first nomination either way
    const impaired = this.impairments(nominee);
    const nomType = CHARACTER_BY_ID[nominator.characterId ?? '']?.type;
    if (impaired.length) { this.addLog(`Virgin nominated by ${nominator.name}, but the Virgin is impaired (${impaired.join(', ')}).`); return false; }
    if (nominator.characterId === 'spy') {
      this.emit(['st'], 'alert', { text: `The Virgin was nominated by the Spy, who might register as a Townsfolk. Use "Execute now" on ${nominator.name} if so.`, kind: 'ability' });
      return false;
    }
    if (nomType !== 'townsfolk') { this.addLog(`Virgin nominated by ${nominator.name} (not a Townsfolk): nothing happens.`); return false; }
    this.nomination = null;
    this.addLog(`Virgin triggered: ${nominator.name} is executed.`);
    this.execute(nominator.id);
    this.stage = 'closed';
    this.clearTimer();
    this.announce('Nominations are closed.', 'phase');
    return true;
  }
  startDefense() {
    if (!this.nomination || this.stage !== 'accusation') fail('No accusation in progress.');
    this.stage = 'defense';
    this.speakerId = this.nomination!.nomineeId;
    this.setTimer(`${this.nameOf(this.speakerId)} defends`, this.settings.timers.defense, () => this.startVote());
    this.changed();
  }
  canVote(p: Player, exile: boolean) { return exile || p.alive || !p.ghostVoteUsed; }
  startVote() {
    const n = this.nomination;
    if (!n || n.done) fail('No nomination to vote on.');
    if (this.stage === 'voting') return;
    this.stage = 'voting';
    this.speakerId = null;
    this.clearTimer();
    n!.voteIndex = 0;
    n!.deadline = Date.now() + 1500 + this.settings.timers.voteSeconds * 1000;
    this.skipIneligible(n!);
    this.emit('all', 'alert', { text: `Voting on ${this.nameOf(n!.nomineeId)} begins!`, kind: 'vote' });
    this.changed();
  }
  private skipIneligible(n: Nomination) {
    while (n.voteIndex < n.order.length) {
      const p = this.maybePlayer(n.order[n.voteIndex]);
      if (p && this.canVote(p, n.exile)) return;
      if (p) n.locked[p.id] = false;
      n.voteIndex++;
    }
    this.finishVote(n);
  }
  setHand(p: Player, raised: boolean) {
    const n = this.nomination;
    if (!n || n.done || !['accusation', 'defense', 'voting'].includes(this.stage ?? '')) fail('There is no vote right now.');
    const idx = n!.order.indexOf(p.id);
    if (idx < 0) fail('You are not in this vote.');
    if (this.stage === 'voting' && idx < n!.voteIndex) fail('Your vote is already locked.');
    if (!this.canVote(p, n!.exile)) fail('You have no vote left.');
    n!.hands[p.id] = !!raised;
    this.changed();
  }
  lockCurrentVote(now = Date.now()) {
    const n = this.nomination!;
    const id = n.order[n.voteIndex];
    const p = this.maybePlayer(id);
    const yes = !!n.hands[id] && !!p && this.canVote(p, n.exile);
    n.locked[id] = yes;
    if (yes && p && !p.alive && !n.exile) p.ghostVoteUsed = true;
    n.voteIndex++;
    n.deadline = now + this.settings.timers.voteSeconds * 1000;
    this.skipIneligible(n);
  }
  tally(n: Nomination) { return Object.values(n.locked).filter(Boolean).length; }
  private finishVote(n: Nomination) {
    if (n.done) return;
    n.done = true;
    // Butler: may only vote if their master votes too (checked at tally time).
    for (const id of n.order) {
      const b = this.maybePlayer(id);
      if (!b || !n.locked[id] || n.exile || b.characterId !== 'butler' || !b.alive || this.impairments(b).length) continue;
      if (!b.butlerMaster || !n.locked[b.butlerMaster]) {
        n.locked[id] = false;
        this.addLog(`${b.name}'s vote did not count (Butler; master ${b.butlerMaster ? this.nameOf(b.butlerMaster) : 'none'} did not vote).`);
      }
    }
    const votes = this.tally(n);
    const nominee = this.player(n.nomineeId);
    let result: string;
    if (n.exile) {
      if (votes >= n.needed) {
        result = `${nominee.name} is exiled with ${votes} votes.`;
        this.applyDeath(nominee, `${nominee.name} has been exiled.`);
      } else result = `${nominee.name} is not exiled (${votes} of ${n.needed} needed).`;
    } else if (votes >= n.needed && votes > this.highestVotes) {
      this.highestVotes = votes;
      this.aboutToDie = { playerId: nominee.id, votes };
      result = `${nominee.name} is about to die with ${votes} votes.`;
    } else if (votes >= n.needed && votes === this.highestVotes) {
      this.aboutToDie = null;
      result = `Tied at ${votes} votes — nobody is about to die.`;
    } else {
      result = `${nominee.name} receives ${votes} votes (${Math.max(n.needed, this.highestVotes + (this.highestVotes ? 1 : 0))} needed). Not enough.`;
    }
    if (!this.settings.houseRules.anonymousVotes && votes > 0) {
      const names = n.order.filter(id => n.locked[id]).map(id => this.nameOf(id));
      result += ` Voted yes: ${names.join(', ')}.`;
    }
    n.result = result;
    this.addLog(result);
    this.voteHistory.push({ day: this.day, nominatorId: n.nominatorId, nomineeId: n.nomineeId, exile: n.exile, yes: n.order.filter(id => n.locked[id]), votes, needed: n.needed, result });
    this.announce(result, 'vote');
    this.stage = 'nominations';
    this.setTimer('Nominations', this.settings.timers.nominations, () => this.setStage('closed'));
  }
  endDay() {
    this.requireST(['day']);
    if (this.nomination && !this.nomination.done && this.stage === 'voting') fail('A vote is in progress.');
    if (this.aboutToDie && !this.executedToday) this.execute(this.aboutToDie.playerId);
    else if (!this.executedToday) this.announce('Nobody was executed today.', 'info');
    this.beginNight();
  }
  execute(pid: string) {
    this.requireST(['day']);
    const p = this.player(pid);
    if (this.executedToday) fail('There has already been an execution today.');
    this.executedToday = true;
    this.aboutToDie = null;
    this.addLog(`${p.name} was executed.`);
    this.emit('all', 'execution', { playerId: p.id });
    if (p.alive) this.applyDeath(p, `${p.name} has been executed.`);
    else this.announce(`${p.name} has been executed (they were already dead).`, 'death');
    this.changed();
  }
  applyDeath(p: Player, text: string) {
    p.alive = false;
    if (this.settings.houseRules.revealOnDeath) p.revealed = true;
    this.announce(text, 'death');
    this.emit('all', 'death', { playerId: p.id });
  }
  kill(pid: string, cause?: string) {
    const p = this.player(pid);
    const why = this.settings.houseRules.announceCauseOfDeath && cause ? ` (${cleanText(cause, 80)})` : '';
    if (this.phase === 'night') {
      if (!this.pendingDawnDeaths.includes(p.id)) this.pendingDawnDeaths.push(p.id);
      this.addLog(`${p.name} will be found dead at dawn.`);
    } else {
      if (!p.alive) fail('Already dead.');
      this.addLog(`${p.name} died${why}.`);
      this.applyDeath(p, `${p.name} has died${why}.`);
    }
    this.changed();
  }
  revive(pid: string) {
    const p = this.player(pid);
    this.pendingDawnDeaths = this.pendingDawnDeaths.filter(id => id !== p.id);
    if (!p.alive) {
      p.alive = true; p.ghostVoteUsed = false;
      p.abilityUses = {}; p.claimUses = {}; // resurrected players regain their ability, even a used one
      if (this.phase !== 'ended') p.revealed = false;
      this.announce(`${p.name} has returned to life!`, 'info');
    }
    this.changed();
  }

  // ------------------------------------------------------------ day abilities (real + bluff share one public path)
  private usedFor(uses: Record<string, number>, charId: string) {
    const a = DAY_ABILITIES[charId];
    const used = uses[charId];
    if (a.frequency === 'firstDay' && this.day !== 1) return true;
    if (used === undefined) return false;
    return a.frequency === 'daily' ? used === this.day : true;
  }
  private aliveOk(p: Player, charId: string) { return DAY_ABILITIES[charId].requiresDead ? !p.alive : p.alive; }
  abilityAvailable(p: Player) {
    const id = p.shownCharacterId;
    if (!id || !DAY_ABILITIES[id] || !this.aliveOk(p, id) || this.phase !== 'day') return false;
    return !this.usedFor(p.abilityUses, id);
  }
  useAbility(p: Player, mode: 'real' | 'claim', claimCharId?: string) {
    if (this.phase !== 'day') fail('Abilities like this can only be used during the day.');
    if (this.ability) fail('Another ability is being used.');
    if (['accusation', 'defense', 'voting'].includes(this.stage ?? '')) fail('Wait until the nomination is over.');
    let charId: string;
    if (mode === 'real') {
      charId = p.shownCharacterId ?? fail('No character.');
      if (!DAY_ABILITIES[charId]) fail('Your character has no day ability.');
      if (!this.aliveOk(p, charId)) fail(DAY_ABILITIES[charId].requiresDead ? 'This ability is used once you have died.' : 'Dead players have no ability.');
      if (this.usedFor(p.abilityUses, charId)) fail('You cannot use this ability now.');
      this.checkDeclarationLimit(DAY_ABILITIES[charId].public);
      p.abilityUses[charId] = this.day;
    } else {
      charId = claimCharId ?? fail('Choose a character to claim.');
      if (!CLAIMABLE_ABILITIES.includes(charId)) fail('That ability cannot be claimed publicly.');
      if (charId === p.shownCharacterId) fail('Use your real ability instead.');
      if (!this.aliveOk(p, charId)) fail(DAY_ABILITIES[charId].requiresDead ? 'This ability is used once you have died.' : 'Dead players have no ability.');
      if (this.usedFor(p.claimUses, charId)) fail('You cannot use this ability now.');
      this.checkDeclarationLimit(true);
      p.claimUses[charId] = this.day;
    }
    const def = DAY_ABILITIES[charId];
    const real = mode === 'real' && p.characterId === charId; // true holder & sober char (Drunk's shown char ≠ true)
    if (!def.public) {
      // private abilities (Artist, Savant): request a Study visit
      const eventId = nanoid(8);
      this.privateRequests.push({ playerId: p.id, characterId: charId, eventId });
      this.emit(['st'], 'alert', { text: `${p.name} wants to use the ${CHARACTER_BY_ID[charId].name} ability privately.`, kind: 'ability' });
      this.emit([p.id], 'alert', { text: 'The Storyteller will call you to the Study.', kind: 'info' });
      this.addLog(`${p.name} requested a private ${CHARACTER_BY_ID[charId].name} visit (${real ? 'real' : 'impaired: shown character'}).`);
      this.changed();
      return;
    }
    this.ability = {
      id: nanoid(8), playerId: p.id, characterId: charId, real: mode === 'real',
      stage: 'gathering', needsTarget: def.target, targetId: null, prompt: def.prompt, result: null,
      stageEndsAt: Date.now() + JOIN_DELAY_MS, prevStage: this.stage,
      prevTimerRemaining: this.timer?.endsAt ? Math.max(0, this.timer.endsAt - Date.now()) : null,
    };
    this.clearTimer();
    this.forceAllTo(SQUARE, 'Everyone is being pulled to the Town Square…');
    this.emit('all', 'alert', { text: `${p.name} is using an ability!`, kind: 'ability' });
    this.announce(`${p.name} is using an ability! (${CHARACTER_BY_ID[charId].name})`, 'ability');
    this.addLog(`${p.name} ${mode === 'real' ? 'uses' : 'BLUFFS'} the ${CHARACTER_BY_ID[charId].name} ability.`);
    this.changed();
  }
  private checkDeclarationLimit(isPublic: boolean) {
    const lim = this.settings.houseRules.abilityDeclarationLimit;
    if (!isPublic) return;
    if (lim && this.abilityDeclarationsToday >= lim) fail(`The Storyteller allows only ${lim} public ability declarations per day.`);
    this.abilityDeclarationsToday++;
  }
  abilityTarget(p: Player, targetId: string) {
    const a = this.ability;
    if (!a || a.playerId !== p.id || a.stage !== 'acting' || !a.needsTarget) fail('Not now.');
    this.player(targetId);
    a!.targetId = targetId;
    this.changed();
  }
  abilityDone(p: Player) {
    const a = this.ability;
    if (!a || a.playerId !== p.id || a.stage !== 'acting') fail('Not now.');
    if (a!.needsTarget && !a!.targetId) fail('Choose a player first.');
    a!.stage = 'pending';
    this.pendingAbility = this.analyseAbility(a!);
    if (a!.targetId) this.announce(`${p.name} chooses ${this.nameOf(a!.targetId)}.`, 'ability');
    this.emit(['st'], 'alert', { text: `Resolve ${p.name}'s ability.`, kind: 'ability' });
    this.changed();
  }
  impairments(p: Player): string[] {
    const out: string[] = [];
    if (p.characterId !== p.shownCharacterId) out.push(`Is actually the ${CHARACTER_BY_ID[p.characterId ?? '']?.name ?? '?'}`);
    for (const r of p.reminders) if (/poison|drunk/i.test(r)) out.push(r);
    if (!p.alive) out.push('Dead');
    return out;
  }
  analyseAbility(a: AbilityEvent): PendingAbility {
    const p = this.player(a.playerId);
    const impaired = a.real ? this.impairments(p).filter(x => !(x === 'Dead' && DAY_ABILITIES[a.characterId].requiresDead)) : [];
    const base = { eventId: a.id, playerId: p.id, characterId: a.characterId, real: a.real, impaired, isPrivate: false, resolution: DAY_ABILITIES[a.characterId].resolution };
    if (!a.real) return { ...base, suggestion: 'nothing', suggestionText: 'BLUFF — this player does not have this ability. Normally: nothing happens.' };
    const tgt = this.maybePlayer(a.targetId);
    if ((a.characterId === 'klutz' || a.characterId === 'moonchild') && tgt) {
      if (impaired.length) return { ...base, suggestion: 'nothing', suggestionText: `Impaired (${impaired.join(', ')}) — no effect.` };
      if (a.characterId === 'klutz') return { ...base, suggestion: 'decide', suggestionText: tgt.alignment === 'evil' ? `${tgt.name} is EVIL — good loses (end the game with "Evil wins").` : `${tgt.name} is good — nothing happens.` };
      return { ...base, suggestion: 'decide', suggestionText: tgt.alignment === 'good' ? `${tgt.name} is good — they die tonight (kill them during the night).` : `${tgt.name} is evil — nothing happens.` };
    }
    if (a.characterId !== 'slayer') return { ...base, suggestion: 'nothing', suggestionText: impaired.length ? 'Real use, but impaired — the ability has no effect.' : 'Real use. Note the statement/guesses; resolve at night.' };
    const t = this.maybePlayer(a.targetId);
    if (!t) return { ...base, suggestion: 'nothing', suggestionText: 'No target.' };
    if (impaired.length) return { ...base, suggestion: 'nothing', suggestionText: `Impaired (${impaired.join(', ')}) — nothing happens.` };
    const tType = CHARACTER_BY_ID[t.characterId ?? '']?.type;
    if (t.characterId === 'recluse') return { ...base, suggestion: 'decide', suggestionText: 'Target is the Recluse — it might register as the Demon. Your call.' };
    if (tType === 'demon') return { ...base, suggestion: 'kill', suggestionText: `${t.name} is the Demon (${CHARACTER_BY_ID[t.characterId!].name}) — they die.` };
    return { ...base, suggestion: 'nothing', suggestionText: `${t.name} is not the Demon — nothing happens.` };
  }
  resolveAbility(outcome: 'kill' | 'nothing') {
    const a = this.ability;
    if (!a || a.stage !== 'pending') fail('Nothing to resolve.');
    const t = this.maybePlayer(a!.targetId);
    if (outcome === 'kill' && t && t.alive && DAY_ABILITIES[a!.characterId].resolution === 'kill') {
      a!.result = `${t.name} dies!`;
      this.applyDeath(t, `${t.name} has died.`);
    } else {
      a!.result = DAY_ABILITIES[a!.characterId].resolution === 'kill' ? 'Nothing happens.' : 'The Storyteller has noted it.';
      this.announce(a!.result, 'ability');
    }
    a!.stage = 'resolved';
    a!.stageEndsAt = Date.now() + 4000;
    this.pendingAbility = null;
    this.addLog(`Ability resolved: ${a!.result}`);
    this.changed();
  }
  finishAbility() {
    const a = this.ability;
    this.ability = null;
    if (!a) return;
    this.stage = a.prevStage;
    const t = this.settings.timers;
    const secs = a.prevTimerRemaining !== null ? Math.ceil(a.prevTimerRemaining / 1000) : null;
    if (this.stage === 'discussion') this.setTimer('Discussion', secs ?? t.discussion, () => this.setStage('private'));
    else if (this.stage === 'private') this.setTimer('Private conversations', secs ?? t.privateRooms, () => this.setStage('nominations'));
    else if (this.stage === 'nominations') this.setTimer('Nominations', secs ?? t.nominations, () => this.setStage('closed'));
  }
  takePrivateRequest(eventId: string) {
    const r = this.privateRequests.find(x => x.eventId === eventId) ?? fail('No such request.');
    this.privateRequests = this.privateRequests.filter(x => x !== r);
    const p = this.player(r!.playerId);
    this.pendingAbility = {
      eventId: r!.eventId, playerId: p.id, characterId: r!.characterId, real: p.characterId === r!.characterId,
      impaired: this.impairments(p), suggestion: 'decide', isPrivate: true, resolution: 'note',
      suggestionText: this.impairments(p).length ? 'Impaired — you may give false or no information.' : 'Real, sober use.',
    };
    this.startStudy(p.id);
    this.changed();
  }
  closeStudy() {
    if (this.pendingAbility?.isPrivate) this.pendingAbility = null;
    this.endStudy();
    this.changed();
  }

  // ------------------------------------------------------------ misc player actions
  setClaim(p: Player, claim: string) {
    const c = cleanText(claim, 30);
    p.claim = CHARACTER_BY_ID[c] ? c : c; // either a character id or free text — rendered identically
    this.changed();
  }
  revealTo(p: Player, toId: string) {
    if (!this.settings.houseRules.allowCharacterReveal) fail('Character reveals are not allowed in this game.');
    const to = this.player(toId);
    if (!p.shownCharacterId) fail('You have no character yet.');
    to.revealedTo.push({ fromId: p.id, characterId: p.shownCharacterId! });
    this.emit([to.id], 'alert', { text: `${p.name} shows you their character card.`, kind: 'info' });
    this.addLog(`${p.name} showed their (believed) character to ${to.name}.`);
    this.changed();
  }
  toggleMute(pid: string) {
    const p = this.player(pid);
    p.muted = !p.muted;
    this.emit([p.id], 'alert', { text: p.muted ? 'You have been muted by the Storyteller.' : 'The Storyteller unmuted you.', kind: 'info' });
    this.changed();
  }

  // ------------------------------------------------------------ grimoire edits
  private guardTraveller(p: Player) {
    if (p.traveller && p.characterId && this.settings.houseRules.travellersCantBeChanged) fail('House rule: Travellers can\'t be changed.');
  }
  setCharacter(pid: string, charId: string | null) {
    const p = this.player(pid);
    this.guardTraveller(p);
    if (charId !== null && !CHARACTER_BY_ID[charId]) fail('Unknown character.');
    p.characterId = charId;
    if (charId) {
      p.alignment = p.traveller ? p.alignment : defaultAlignment(CHARACTER_BY_ID[charId].type);
      if (charId !== 'drunk' && charId !== 'lunatic') { p.shownCharacterId = charId; p.shownAlignment = null; }
    }
    this.addLog(`${p.name} is now ${charId ?? 'nobody'}.`);
    this.changed();
  }
  setShownCharacter(pid: string, charId: string | null) {
    const p = this.player(pid);
    this.guardTraveller(p);
    if (charId !== null && !CHARACTER_BY_ID[charId]) fail('Unknown character.');
    p.shownCharacterId = charId;
    this.changed();
  }
  setAlignment(pid: string, a: Alignment) {
    const p = this.player(pid);
    p.alignment = a === 'evil' ? 'evil' : 'good';
    if (p.characterId !== 'lunatic') p.shownAlignment = null;
    this.addLog(`${p.name}'s alignment is now ${p.alignment}.`);
    if (p.traveller && this.settings.houseRules.succorForEvil) this.tellDemons(`Traveller ${p.name} is ${p.alignment}.`, [p.id], []);
    this.changed();
  }
  setReminders(pid: string, reminders: string[]) {
    this.player(pid).reminders = (reminders ?? []).map(r => cleanText(r, 30)).filter(Boolean).slice(0, 12);
    this.changed();
  }
  setGhostVote(pid: string, used: boolean) { this.player(pid).ghostVoteUsed = !!used; this.changed(); }
  setFakeEvilTeam(pid: string, ids: string[]) {
    const p = this.player(pid);
    p.fakeEvilTeam = ids.filter(id => id !== pid && this.maybePlayer(id));
    this.changed();
  }
  setBluffs(kind: 'demon' | 'lunatic', ids: string[]) {
    const list = ids.filter(id => CHARACTER_BY_ID[id]).slice(0, 3);
    if (kind === 'demon') this.demonBluffs = list; else this.lunaticBluffs = list;
    this.changed();
  }
  /** Travellers choose their own character; the Storyteller then sets the alignment. */
  pickTraveller(p: Player, charId: string) {
    if (!p.traveller) fail('Only Travellers choose their character.');
    if (p.characterId) fail('You already have a Traveller character.');
    const ch = CHARACTER_BY_ID[charId];
    if (!ch || ch.type !== 'traveller') fail('Choose a Traveller.');
    if (this.players.some(o => o.characterId === charId)) fail('Another Traveller already has that character.');
    p.characterId = charId; p.shownCharacterId = charId; p.alignment = 'good';
    this.announce(`${p.name} is the ${ch.name} (Traveller).`, 'info');
    this.emit(['st'], 'alert', { text: `${p.name} chose the ${ch.name}. Set their alignment in the Grimoire.`, kind: 'info' });
    if (this.settings.houseRules.succorForEvil) this.tellDemons(`Traveller ${p.name} is good.`, [p.id], []);
    this.changed();
  }
  /** Silently add an info card to every Demon's notes (the Storyteller wakes them as usual). */
  tellDemons(text: string, playerIds: string[], characterIds: string[]) {
    for (const d of this.players.filter(x => CHARACTER_BY_ID[x.characterId ?? '']?.type === 'demon')) {
      d.notes.push({ id: nanoid(8), when: this.when(), text, playerIds, characterIds });
    }
  }
  /** A hint for the Storyteller; the game never ends on its own (Scarlet Woman, Zombuul, Mastermind…). */
  winHint(): string | null {
    if (!['night', 'day'].includes(this.phase)) return null;
    const demonsAlive = this.players.some(p => p.alive && CHARACTER_BY_ID[p.characterId ?? '']?.type === 'demon');
    const living = this.players.filter(p => p.alive && !p.traveller).length;
    if (!demonsAlive) return 'No Demon is alive: good wins, unless a new Demon is created (Scarlet Woman, Imp self-kill) or the Mastermind/Zombuul applies.';
    if (living <= 2) return `Only ${living} non-Traveller players are alive: evil wins.`;
    return null;
  }
  endGame(winner: Alignment) {
    this.winner = winner === 'evil' ? 'evil' : 'good';
    this.phase = 'ended';
    this.stage = null;
    this.clearTimer();
    this.nomination = null; this.ability = null;
    for (const p of this.players) { p.revealed = true; p.awake = false; if (!p.location) this.movePlayer(p, SQUARE); }
    if (!this.storyteller.location) this.moveST(SQUARE);
    this.announce(`The game is over. ${this.winner === 'good' ? 'Good' : 'Evil'} wins!`, 'phase');
    this.emit('all', 'transition', { to: 'ended' });
    this.changed();
  }
}
