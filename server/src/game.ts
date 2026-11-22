import { customAlphabet, nanoid } from 'nanoid';
import {
  CHARACTER_BY_ID, CHARACTERS, DAY_ABILITIES, CLAIMABLE_ABILITIES, ROOM_NAMES, ROOM_ICONS,
  defaultAlignment, parseScript, type Alignment, type Character,
} from '../../shared/characters';
import {
  MIN_PLAYERS, MAX_PLAYERS, JOIN_DELAY_MS, defaultSettings, AVATAR_LIMITS,
  type Avatar, type Phase, type DayStage, type Settings, type InfoCard, type Announcement,
  type RoomView, type PendingAbility, type WordEvent, type WordHit, VOICE_CHARACTERS, type HouseRules, type Timers, type VoteRecord, NUMERIC_HOUSE_RULES, EMOTES, WEATHERS,
} from '../../shared/types';

/** Rough English syllable count: vowel groups, minus a silent final e. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  let n = (w.match(/[aeiouy]+/g) ?? []).length;
  if (n > 1 && /[^l]e$/.test(w)) n--;
  return Math.max(1, n);
}

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
  pos: WalkPos | null;              // free-walk position in the 3D Town Square (null = at their seat)
  bot?: boolean;                    // a computer-controlled seat (practice games and testing)
  offlineSince?: number | null;     // when the connection dropped (null/undefined = connected)
  offlineNoticed?: number;          // 0 none, 1 everyone told, 2 Storyteller nudged
  transcriptConsent?: boolean | null; // voice transcript: agreed? (null = not asked yet)
}

export interface Nomination {
  nominatorId: string; nomineeId: string; exile: boolean;
  /** Organ Grinder: hands and the tally are hidden from players. */
  secret?: boolean;
  order: string[]; voteIndex: number; hands: Record<string, boolean>; locked: Record<string, boolean>;
  needed: number; done: boolean; result: string | null; deadline: number;
}

export interface AbilityEvent {
  id: string; playerId: string; characterId: string; real: boolean;
  stage: 'gathering' | 'acting' | 'pending' | 'resolved';
  needsTarget: boolean; targetId: string | null; prompt: string; result: string | null;
  stageEndsAt: number; prevStage: DayStage | null; prevTimerRemaining: number | null;
}

/** What happens when a timer runs out. A plain name (not a function) so games can be saved and restored. */
export type TimerKind = 'question' | 'discussion' | 'private' | 'nominations' | 'speaker' | 'accusation' | 'defense';
interface Timer { label: string; endsAt: number | null; remainingMs: number | null; kind: TimerKind | null }

export interface Storyteller { id: 'st'; token: string; name: string; avatar: Avatar; connected: boolean; location: string | null; pos: WalkPos | null }
/** Cosmetic position in the 3D Town Square. Never affects rules: rooms are still decided by `location`. */
export interface WalkPos { x: number; z: number; ry: number }
export const WALK_RADIUS = 22;
/** Walkable floor inside a building (the room scene uses the same numbers). */
export const ROOM_HALF_W = 5.2;
export const ROOM_Z: [number, number] = [-2.6, 4.6];
/** Watches without a seat; ids are prefixed 'spec:' so they never collide with players or the Storyteller. */
export interface Spectator { id: string; token: string; name: string; avatar: Avatar; connected: boolean }
export const MAX_SPECTATORS = 20;

/** A question put to a few players at once (secret unless public): Al-Hadikhia, rock-paper-scissors, Boomdandy pointing. */
export interface GroupPrompt {
  id: string; kind: 'livedie' | 'rps' | 'point'; title: string; playerIds: string[]; options: string[];
  answers: Record<string, string>; public: boolean; endsAt: number | null; result: string | null; applied: boolean;
}

/** One private message in a player's thread with the Storyteller. */
export interface Whisper { id: string; playerId: string; fromST: boolean; text: string; ts: number }
export const OFFLINE_NOTICE_MS = 8000;
export const OFFLINE_NUDGE_MS = 120_000;

/** Progress of a practice game. Plain data, so it is saved with the game. */
export interface TutorialState {
  humanId: string;
  step: string;
  stepAt: number;
  tip: { title: string; text: string; next: string | null };
  chatQueue: { at: number; from: string; text: string }[];
  attempts: number;
  done: boolean;
}

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
  spectators: Spectator[] = [];
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
  /** Who was executed on the most recent day (for the Undertaker). */
  lastExecutedId: string | null = null;
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
  /** When each person last gestured (simple flood protection; not game state). */
  lastEmoteAt: Record<string, number> = {};
  /** Practice game run by an automatic Storyteller (see tutorial.ts). */
  tutorial: TutorialState | null = null;
  /** Planned start time (ms) shared with the invite link; null = no schedule. */
  scheduledFor: number | null = null;
  /** Detections from word listening (who said what, when, where, with whom), for the Storyteller only. */
  wordLog: WordEvent[] = [];
  /** Detections that need the Storyteller to confirm (Mezepheles word, Ug-hat slip). */
  wordHits: WordHit[] = [];
  /** Set by the server wiring: save the game without broadcasting a new state. */
  markDirty: () => void = () => {};
  /** Group actions in progress (see GroupPrompt). */
  prompts: GroupPrompt[] = [];
  /** God of Ug (Loric): who wears the Ug hat; their vote counts twice. */
  ugHat: string | null = null;
  /** Banshee: players who already used their second nomination today. */
  extraNominations = new Set<string>();
  /** Secret words for the Mezepheles and the Yaggababble, and how often the phrase was said today. */
  secretWords: { mezepheles: string; yaggababble: string } = { mezepheles: '', yaggababble: '' };
  yaggababbleCount = 0;
  /** Good players executed so far (Leviathan) and a rule-based win reminder for the Storyteller. */
  executedGood = 0;
  winNote: string | null = null;
  /** End-of-game MVP votes: voter id → player id. */
  mvpVotes: Record<string, string> = {};
  /** Private messages between each player and the Storyteller. */
  whispers: Whisper[] = [];
  lastWhisperAt: Record<string, number> = {};

  /** Set by the server wiring. */
  onChange: () => void = () => {};
  emit: Emit = () => {};

  constructor(opts: { name: string; visibility: 'public' | 'private'; stName: string; stAvatar?: Partial<Avatar> }) {
    this.name = cleanText(opts.name, 40) || 'Untitled Game';
    this.visibility = opts.visibility === 'private' ? 'private' : 'public';
    this.storyteller = { id: 'st', token: nanoid(24), name: cleanText(opts.stName, 24) || 'Storyteller', avatar: sanitizeAvatar(opts.stAvatar), connected: false, location: SQUARE, pos: null };
  }

  // ------------------------------------------------------------ saving & restoring (see persist.ts)
  /** Plain data for saving. Functions (onChange, emit) are skipped; Sets are tagged so they can be rebuilt. */
  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = { savedAt: Date.now() };
    for (const [k, v] of Object.entries(this)) {
      if (typeof v === 'function') continue;
      out[k] = v instanceof Set ? { __set: [...v] } : v;
    }
    return out;
  }
  /** Rebuild a saved game. Everyone is offline after a restart, so a running game waits, paused, for the Storyteller. */
  static fromJSON(data: Record<string, any>): Game {
    const g = new Game({ name: data.name, visibility: data.visibility, stName: data.storyteller?.name ?? 'Storyteller' });
    for (const [k, v] of Object.entries(data)) {
      if (k === 'savedAt') continue;
      (g as unknown as Record<string, unknown>)[k] = v && typeof v === 'object' && '__set' in v ? new Set((v as { __set: unknown[] }).__set) : v;
    }
    g.storyteller.connected = !!g.tutorial; // a practice game's Storyteller is the server itself
    for (const p of g.players) p.connected = !!p.bot;
    for (const s of g.spectators ?? []) s.connected = false;
    g.spectators ??= [];
    delete (g as unknown as Record<string, unknown>).transcript; // older saves kept full sentences: drop them
    if (g.started && g.phase !== 'ended' && !g.paused && !g.tutorial) {
      g.paused = true;
      g.pausedAt = typeof data.savedAt === 'number' ? data.savedAt : Date.now(); // timers resume where they stopped
      g.pausedBySTDisconnect = true;
    }
    return g;
  }

  /**
   * Undo: put the game back to a snapshot taken `ageMs` ago. Connections, spectators and private
   * messages stay as they are now; running timers are shifted so they resume where they were.
   */
  restoreSnapshot(data: Record<string, any>, ageMs: number) {
    const ids = (list: { id: string }[]) => list.map(p => p.id).sort().join(',');
    if (ids(data.players ?? []) !== ids(this.players)) fail('Someone joined or left since then, so this can no longer be undone.');
    const keep = {
      connected: new Map(this.players.map(p => [p.id, { connected: p.connected, offlineSince: p.offlineSince, offlineNoticed: p.offlineNoticed, rtt: p.rtt, transcriptConsent: p.transcriptConsent }])),
      st: this.storyteller.connected, spectators: this.spectators, whispers: this.whispers, wordLog: this.wordLog, lastWhisperAt: this.lastWhisperAt, lastEmoteAt: this.lastEmoteAt,
    };
    for (const [k, v] of Object.entries(data)) {
      if (k === 'savedAt' || k === 'id' || k === 'code' || k === 'createdAt') continue;
      (this as unknown as Record<string, unknown>)[k] = v && typeof v === 'object' && '__set' in v ? new Set((v as { __set: unknown[] }).__set) : v;
    }
    for (const p of this.players) Object.assign(p, keep.connected.get(p.id));
    this.storyteller.connected = keep.st;
    Object.assign(this, { wordLog: keep.wordLog, spectators: keep.spectators, whispers: keep.whispers, lastWhisperAt: keep.lastWhisperAt, lastEmoteAt: keep.lastEmoteAt });
    if (!this.paused) {
      if (this.timer?.endsAt) this.timer.endsAt += ageMs;
      if (this.nomination && Number.isFinite(this.nomination.deadline)) this.nomination.deadline += ageMs;
      if (this.ability && Number.isFinite(this.ability.stageEndsAt)) this.ability.stageEndsAt += ageMs;
      for (const p of this.players) if (p.joining) p.joinReadyAt += ageMs;
    }
    this.addLog('The Storyteller undid an action.');
    this.changed();
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
  /** Minimum number of side rooms: half the players, rounded up, and never fewer than 3. */
  get roomCount() { return Math.max(3, Math.ceil(this.players.length / 2)); }
  get roomCapacity() { return this.settings.houseRules.roomCapOverride ?? Math.max(1, Math.floor(this.players.length / 2)); }
  /** Open side rooms. Room `rN` is always building N (Tavern, Chapel, …), whichever buildings are open. */
  privateRoomIds() {
    const chosen = [...new Set(this.settings.openBuildings)].filter(i => i >= 0 && i < ROOM_NAMES.length).sort((a, b) => a - b);
    // top up with the first unchosen buildings so there are always at least `roomCount` rooms
    for (let i = 0; chosen.length < this.roomCount && i < ROOM_NAMES.length; i++) if (!chosen.includes(i)) chosen.push(i);
    return chosen.sort((a, b) => a - b).map(i => `r${i}`);
  }
  /** After the open buildings change (or players leave), send anyone in a closed room back to the square. */
  evictFromClosedRooms() {
    const open = new Set([SQUARE, STUDY, ...this.privateRoomIds()]);
    for (const p of this.players) if (p.location && !p.location.startsWith('night:') && !open.has(p.location)) {
      this.movePlayer(p, SQUARE);
      this.emit([p.id], 'alert', { text: 'That building has been closed. You are back in the Town Square.', kind: 'info' });
    }
  }

  rooms(): RoomView[] {
    const occ = (id: string) => [
      ...this.players.filter(p => p.location === id).map(p => p.id),
      ...(this.storyteller.location === id ? ['st'] : []),
    ];
    return [
      { id: SQUARE, name: 'Town Square', icon: '🕯️', kind: 'square' as const, capacity: null, occupants: occ(SQUARE) },
      ...this.privateRoomIds().map(id => Number(id.slice(1))).map(i => ({
        id: `r${i}`, name: ROOM_NAMES[i], icon: ROOM_ICONS[i],
        kind: 'private' as const, capacity: this.roomCapacity, occupants: occ(`r${i}`),
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
    p.pos = null;
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
    this.clearPositions();
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

  // ------------------------------------------------------------ walking (cosmetic 3D positions)
  /** Free walking is allowed only when seats don't matter: before the game and during open day time. */
  canWalk(): boolean {
    if (this.paused || this.ability || this.phase === 'night' || this.phase === 'ended' || this.phase === 'dealt') return false;
    if (this.phase === 'day') {
      if (!['discussion', 'private', 'closed'].includes(this.stage ?? '')) return false;
      if (this.nomination && !this.nomination.done) return false;
    }
    return true;
  }
  walk(id: string, x: unknown, z: unknown, ry: unknown) {
    const who = id === 'st' ? this.storyteller : this.maybePlayer(id);
    if (!who || !who.location) return;
    const inside = who.location !== SQUARE;
    if (inside ? !(this.isPrivateRoom(who.location) || who.location === STUDY) || this.phase === 'night' : !this.canWalk()) return;
    let nx = Number(x), nz = Number(z);
    const nry = Number(ry);
    if (!Number.isFinite(nx) || !Number.isFinite(nz) || !Number.isFinite(nry)) return;
    if (inside) { nx = Math.max(-ROOM_HALF_W, Math.min(ROOM_HALF_W, nx)); nz = Math.max(ROOM_Z[0], Math.min(ROOM_Z[1], nz)); }
    else {
      const d = Math.hypot(nx, nz);
      if (d > WALK_RADIUS) { nx = (nx / d) * WALK_RADIUS; nz = (nz / d) * WALK_RADIUS; }
    }
    who.pos = { x: Math.round(nx * 100) / 100, z: Math.round(nz * 100) / 100, ry: Math.round(nry * 100) / 100 };
    // lightweight broadcast instead of a full state update; inside a building only its occupants are told
    const audience = inside
      ? [...this.players.filter(p => p.location === who.location).map(p => p.id), ...(this.storyteller.location === who.location ? ['st'] : [])]
      : 'all';
    this.emit(audience, 'pos', { id, ...who.pos, room: who.location });
  }
  /** Everyone back to their seat (e.g. nominations open, an ability, night). */
  clearPositions() {
    let any = !!this.storyteller.pos;
    this.storyteller.pos = null;
    for (const p of this.players) { if (p.pos) any = true; p.pos = null; }
    if (any) this.emit('all', 'pos-reset', {});
  }

  // ------------------------------------------------------------ voice / chat permissions (server-enforced)
  speechMuted(id: string) {
    return this.settings.houseRules.autoMuteDuringSpeeches && (this.stage === 'accusation' || this.stage === 'defense' || this.stage === 'speedround') && id !== this.speakerId;
  }
  voiceTarget(id: string): { room: string | null; publish: boolean; subscribe: boolean } {
    if (id.startsWith('spec:')) {
      // spectators listen to the Town Square by day; they never speak, and hear nothing at night
      if (!this.spectators.some(s => s.id === id) || this.phase === 'night') return { room: null, publish: false, subscribe: false };
      return { room: SQUARE, publish: false, subscribe: true };
    }
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
    if (fromId.startsWith('spec:')) fail('Spectators can only watch and listen.');
    const t = cleanText(text, 300);
    if (!t) return;
    const me = this.voiceTarget(fromId);
    if (!me.room || !me.publish) fail(fromId !== 'st' && this.maybePlayer(fromId)?.muted ? 'You are muted by the Storyteller.' : 'Nobody can hear you right now.');
    const audience = ['st', ...this.players.map(p => p.id), ...this.spectators.map(s => s.id)].filter(id => {
      const v = this.voiceTarget(id);
      return v.room === me.room && v.subscribe;
    });
    this.emit(audience, 'chat', { id: nanoid(8), fromId, name: this.nameOf(fromId), text: t, ts: Date.now(), room: me.room });
  }

  /**
   * A gesture (emoji bubble + figure animation). It is shown only to the people who can
   * see the gesturer right now: the same audience as their voice, so a side-room gesture
   * never reaches the square. Never at night: who is awake is secret.
   */
  emote(fromId: string, kind: unknown) {
    if (fromId.startsWith('spec:')) fail('Spectators can only watch and listen.');
    const def = EMOTES.find(e => e.id === kind);
    if (!def) fail('Unknown gesture.');
    if (this.phase === 'night') fail('Everyone is asleep. No gestures at night.');
    const loc = fromId === 'st' ? this.storyteller.location : this.maybePlayer(fromId)?.location;
    if (!loc) fail('Nobody can see you right now.');
    const now = Date.now();
    if (now - (this.lastEmoteAt[fromId] ?? 0) < 1000) return;
    this.lastEmoteAt[fromId] = now;
    const audience = ['st', ...this.players.map(p => p.id), ...this.spectators.map(s => s.id)].filter(id => {
      if (id === fromId) return true;
      const v = this.voiceTarget(id);
      return v.room === loc && v.subscribe;
    });
    this.emit(audience, 'emote', { id: fromId, kind: def!.id, ts: now });
  }

  setSchedule(when: unknown) {
    const t = Number(when);
    if (when === null || when === undefined || when === '' || !Number.isFinite(t) || t <= 0) { this.scheduledFor = null; this.changed(); return; }
    if (this.started) fail('The game has already started.');
    if (t < Date.now() - 3600_000) fail('That time has already passed.');
    if (t > Date.now() + 30 * 86400_000) fail('Schedule at most 30 days ahead.');
    this.scheduledFor = Math.round(t);
    this.changed();
  }
  /** After the game: everyone (players and the Storyteller) may name one MVP; votes can be changed. */
  voteMvp(voterId: string, candidateId: string) {
    if (this.phase !== 'ended') fail('MVP votes open when the game is over.');
    if (voterId.startsWith('spec:')) fail('Spectators cannot vote.');
    const c = this.player(candidateId);
    if (c.id === voterId) fail('You cannot vote for yourself.');
    this.mvpVotes[voterId] = c.id;
    this.changed();
  }
  mvpTally(): Record<string, number> {
    const t: Record<string, number> = {};
    for (const id of Object.values(this.mvpVotes)) if (this.maybePlayer(id)) t[id] = (t[id] ?? 0) + 1;
    return t;
  }

  // ------------------------------------------------------------ group actions
  startPrompt(kind: GroupPrompt['kind'], playerIds: string[], title?: string) {
    const ids = [...new Set(playerIds)].filter(id => this.maybePlayer(id));
    const need = kind === 'rps' ? 2 : kind === 'livedie' ? 3 : 1;
    if (ids.length < need || (kind === 'rps' && ids.length !== 2)) fail(kind === 'rps' ? 'Choose exactly two players.' : kind === 'livedie' ? 'Choose three players.' : 'Choose the players.');
    const options = kind === 'rps' ? ['Rock', 'Paper', 'Scissors'] : kind === 'livedie' ? ['Live', 'Die'] : ids.map(id => this.nameOf(id));
    const pr: GroupPrompt = {
      id: nanoid(8), kind, playerIds: ids, options, answers: {}, public: kind === 'point', applied: false, result: null,
      endsAt: kind === 'point' ? Date.now() + 10_000 : null,
      title: title ?? (kind === 'rps' ? 'Rock, paper, scissors!' : kind === 'livedie' ? 'Do you choose to live or die?' : 'Point at a player: in 10 seconds, whoever most of you point at dies.'),
    };
    this.prompts.push(pr);
    if (this.prompts.length > 20) this.prompts.shift();
    if (pr.public) this.announce(`${ids.map(id => this.nameOf(id)).join(', ')}: point at a player! In 10 seconds, the one most of them point at dies.`, 'death');
    this.emit(ids, 'alert', { text: pr.title, kind: 'vote' });
    this.changed();
    return pr;
  }
  answerPrompt(pid: string, promptId: string, answer: string) {
    const pr = this.prompts.find(x => x.id === promptId) ?? fail('That question is over.');
    if (pr.result) fail('That question is over.');
    if (!pr.playerIds.includes(pid)) fail('This question is not for you.');
    if (!pr.options.includes(answer)) fail('Choose one of the options.');
    if (pr.kind !== 'point' && pr.answers[pid]) fail('You already answered.');
    pr.answers[pid] = answer;
    if (pr.kind !== 'point' && pr.playerIds.every(id => pr.answers[id])) this.resolvePrompt(pr);
    this.changed();
  }
  private resolvePrompt(pr: GroupPrompt) {
    const name = (id: string) => this.nameOf(id);
    if (pr.kind === 'rps') {
      const [a, b] = pr.playerIds, x = pr.answers[a], y = pr.answers[b];
      const beats: Record<string, string> = { Rock: 'Scissors', Paper: 'Rock', Scissors: 'Paper' };
      pr.result = x === y ? `${name(a)} and ${name(b)} both chose ${x}: a draw, play again.` : `${name(a)} chose ${x}, ${name(b)} chose ${y}: ${name(beats[x] === y ? a : b)} wins.`;
      this.announce(pr.result, 'vote');
    } else if (pr.kind === 'livedie') {
      const live = pr.playerIds.filter(id => pr.answers[id] === 'Live');
      pr.result = live.length === pr.playerIds.length
        ? `All three chose to live, so all three die: ${pr.playerIds.map(name).join(', ')}.`
        : `${pr.playerIds.map(id => `${name(id)}: ${pr.answers[id]}`).join(', ')}. Those who chose to die, die.`;
    } else {
      const counts: Record<string, number> = {};
      for (const a of Object.values(pr.answers)) counts[a] = (counts[a] ?? 0) + 1;
      const top = Math.max(0, ...Object.values(counts));
      const leaders = Object.keys(counts).filter(k => counts[k] === top);
      if (top && leaders.length === 1) {
        const victim = this.players.find(p => p.name === leaders[0]);
        pr.result = `${leaders[0]} was pointed at most (${top}) and dies.`;
        if (victim?.alive) this.applyDeath(victim, `${victim.name} dies.`);
        pr.applied = true;
      } else pr.result = top ? `A tie (${leaders.join(', ')}): nobody dies.` : 'Nobody pointed: nobody dies.';
      this.announce(pr.result, 'death');
    }
    this.addLog(`Group action (${pr.kind}): ${pr.result}`);
  }
  /** Who dies from a resolved Al-Hadikhia choice (the Storyteller applies it). */
  applyPrompt(promptId: string) {
    const pr = this.prompts.find(x => x.id === promptId) ?? fail('Not found.');
    if (pr.kind !== 'livedie' || !pr.result || pr.applied) fail('Nothing to apply.');
    const live = pr.playerIds.filter(id => pr.answers[id] === 'Live');
    const dying = live.length === pr.playerIds.length ? pr.playerIds : pr.playerIds.filter(id => pr.answers[id] === 'Die');
    for (const id of dying) { const p = this.player(id); if (p.alive) this.kill(id); }
    pr.applied = true;
    this.changed();
  }
  dismissPrompt(promptId: string) { this.prompts = this.prompts.filter(x => x.id !== promptId); this.changed(); }
  promptTick(now: number): boolean {
    let dirty = false;
    for (const pr of this.prompts) if (pr.kind === 'point' && !pr.result && pr.endsAt && now >= pr.endsAt) { this.resolvePrompt(pr); dirty = true; }
    return dirty;
  }
  /** Boomdandy: everyone except the three chosen survivors dies, then the survivors point. */
  boomdandy(survivors: string[]) {
    const keep = [...new Set(survivors)].filter(id => this.maybePlayer(id)?.alive);
    if (keep.length !== 3) fail('Choose exactly three living players to survive.');
    for (const p of this.players) if (p.alive && !keep.includes(p.id) && !p.traveller) this.applyDeath(p, `${p.name} dies in the explosion.`);
    this.winNote = null;
    this.startPrompt('point', keep);
  }
  setSecretWord(kind: 'mezepheles' | 'yaggababble', word: unknown) { this.secretWords[kind] = cleanText(word, 60); this.changed(); }
  /** The Mezepheles' word was said by a good player: they turn evil tonight. */
  mezephelesSaid(pid: string) {
    const p = this.player(pid);
    if (!p.reminders.includes('Turns evil')) p.reminders.push('Turns evil');
    const m = this.holder('mezepheles');
    if (m && !m.reminders.includes('No ability')) m.reminders.push('No ability');
    this.addLog(`${p.name} said the Mezepheles' word${p.alignment === 'good' ? ' and turns evil tonight' : ' (not good: nothing happens)'}.`);
    this.changed();
  }
  yaggababbleSaid(delta: number) { this.yaggababbleCount = Math.max(0, this.yaggababbleCount + (delta < 0 ? -1 : 1)); this.changed(); }
  setUgHat(pid: string | null) {
    this.ugHat = pid && this.maybePlayer(pid) ? pid : null;
    if (this.ugHat) this.announce(`${this.nameOf(this.ugHat)} wears the Ug hat: one-syllable words only, and their vote counts twice.`, 'info');
    this.changed();
  }

  // ------------------------------------------------------------ word listening (Storyteller only, with consent)
  // Speech is turned into text in the speaker's browser and checked here for what a character needs
  // (a secret word, a claim, a long word). The sentence is then thrown away: only detections are kept.
  setTranscriptConsent(p: Player, allow: boolean) {
    p.transcriptConsent = !!allow;
    if (!allow) { // withdrawing also deletes what was kept about them
      this.wordLog = this.wordLog.filter(e => e.playerId !== p.id);
      this.wordHits = this.wordHits.filter(h => h.playerId !== p.id);
    }
    this.changed();
  }
  /**
   * Listening runs only when a character that depends on speech is in the game, judged from what
   * players can already see (the public list, the script, Fabled/Loric), so it never gives away a hidden character.
   */
  transcriptActive(): boolean {
    return this.transcriptRequired() && ['questions', 'night', 'day'].includes(this.phase);
  }
  /** A word character is (or will be, once revealed) visible: everyone must agree before the game starts. */
  transcriptRequired(): boolean {
    if (!this.settings.houseRules.voiceTranscript || this.phase === 'ended') return false;
    const pl = this.settings.publicList;
    const visible = pl.visible ? this.settings.characters.filter(id => !pl.hidden.includes(id)) : [];
    const seen = new Set([...visible, ...this.settings.script, ...this.settings.fabled]);
    return VOICE_CHARACTERS.some(id => seen.has(id));
  }
  /** Players (not bots or Travellers) who have not yet agreed to word listening. */
  awaitingConsent(): Player[] {
    if (!this.transcriptRequired()) return [];
    return this.players.filter(p => !p.bot && !p.traveller && p.transcriptConsent !== true);
  }
  private requireConsent() {
    const missing = this.awaitingConsent();
    if (missing.length) fail(`A character in this game needs word listening, so everyone must allow it first. Waiting for: ${missing.map(p => p.name).join(', ')}.`);
  }
  /** Check one spoken sentence; nothing of it is stored unless it triggers a character. */
  checkSpeech(pid: string, text: unknown) {
    if (!this.transcriptActive()) return;
    const p = this.maybePlayer(pid);
    if (!p || p.bot || p.transcriptConsent !== true) return;
    const v = this.voiceTarget(pid);
    if (!v.room || !v.publish) return; // only what others could actually hear
    const t = cleanText(text, 500);
    if (t) this.detectWords(p, t, v.room);
  }
  /** Who else was in the room to hear it. */
  private listeners(pid: string, room: string) {
    return [...this.players.filter(o => o.id !== pid && o.location === room && !o.joining).map(o => o.id), ...(this.storyteller.location === room ? ['st'] : [])];
  }
  private logWord(kind: WordEvent['kind'], p: Player, room: string, detail: string) {
    const e: WordEvent = { id: nanoid(8), kind, playerId: p.id, room, withIds: this.listeners(p.id, room), detail, ts: Date.now(), when: this.when() };
    this.wordLog.push(e);
    if (this.wordLog.length > 300) this.wordLog.shift();
    return e;
  }
  private detectWords(p: Player, text: string, room: string) {
    const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
    const said = norm(text);
    const count = (phrase: string) => { const ph = norm(phrase); return ph ? ` ${said} `.split(` ${ph} `).length - 1 : 0; };
    let changed = false;
    const mez = this.holder('mezepheles');
    if (mez && this.secretWords.mezepheles && p.id !== mez.id && !mez.reminders.includes('No ability') && count(this.secretWords.mezepheles)) {
      const e = this.logWord('mezepheles', p, room, `said “${this.secretWords.mezepheles}”`);
      this.wordHits.push({ id: e.id, kind: 'mezepheles', playerId: p.id, text: `said “${this.secretWords.mezepheles}”`, ts: e.ts });
      this.emit(['st'], 'alert', { text: `🗣 ${p.name} said the Mezepheles' word. Confirm it under Special rules.`, kind: 'ability' });
      changed = true;
    }
    const yag = this.holder('yaggababble');
    if (yag && yag.id === p.id && this.secretWords.yaggababble && this.phase === 'day') {
      const n = count(this.secretWords.yaggababble);
      if (n) {
        this.yaggababbleCount += n;
        this.logWord('yaggababble', p, room, `said the phrase ${n === 1 ? 'once' : `${n} times`} (${this.yaggababbleCount} today)`);
        this.emit(['st'], 'alert', { text: `🗣 The Yaggababble said the phrase (${this.yaggababbleCount} today).`, kind: 'ability' });
        changed = true;
      }
    }
    const nom = this.nomination;
    if (p.characterId === 'goblin' && nom && !nom.done && nom.nomineeId === p.id && count('goblin') && !p.reminders.includes('Claimed')) {
      p.reminders.push('Claimed');
      this.logWord('goblin', p, room, 'claimed to be the Goblin while nominated');
      this.emit(['st'], 'alert', { text: `🗣 ${p.name} claimed to be the Goblin while nominated (marked "Claimed").`, kind: 'ability' });
      changed = true;
    }
    if (this.ugHat === p.id && this.settings.fabled.includes('godofug')) {
      const long = [...new Set(said.split(' ').filter(w => syllables(w) > 1))];
      if (long.length) {
        const e = this.logWord('ug', p, room, `used: ${long.slice(0, 4).join(', ')}`);
        this.wordHits.push({ id: e.id, kind: 'ug', playerId: p.id, text: e.detail, ts: e.ts });
        this.emit(['st'], 'alert', { text: `🎩 ${p.name} (Ug hat) may have used a long word: ${long.slice(0, 3).join(', ')}.`, kind: 'ability' });
        changed = true;
      }
    }
    if (this.wordHits.length > 30) this.wordHits.splice(0, this.wordHits.length - 30);
    if (changed) this.changed();
  }
  dismissWordHit(id: string) { this.wordHits = this.wordHits.filter(h => h.id !== id); this.changed(); }

  /** A private note between one player and the Storyteller (either direction). */
  whisper(fromId: string, toId: string, text: unknown) {
    if (fromId.startsWith('spec:')) fail('Spectators can only watch.');
    const t = cleanText(text, 300);
    if (!t) return;
    const playerId = fromId === 'st' ? toId : fromId;
    if (fromId !== 'st' && toId !== 'st') fail('You can only whisper to the Storyteller.');
    const p = this.player(playerId);
    if (p.bot) fail('Bots cannot read whispers.');
    const now = Date.now();
    if (now - (this.lastWhisperAt[fromId] ?? 0) < 800) fail('Slow down.');
    this.lastWhisperAt[fromId] = now;
    const w: Whisper = { id: nanoid(8), playerId: p.id, fromST: fromId === 'st', text: t, ts: now };
    this.whispers.push(w);
    if (this.whispers.length > 400) this.whispers.shift();
    this.emit(['st', p.id], 'whisper', { ...w, name: p.name });
    this.changed();
  }

  /** Connection drops: tell everyone after a short grace period, and nudge the Storyteller if it lasts. */
  connectionTick(now: number): boolean {
    let dirty = false;
    for (const p of this.players) {
      if (p.bot || p.connected || !p.offlineSince) continue;
      const gone = now - p.offlineSince;
      if (!p.offlineNoticed && gone >= OFFLINE_NOTICE_MS) {
        p.offlineNoticed = 1; dirty = true;
        this.emit('all', 'alert', { text: `📶 ${p.name} lost connection. Their seat is kept.`, kind: 'info' });
      } else if (p.offlineNoticed === 1 && gone >= OFFLINE_NUDGE_MS && this.started && this.phase !== 'ended') {
        p.offlineNoticed = 2;
        this.emit(['st'], 'alert', { text: `📶 ${p.name} has been offline for 2 minutes. You can pause the game, or carry on and let them catch up.`, kind: 'info' });
      }
    }
    return dirty;
  }
  setConnected(p: Player, on: boolean) {
    if (on) {
      if (p.offlineNoticed) this.emit('all', 'alert', { text: `📶 ${p.name} is back.`, kind: 'info' });
      p.offlineSince = null; p.offlineNoticed = 0;
    } else if (p.connected || !p.offlineSince) {
      p.offlineSince = Date.now(); p.offlineNoticed = 0;
    }
    p.connected = on;
  }

  // ------------------------------------------------------------ lobby
  join(name: string, avatar: Partial<Avatar> | undefined, opts: { bot?: boolean } = {}): Player {
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
      privateMsToday: 0, revealed: false, revealedTo: [], rtt: {}, whispersToday: 0, butlerMaster: null, pos: null,
    };
    if (opts.bot) { p.bot = true; p.connected = true; }
    this.players.push(p);
    if (this.phase !== 'night') this.movePlayer(p, SQUARE, { silentAlert: !!opts.bot });
    if (opts.bot) p.joining = false;
    this.addLog(`${p.name} joined${traveller ? ' as a Traveller' : ''}.`);
    if (traveller) this.announce(`${p.name} has arrived as a Traveller.`);
    this.changed();
    return p;
  }
  addSpectator(name: string, avatar: Partial<Avatar> | undefined): Spectator {
    if (!this.settings.houseRules.allowSpectators) fail('The Storyteller is not allowing spectators in this game.');
    if (this.spectators.length >= MAX_SPECTATORS) fail('Too many spectators already.');
    const s: Spectator = { id: `spec:${nanoid(8)}`, token: nanoid(24), name: cleanText(name, 24) || 'Spectator', avatar: sanitizeAvatar(avatar), connected: true };
    this.spectators.push(s);
    this.addLog(`${s.name} is watching.`);
    this.changed();
    return s;
  }
  removeSpectator(id: string) {
    this.spectators = this.spectators.filter(s => s.id !== id);
    this.changed();
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
    this.evictFromClosedRooms();
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
      const list = known(patch.characters, ch => !['traveller', 'fabled', 'loric'].includes(ch.type));
      if (list) s.characters = [...new Set(list)];
    }
    if (patch.fabled) s.fabled = known(patch.fabled, ch => ch.type === 'fabled' || ch.type === 'loric') ?? s.fabled;
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
    if (patch.weather && WEATHERS.some(w => w.id === patch.weather)) s.weather = patch.weather;
    if (patch.region !== undefined) s.region = typeof patch.region === 'string' ? patch.region : null;
    if (Array.isArray(patch.openBuildings)) {
      s.openBuildings = [...new Set(patch.openBuildings.map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < ROOM_NAMES.length))];
      this.evictFromClosedRooms();
    }
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
    this.requireConsent();
    // a Demon is needed, except with the Summoner (who makes one on night 3) or the Atheist (no evil at all)
    if (!bag.some(id => CHARACTER_BY_ID[id].type === 'demon') && !bag.includes('summoner') && !bag.includes('atheist')) fail('The bag needs a Demon.');
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
    this.requireConsent();
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
      this.setTimer('Private question', t, 'question');
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
  setTimer(label: string, seconds: number | null, kind: TimerKind | null) {
    this.timer = { label, endsAt: seconds === null ? null : Date.now() + seconds * 1000, remainingMs: null, kind };
  }
  clearTimer() { this.timer = null; }
  /** Runs the next step when a timer of this kind runs out. */
  onTimer(kind: TimerKind) {
    switch (kind) {
      case 'question': return this.nextQuestion();
      case 'discussion': return this.setStage('private');
      case 'private': return this.setStage('nominations');
      case 'nominations': return this.setStage('closed');
      case 'speaker': return this.nextSpeaker();
      case 'accusation': return this.startDefense();
      case 'defense': return this.startVote();
    }
  }
  addTime(seconds: number) {
    if (this.timer?.endsAt) this.timer.endsAt += seconds * 1000;
    else if (this.timer?.remainingMs !== null && this.timer?.remainingMs !== undefined) this.timer.remainingMs += seconds * 1000;
    this.changed();
  }
  expireTimer() {
    const t = this.timer;
    if (!t) return;
    this.timer = null;
    if (t.kind) this.onTimer(t.kind);
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
    if (this.connectionTick(now)) dirty = true;
    if (this.promptTick(now)) dirty = true;
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
      else { this.timer.endsAt = now; this.timer.kind = null; }
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
    this.clearPositions();
    for (const p of this.players) { p.awake = false; p.nightChoice = []; this.movePlayer(p, null); }
    this.moveST(null);
    this.addLog(`Night ${this.night} begins.`);
    this.announce(`Night ${this.night} falls over the town. Everyone sleeps.`, 'phase');
    this.lastNightStart = Date.now();
    this.winNote = null;
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
  /** Wake or sleep a player explicitly (used by the night helper). */
  setAwake(pid: string, awake: boolean) {
    const p = this.player(pid);
    if (this.phase !== 'night') fail('Only at night.');
    if (p.awake !== !!awake) this.toggleWake(pid);
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
    this.nominatedToday.clear(); this.nominatorsToday.clear(); this.extraNominations.clear(); this.abilityDeclarationsToday = 0; this.yaggababbleCount = 0;
    this.aboutToDie = null; this.highestVotes = 0; this.executedToday = false; this.nomination = null; this.lastExecutedId = null;
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
        this.setTimer('Discussion', t.discussion, 'discussion');
        break;
      case 'private':
        this.announce('The side rooms are open for private conversations.', 'phase');
        this.setTimer('Private conversations', t.privateRooms, 'private');
        break;
      case 'nominations':
        this.clearPositions();
        if (!this.settings.houseRules.privateRoomsDuringNominations) this.forceAllTo(SQUARE, 'Everyone is gathering for nominations…');
        this.nomination = this.nomination?.done ? this.nomination : null;
        this.announce('Nominations are open.', 'phase');
        this.setTimer('Nominations', t.nominations, 'nominations');
        break;
      case 'speedround': {
        this.clearPositions();
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
    this.setTimer(`${this.nameOf(next)} states their claim`, this.settings.timers.speedRound, 'speaker');
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
      const banshee = this.bansheeActive(nominator);
      if (!nominator.alive && !banshee) fail('Dead players cannot nominate.');
      if (this.nominatorsToday.has(nominator.id)) {
        if (!banshee || this.extraNominations.has(nominator.id)) fail('You have already nominated today.');
        this.extraNominations.add(nominator.id);
      }
      if (this.nominatedToday.has(nominee.id)) fail(`${nominee.name} has already been nominated today.`);
      this.nominatorsToday.add(nominator.id);
      this.nominatedToday.add(nominee.id);
    }
    const i = this.players.indexOf(nominee);
    const order = [...this.players.slice(i + 1), ...this.players.slice(0, i + 1)].map(p => p.id);
    this.nomination = {
      nominatorId: nominator.id, nomineeId: nominee.id, exile, order, voteIndex: 0, hands: {}, locked: {},
      needed: exile ? Math.ceil(this.players.length / 2) : Math.ceil(this.alivePlayers.length / 2), done: false, result: null, deadline: Infinity,
      secret: !exile && this.secretVoting(),
    };
    this.addLog(`${nominator.name} ${exile ? 'called for the exile of' : 'nominated'} ${nominee.name}.`);
    this.announce(`${nominator.name} ${exile ? 'calls for the exile of' : 'nominates'} ${nominee.name}!`, 'vote');
    this.emit('all', 'alert', { text: `${nominator.name} ${exile ? 'calls for the exile of' : 'nominates'} ${nominee.name}!`, kind: 'nomination' });
    if (!exile && this.checkVirgin(nominator, nominee)) { this.changed(); return; }
    this.stage = 'accusation';
    this.speakerId = nominator.id;
    this.setTimer(`${nominator.name} accuses`, this.settings.timers.accusation, 'accusation');
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
    this.setTimer(`${this.nameOf(this.speakerId)} defends`, this.settings.timers.defense, 'defense');
    this.changed();
  }
  /** Not drunk or poisoned (by reminder token). */
  sober(p: Player) { return !p.reminders.some(r => /poison|drunk/i.test(r)); }
  holder(charId: string) { return this.players.find(p => p.characterId === charId); }
  /** A Banshee killed by the Demon (Storyteller marks "Has ability"): two votes, two nominations, even when dead. */
  bansheeActive(p: Player) { return p.characterId === 'banshee' && p.reminders.includes('Has ability') && this.sober(p); }
  voteWeight(p: Player) {
    let w = this.bansheeActive(p) ? 2 : 1;
    if (this.ugHat === p.id && this.settings.fabled.includes('godofug')) w *= 2;
    return w;
  }
  /** Zealot: while 5 or more players live, must vote on every nomination. */
  zealotMustVote(p: Player) { return p.characterId === 'zealot' && p.alive && this.sober(p) && this.alivePlayers.length >= 5; }
  /** Organ Grinder alive and not choosing to be drunk: votes are secret. */
  secretVoting() { const o = this.holder('organgrinder'); return !!o && o.alive && this.sober(o); }
  canVote(p: Player, exile: boolean) { return exile || p.alive || !p.ghostVoteUsed || this.bansheeActive(p); }
  startVote() {
    const n = this.nomination;
    if (!n || n.done) fail('No nomination to vote on.');
    if (this.stage === 'voting') return;
    this.stage = 'voting';
    this.clearPositions();
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
    const yes = !!p && this.canVote(p, n.exile) && (!!n.hands[id] || (!n.exile && this.zealotMustVote(p)));
    n.locked[id] = yes;
    if (yes && p && !p.alive && !n.exile && !this.bansheeActive(p)) p.ghostVoteUsed = true;
    n.voteIndex++;
    n.deadline = now + this.settings.timers.voteSeconds * 1000;
    this.skipIneligible(n);
  }
  tally(n: Nomination) { return Object.entries(n.locked).filter(([, y]) => y).reduce((s, [id]) => s + (this.maybePlayer(id) ? this.voteWeight(this.maybePlayer(id)!) : 1), 0); }
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
    if (n.secret) {
      // Organ Grinder: only the Storyteller learns the count; players hear that the votes were secret
      this.addLog(`(secret vote) ${result}`);
      this.voteHistory.push({ day: this.day, nominatorId: n.nominatorId, nomineeId: n.nomineeId, exile: n.exile, yes: [], votes: -1, needed: n.needed, result: 'Secret vote (Organ Grinder)' });
      n.result = `The votes on ${nominee.name} were cast in secret.`;
      this.announce(n.result, 'vote');
      this.stage = 'nominations';
      this.setTimer('Nominations', this.settings.timers.nominations, 'nominations');
      return;
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
    this.setTimer('Nominations', this.settings.timers.nominations, 'nominations');
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
    this.lastExecutedId = p.id;
    this.noteExecution(p);
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
    if (this.stage === 'discussion') this.setTimer('Discussion', secs ?? t.discussion, 'discussion');
    else if (this.stage === 'private') this.setTimer('Private conversations', secs ?? t.privateRooms, 'private');
    else if (this.stage === 'nominations') this.setTimer('Nominations', secs ?? t.nominations, 'nominations');
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
  /** Rule-based win reminders when someone is executed (the Storyteller still decides). */
  private noteExecution(p: Player) {
    const n = this.nomination;
    if (p.alignment === 'good') this.executedGood++;
    const lev = this.holder('leviathan');
    if (lev?.alive && p.alignment === 'good' && this.executedGood > 1) this.winNote = 'Leviathan: more than one good player has been executed, so evil wins.';
    if (p.characterId === 'goblin' && p.reminders.includes('Claimed') && this.sober(p)) this.winNote = 'Goblin: the Goblin claimed when nominated and was executed, so evil wins.';
    if (p.characterId === 'saint' && this.sober(p)) this.winNote = 'Saint executed: good loses.';
    const fm = n && this.maybePlayer(n.nominatorId);
    if (fm && fm.characterId === 'fearmonger' && this.sober(fm) && n!.nomineeId === p.id && p.reminders.includes('Fear')) this.winNote = `Fearmonger executed their chosen player: ${p.alignment === 'good' ? 'good' : 'evil'} loses.`;
    if (p.characterId === 'psychopath' && this.sober(p)) this.winNote = 'Psychopath executed: they only die if they lose at rock-paper-scissors (start it from Group actions).';
    if (p.characterId === 'boomdandy' && this.sober(p)) this.winNote = 'Boomdandy executed: all but three players die, then the three point (start it from Group actions).';
  }
  /** Characters in play whose win conditions the Storyteller should keep in mind. */
  specialWinRules(): string[] {
    const R: Record<string, string> = {
      alsaahir: 'Alsaahir: if they publicly name every Minion and the Demon correctly, good wins.',
      atheist: 'Atheist: if the Storyteller is executed, good wins (no evil players are in play).',
      cultleader: 'Cult Leader: if every good player chooses to join the cult, the Cult Leader\'s team wins.',
      damsel: 'Damsel: if a Minion publicly guesses the Damsel (once), good loses.',
      fearmonger: 'Fearmonger: if they nominate and execute their chosen player, that player\'s team loses.',
      goblin: 'Goblin: if they claim to be the Goblin when nominated and are executed that day, evil wins.',
      heretic: 'Heretic: whoever wins loses, and whoever loses wins (even if the Heretic is dead). Swap the winner when you end the game.',
      leviathan: 'Leviathan: if more than one good player is executed, or after day 5, evil wins.',
      politician: 'Politician: if most responsible for their team losing, they change alignment and win.',
      saint: 'Saint: if executed, good loses.',
      mayor: 'Mayor: three alive and a day with no execution: good wins.',
      vortox: 'Vortox: a day with no execution means evil wins.',
      klutz: 'Klutz: when they learn they died, they choose a player; if evil, good loses.',
    };
    return [...new Set(this.players.map(p => p.characterId ?? ''))].filter(id => R[id]).map(id => R[id]);
  }
  winHint(): string | null {
    if (!['night', 'day'].includes(this.phase)) return null;
    if (this.winNote) return this.winNote;
    const lev = this.holder('leviathan');
    if (lev?.alive && this.day > 5) return 'Leviathan: it is after day 5, so evil wins.';
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
