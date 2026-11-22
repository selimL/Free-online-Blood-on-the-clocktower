import type { Alignment } from './characters';

export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 10;
export const JOIN_DELAY_MS = 3000;

export type Phase = 'lobby' | 'dealt' | 'questions' | 'night' | 'day' | 'ended';
export type DayStage = 'discussion' | 'private' | 'nominations' | 'accusation' | 'defense' | 'voting' | 'closed' | 'speedround';

export interface Avatar {
  skin: number; hair: number; hairColor: number; eyes: number;
  outfit: number; outfitColor: number; accessory: number;
  build: number; height: number; // 3D figure proportions (0 = average)
}
export const AVATAR_LIMITS: Record<keyof Avatar, number> = {
  skin: 6, hair: 7, hairColor: 8, eyes: 4, outfit: 5, outfitColor: 8, accessory: 7, build: 3, height: 3,
};
export const defaultAvatar = (): Avatar => ({ skin: 1, hair: 1, hairColor: 2, eyes: 0, outfit: 0, outfitColor: 0, accessory: 0, build: 0, height: 0 });

/** Timer lengths in seconds; null = no limit, Storyteller ends it manually. */
export interface Timers {
  discussion: number | null;
  privateRooms: number | null;
  nominations: number | null;
  accusation: number | null;
  defense: number | null;
  question: number | null;
  voteSeconds: number; // per voter (spec: 3)
  speedRound: number;  // seconds per player in a speed round
}

export interface HouseRules {
  ghostsInPrivateRooms: boolean;
  privateRoomsDuringNominations: boolean;
  allowCharacterReveal: boolean;
  allowTravellers: boolean;
  privateRoomCapMinutes: number | null;
  timersAutoAdvance: boolean;
  anonymousVotes: boolean;
  autoMuteDuringSpeeches: boolean;
  evilInfoSmallGames: boolean;
  announceCauseOfDeath: boolean;
  revealOnDeath: boolean;
  // --- from the rules reference PDF ---
  maxWhispersPerDay: number | null;
  roomCapOverride: number | null;
  speedRound: boolean;
  openVoteRecord: boolean;
  grimoireRevealAtEnd: boolean;
  beginnerMode: boolean;
  noOaths: boolean;
  noScreenshots: boolean;
  travellersCantBeChanged: boolean;
  abilityDeclarationLimit: number | null;
  succorForEvil: boolean;
  holySpirit: boolean;
  allowSpectators: boolean;
  voiceTranscript: boolean;
}

/** House rules that hold a number (null = off) rather than a boolean. */
export const NUMERIC_HOUSE_RULES: Record<string, { default: number; min: number; max: number; unit: string }> = {
  privateRoomCapMinutes: { default: 5, min: 1, max: 60, unit: 'min' },
  maxWhispersPerDay: { default: 3, min: 1, max: 30, unit: 'visits' },
  roomCapOverride: { default: 2, min: 1, max: 10, unit: 'players' },
  abilityDeclarationLimit: { default: 3, min: 1, max: 20, unit: 'per day' },
};

export const HOUSE_RULE_INFO: Record<keyof HouseRules, { label: string; help: string; source: string }> = {
  ghostsInPrivateRooms: { label: 'Ghosts may join private rooms', help: 'Dead players can still whisper in side rooms.', source: 'Official (dead players may talk)' },
  privateRoomsDuringNominations: { label: 'Private rooms during nominations', help: 'If off, everyone is pulled to the Town Square and side rooms close while nominations are open.', source: 'Community convention' },
  allowCharacterReveal: { label: 'Allow character reveals', help: 'Players may show their (believed) character card to another player. Normally forbidden.', source: 'Official rule forbids; casual variant' },
  allowTravellers: { label: 'Allow Travellers mid-game', help: 'New arrivals after the start join as Travellers (the Storyteller assigns the character).', source: 'Official Travellers rules' },
  privateRoomCapMinutes: { label: 'Private-room time cap per day (minutes)', help: 'Each player may spend at most this long in side rooms each day.', source: 'Community (online pacing)' },
  timersAutoAdvance: { label: 'Timers auto-advance', help: 'When a timer runs out, the game moves on automatically. Off = timers are advisory; the Storyteller controls the day.', source: 'Community (online servers)' },
  anonymousVotes: { label: 'Anonymous votes', help: 'Only vote totals are shown, not who raised their hand.', source: 'Variant (cf. Organ Grinder)' },
  autoMuteDuringSpeeches: { label: 'Auto-mute during accusation/defence', help: 'Only the speaker (and the Storyteller) can talk during speeches.', source: 'Community etiquette' },
  evilInfoSmallGames: { label: 'Evil info in 5–6 player games', help: 'Show Minion/Demon info and bluffs even in Teensyville-size games (officially skipped).', source: 'Variant of official Teensyville rule' },
  announceCauseOfDeath: { label: 'Announce cause of death', help: 'Lets the Storyteller attach a cause to death announcements.', source: 'Casual variant' },
  revealOnDeath: { label: 'Reveal character on death', help: 'A dead player\'s true character is shown to everyone.', source: 'Beginner variant' },
  maxWhispersPerDay: { label: 'Whisper limit: side-room visits per day', help: 'Each player may enter side rooms at most this many times per day.', source: 'Table/online convention (Whisper limits)' },
  roomCapOverride: { label: 'Whisper limit: players per side room', help: 'Overrides the default cap of half the players per side room.', source: 'Table/online convention (Whisper limits)' },
  speedRound: { label: 'Speed round', help: 'Enables a Speed round stage before nominations: each living player in seat order gets a few seconds in the spotlight to state their claim.', source: 'Table/online convention' },
  openVoteRecord: { label: 'Open vote record', help: 'Everyone can see who voted on every nomination for the rest of the game.', source: 'Table/online convention' },
  grimoireRevealAtEnd: { label: 'Grimoire reveal at end', help: 'At game end, show everyone the full Grimoire: alignments, believed characters and reminders, not just characters.', source: 'Table/online convention' },
  beginnerMode: { label: 'Beginner mode', help: 'Adds the Toymaker, Angel and Buddhist Fabled for groups with new players.', source: 'Table/online convention' },
  noOaths: { label: 'No oaths', help: 'Players may not swear real-world oaths ("I swear on my life") to prove a claim. Shown to players as a table rule.', source: 'Table convention' },
  noScreenshots: { label: 'No screenshots', help: 'Players may not show screenshots or screen-share their character card or night info. Shown to players as a table rule.', source: 'Online convention' },
  travellersCantBeChanged: { label: 'Travellers can\'t be changed', help: 'Character-changing abilities (Pit-Hag, Barber, Snake Charmer…) can\'t change or swap Travellers; the Grimoire blocks it.', source: 'Community house rule (TPI-endorsed)' },
  abilityDeclarationLimit: { label: 'Ability declaration limit', help: 'Caps how many public ability uses (real or claimed) may happen per day, to save time.', source: 'Community house rule (TPI-endorsed)' },
  succorForEvil: { label: 'Succor for Evil', help: 'The Demon learns every Traveller\'s alignment.', source: 'Community house rule' },
  allowSpectators: { label: 'Allow spectators', help: 'People can watch the game without a seat. They see only public information, can hear the Town Square, and cannot speak or type.', source: 'Online convention' },
  voiceTranscript: { label: 'Voice transcript (Storyteller only)', help: 'Players who agree have what they say turned into text in their own browser (Chrome/Edge; it uses Google\'s speech service) and kept in a transcript only the Storyteller can read. Everyone is asked first and can say no or withdraw at any time.', source: 'Online table option' },
  holySpirit: { label: 'Holy Spirit ruling', help: 'If a good player kills a good Saint with an ability (e.g. Gunslinger), it counts as an execution and good loses. Shown to players as a table rule.', source: 'Community house rule' },
};

export interface PublicListSettings {
  visible: boolean;
  hidden: string[];          // character ids hidden from the public list
  showHiddenCount: boolean;  // "+ 2 hidden" vs "+ some hidden"
}

export interface Settings {
  edition: 'tb' | 'bmr' | 'snv' | 'custom';
  characters: string[];      // the bag: exactly one per non-traveller player
  fabled: string[];
  bootleggerRules: string;
  djinnRules: string;        // jinxes announced by the Djinn
  script: string[];          // custom script (character pool); empty = edition
  scriptName: string | null;
  publicList: PublicListSettings;
  timers: Timers;
  houseRules: HouseRules;
  region: string | null;     // null = auto
  openBuildings: number[];   // building indices (0-7) the Storyteller opened; [] = automatic
  weather: WeatherSetting;   // cosmetic: the 3D town's weather
}

export type Weather = 'clear' | 'rain' | 'fog' | 'snow' | 'storm';
export type WeatherSetting = Weather | 'random';
export const WEATHERS: { id: WeatherSetting; label: string }[] = [
  { id: 'clear', label: '☀ Clear' }, { id: 'fog', label: '🌫 Fog' }, { id: 'rain', label: '🌧 Rain' },
  { id: 'storm', label: '⛈ Storm' }, { id: 'snow', label: '❄ Snow' }, { id: 'random', label: '🎲 Different each day' },
];
/** "Different each day": the same for everyone, chosen from the game id and the day. */
export function resolveWeather(setting: WeatherSetting, gameId: string, day: number): Weather {
  if (setting !== 'random') return setting;
  let h = day * 7919;
  for (const ch of gameId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pool: Weather[] = ['clear', 'clear', 'fog', 'rain', 'rain', 'storm', 'snow'];
  return pool[h % pool.length];
}

export const defaultSettings = (): Settings => ({
  edition: 'tb',
  characters: [],
  fabled: [],
  bootleggerRules: '',
  djinnRules: '',
  script: [],
  scriptName: null,
  openBuildings: [],
  weather: 'clear',
  publicList: { visible: true, hidden: [], showHiddenCount: true },
  timers: { discussion: 120, privateRooms: 300, nominations: 120, accusation: 60, defense: 60, question: 120, voteSeconds: 3, speedRound: 20 },
  houseRules: {
    ghostsInPrivateRooms: true, privateRoomsDuringNominations: false, allowCharacterReveal: false,
    allowTravellers: true, privateRoomCapMinutes: null, timersAutoAdvance: true, anonymousVotes: false,
    autoMuteDuringSpeeches: false, evilInfoSmallGames: false, announceCauseOfDeath: false, revealOnDeath: false,
    maxWhispersPerDay: null, roomCapOverride: null, speedRound: false, openVoteRecord: false, grimoireRevealAtEnd: false,
    beginnerMode: false, noOaths: false, noScreenshots: false, travellersCantBeChanged: false, abilityDeclarationLimit: null,
    succorForEvil: false, holySpirit: false, allowSpectators: true, voiceTranscript: false,
  },
  region: null,
});

export interface InfoCard {
  id: string;
  when: string;              // "Night 1", "Day 2"
  text: string;
  playerIds: string[];
  characterIds: string[];
  alignment?: Alignment;
}

export interface RoomView {
  id: string;
  name: string;
  icon: string;
  kind: 'square' | 'private' | 'study';
  capacity: number | null;
  occupants: string[];       // player ids (and 'st')
}

export interface PublicPlayer {
  id: string;
  name: string;
  seat: number;
  avatar: Avatar;
  alive: boolean;
  ghostVoteUsed: boolean;
  claim: string;             // free label, possibly a bluff
  location: string | null;
  joining: boolean;
  muted: boolean;
  connected: boolean;
  traveller: boolean;
  travellerCharacter: string | null; // travellers are public
  revealedCharacter: string | null;  // end of game / reveal-on-death
  evilMark: boolean;         // only ever true in views of (believed) evil players
  pos: WalkPos | null;       // free-walk position in the 3D town (null = at seat)
  bot: boolean;              // computer-controlled seat
  offlineSince: number | null; // lost connection at (shown after a short grace period)
  revealedGrimoire: { alignment: Alignment; shownCharacterId: string | null; reminders: string[] } | null; // end of game, house rule
}

export interface NominationView {
  nominatorId: string;
  nomineeId: string;
  exile: boolean;
  order: string[];
  voteIndex: number;          // index of voter whose hand is currently being counted
  hands: Record<string, boolean>; // live raised hands (empty if anonymous)
  locked: Record<string, boolean>; // locked results (empty if anonymous)
  tally: number;
  needed: number;
  done: boolean;
  result: string | null;
  /** Organ Grinder: votes are secret. */
  secret?: boolean;
}

/** Public shape of a day ability use — identical for real and bluffed uses. */
export interface AbilityEventView {
  id: string;
  playerId: string;
  characterId: string;
  stage: 'gathering' | 'acting' | 'pending' | 'resolved';
  needsTarget: boolean;
  targetId: string | null;
  prompt: string;
  result: string | null;
}

export interface TimerView { label: string; endsAt: number | null; remainingMs: number | null; paused: boolean }

export interface Announcement { id: string; text: string; ts: number; kind: 'info' | 'death' | 'ability' | 'vote' | 'phase' }

export interface EvilTeamView {
  members: { id: string; role: 'demon' | 'minion' | 'evil' }[];
  bluffs: string[];
}

export interface SelfView {
  id: string;
  isStoryteller: false;
  characterId: string | null;      // perceived character
  alignment: Alignment | null;     // perceived alignment
  evilTeam: EvilTeamView | null;
  notes: InfoCard[];
  awake: boolean;
  questionAnswered: boolean;
  abilityAvailable: boolean;       // for perceived character's day ability
  claimsUsed: Record<string, number>;
  nominatedToday: boolean;
  privateMsUsedToday: number;
  revealedTo: { fromId: string; characterId: string }[];
  /** Watching only: no seat, no character, no voice or chat of their own. */
  spectator?: boolean;
  /** Voice transcript: whether this player agreed (null = not asked yet). */
  transcriptConsent?: boolean | null;
  /** Practice game: the Guide's current tip for this player. */
  tutorial?: { title: string; text: string; next: string | null; done: boolean } | null;
}

export interface StorytellerPublic { name: string; avatar: Avatar; location: string | null; connected: boolean; pos: WalkPos | null }
export interface WalkPos { x: number; z: number; ry: number }

export interface TranscriptLine { id: string; playerId: string; room: string; text: string; ts: number; when: string }

export interface PromptView { id: string; kind: 'livedie' | 'rps' | 'point'; title: string; playerIds: string[]; options: string[]; answers: Record<string, string>; public: boolean; endsAt: number | null; result: string | null; applied: boolean }

export interface WhisperView { id: string; playerId: string; fromST: boolean; text: string; ts: number }

export interface GameView {
  id: string;
  code: string;
  name: string;
  visibility: 'public' | 'private';
  phase: Phase;
  stage: DayStage | null;
  day: number;
  night: number;
  paused: boolean;
  storyteller: StorytellerPublic;
  players: PublicPlayer[];
  rooms: RoomView[];
  timer: TimerView | null;
  nomination: NominationView | null;
  nominatedToday: string[];
  nominatorsToday: string[];
  aboutToDie: { playerId: string; votes: number } | null;
  ability: AbilityEventView | null;
  questions: { active: boolean; currentId: string | null; done: number; total: number; queue: string[] };
  characterList: { visible: boolean; characters: string[]; hiddenCount: number | null; hiddenExists: boolean; fabled: string[]; bootleggerRules: string; djinnRules: string } | null;
  houseRules: HouseRules;
  timers: Timers;
  announcements: Announcement[];
  winner: Alignment | null;
  voice: { enabled: boolean; region: string | null };
  speakerId: string | null;   // current accuser/accused / speed-round speaker
  canWalk: boolean;           // free walking allowed in the 3D Town Square right now
  spectators: { id: string; name: string; connected: boolean }[];
  tableRules: string[];
  voteHistory: VoteRecord[] | null;
  /** Today's weather in the 3D town. */
  weather: Weather;
  /** Planned start time (ms), shown with a countdown. */
  scheduledFor: number | null;
  /** Group actions the viewer takes part in (or public ones); the Storyteller sees all. */
  prompts: PromptView[];
  /** God of Ug: who wears the Ug hat (public). */
  ugHat: string | null;
  /** Tor (Loric): characters stay hidden until death. */
  torActive: boolean;
  /** After the game: MVP votes per player, and the viewer's own vote. */
  mvp: { votes: Record<string, number>; mine: string | null } | null;
  /** Private messages with the Storyteller: a player sees their own thread, the Storyteller sees all. */
  whispers: WhisperView[];
  /** The whole story, revealed to everyone once the game has ended (null before then). */
  story: GameStory | null;
  self: SelfView | StorytellerSelf;
}

export interface GrimoireSeat {
  id: string;
  characterId: string | null;
  shownCharacterId: string | null;
  alignment: Alignment;
  shownAlignment: Alignment | null;
  reminders: string[];
  fakeEvilTeam: string[];
  notes: InfoCard[];
  nightChoice: string[];
  awake: boolean;
  wantsQuestion: boolean | null;
  abilityUses: Record<string, number>;
}

export interface PendingAbility {
  eventId: string;
  playerId: string;
  characterId: string;
  real: boolean;
  impaired: string[];         // reasons the ability may fail (drunk, poisoned, true Drunk…)
  suggestion: 'kill' | 'nothing' | 'decide';
  resolution: 'kill' | 'note';
  suggestionText: string;
  isPrivate: boolean;
}

export interface StorytellerSelf {
  id: 'st';
  isStoryteller: true;
  settings: Settings;
  grimoire: GrimoireSeat[];
  demonBluffs: string[];
  lunaticBluffs: string[];
  pendingDawnDeaths: string[];
  pendingAbility: PendingAbility | null;
  privateRequests: { playerId: string; characterId: string; eventId: string }[];
  notes: string;
  log: string[];
  regionsRtt: Record<string, Record<string, number>>;
  availableRegions: string[];
  nightOrder: { id: string; name: string; text: string; players: string[] }[];
  focusId: string | null;
  winHint: string | null;
  /** The last Storyteller action that can still be undone. */
  undo?: { label: string; at: number } | null;
  /** Mezepheles / Yaggababble secret words and today's count. */
  secretWords: { mezepheles: string; yaggababble: string };
  yaggababbleCount: number;
  /** Characters in play with special win conditions. */
  winRules: string[];
  /** Who was executed on the most recent day (Undertaker). */
  lastExecutedId: string | null;
}

export interface LobbyEntry { id: string; code: string; name: string; players: number; max: number; edition: string; status: 'waiting' | 'in progress' | 'ended'; scheduledFor: number | null }

export interface VoteRecord { day: number; nominatorId: string; nomineeId: string; exile: boolean; yes: string[]; votes: number; needed: number; result: string }

export interface GameStory {
  log: string[];
  votes: VoteRecord[];
  grimoire: { id: string; name: string; characterId: string | null; shownCharacterId: string | null; alignment: Alignment; alive: boolean; reminders: string[]; traveller: boolean }[];
  demonBluffs: string[];
}

/** Gestures a player can make: an emoji bubble plus a short animation of their 3D figure. Purely cosmetic. */
export const EMOTES = [
  { id: 'wave', icon: '👋', label: 'Wave' },
  { id: 'nod', icon: '🙂', label: 'Nod' },
  { id: 'shake', icon: '🙅', label: 'Shake head' },
  { id: 'thumbsup', icon: '👍', label: 'Thumbs up' },
  { id: 'thumbsdown', icon: '👎', label: 'Thumbs down' },
  { id: 'shrug', icon: '🤷', label: 'Shrug' },
  { id: 'think', icon: '🤔', label: 'Think' },
  { id: 'point', icon: '👉', label: 'Point' },
  { id: 'clap', icon: '👏', label: 'Clap' },
  { id: 'gasp', icon: '😱', label: 'Gasp' },
] as const;
export type EmoteId = (typeof EMOTES)[number]['id'];
export interface EmoteEvent { id: string; kind: EmoteId; ts: number }
