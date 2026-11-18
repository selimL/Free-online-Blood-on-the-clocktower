import type { Alignment } from './characters';

export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 10;
export const JOIN_DELAY_MS = 3000;

export type Phase = 'lobby' | 'dealt' | 'questions' | 'night' | 'day' | 'ended';
export type DayStage = 'discussion' | 'private' | 'nominations' | 'accusation' | 'defense' | 'voting' | 'closed';

export interface Avatar {
  skin: number; hair: number; hairColor: number; eyes: number;
  outfit: number; outfitColor: number; accessory: number;
}
export const AVATAR_LIMITS: Record<keyof Avatar, number> = {
  skin: 6, hair: 7, hairColor: 8, eyes: 4, outfit: 5, outfitColor: 8, accessory: 7,
};
export const defaultAvatar = (): Avatar => ({ skin: 1, hair: 1, hairColor: 2, eyes: 0, outfit: 0, outfitColor: 0, accessory: 0 });

/** Timer lengths in seconds; null = no limit, Storyteller ends it manually. */
export interface Timers {
  discussion: number | null;
  privateRooms: number | null;
  nominations: number | null;
  accusation: number | null;
  defense: number | null;
  question: number | null;
  voteSeconds: number; // per voter (spec: 3)
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
}

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
  publicList: PublicListSettings;
  timers: Timers;
  houseRules: HouseRules;
  region: string | null;     // null = auto
}

export const defaultSettings = (): Settings => ({
  edition: 'tb',
  characters: [],
  fabled: [],
  bootleggerRules: '',
  publicList: { visible: true, hidden: [], showHiddenCount: true },
  timers: { discussion: 120, privateRooms: 300, nominations: 120, accusation: 60, defense: 60, question: 120, voteSeconds: 3 },
  houseRules: {
    ghostsInPrivateRooms: true, privateRoomsDuringNominations: false, allowCharacterReveal: false,
    allowTravellers: true, privateRoomCapMinutes: null, timersAutoAdvance: true, anonymousVotes: false,
    autoMuteDuringSpeeches: false, evilInfoSmallGames: false, announceCauseOfDeath: false, revealOnDeath: false,
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
}

export interface StorytellerPublic { name: string; avatar: Avatar; location: string | null; connected: boolean }

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
  characterList: { visible: boolean; characters: string[]; hiddenCount: number | null; hiddenExists: boolean; fabled: string[]; bootleggerRules: string } | null;
  houseRules: HouseRules;
  timers: Timers;
  announcements: Announcement[];
  winner: Alignment | null;
  voice: { enabled: boolean; region: string | null };
  speakerId: string | null;   // current accuser/accused
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
}

export interface LobbyEntry { id: string; code: string; name: string; players: number; max: number; edition: string; status: 'waiting' | 'in progress' | 'ended' }
