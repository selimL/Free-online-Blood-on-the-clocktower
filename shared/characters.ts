// Character data for the three official editions plus Travellers and Fabled.
// Ability descriptions are PARAPHRASED summaries of each character's mechanics,
// not the official wording. For the exact official text and rulings see
// https://wiki.bloodontheclocktower.com (not reachable from the build sandbox,
// so verify mechanics there). Characters © The Pandemonium Institute.
// Private, non-commercial use only.

export type CharacterType = 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'traveller' | 'fabled';
export type Edition = 'tb' | 'bmr' | 'snv' | 'fabled';
export type Alignment = 'good' | 'evil';

export interface Character {
  id: string;
  name: string;
  edition: Edition;
  type: CharacterType;
  ability: string;
  /** Short note for setup modifications shown to the Storyteller. */
  setup?: string;
  reminders?: string[];
}

export const EDITIONS: Record<Exclude<Edition, 'fabled'>, string> = {
  tb: 'Trouble Brewing',
  bmr: 'Bad Moon Rising',
  snv: 'Sects & Violets',
};

const c = (
  edition: Edition, type: CharacterType, id: string, name: string, ability: string,
  extra: Partial<Character> = {},
): Character => ({ id, name, edition, type, ability, ...extra });

export const CHARACTERS: Character[] = [
  // ---------------- Trouble Brewing ----------------
  c('tb', 'townsfolk', 'washerwoman', 'Washerwoman', 'On the first night, learn two players — one of them is a specific Townsfolk.', { reminders: ['Townsfolk', 'Wrong'] }),
  c('tb', 'townsfolk', 'librarian', 'Librarian', 'On the first night, learn two players — one of them is a specific Outsider (or learn that no Outsiders are in play).', { reminders: ['Outsider', 'Wrong'] }),
  c('tb', 'townsfolk', 'investigator', 'Investigator', 'On the first night, learn two players — one of them is a specific Minion.', { reminders: ['Minion', 'Wrong'] }),
  c('tb', 'townsfolk', 'chef', 'Chef', 'On the first night, learn how many pairs of evil players sit next to each other.'),
  c('tb', 'townsfolk', 'empath', 'Empath', 'Every night, learn how many of your two nearest living neighbours are evil.'),
  c('tb', 'townsfolk', 'fortuneteller', 'Fortune Teller', 'Every night, pick two players and learn whether either is a Demon. One good player falsely shows up as a Demon for you.', { reminders: ['Red herring'] }),
  c('tb', 'townsfolk', 'undertaker', 'Undertaker', 'Every night except the first, learn the character of the player executed that day.', { reminders: ['Executed'] }),
  c('tb', 'townsfolk', 'monk', 'Monk', 'Every night except the first, protect another player from the Demon for that night.', { reminders: ['Protected'] }),
  c('tb', 'townsfolk', 'ravenkeeper', 'Ravenkeeper', 'If the Demon kills you at night, you wake and pick a player to learn their character.'),
  c('tb', 'townsfolk', 'virgin', 'Virgin', 'The first time someone nominates you, if that nominator is a Townsfolk, they are executed on the spot.', { reminders: ['No ability'] }),
  c('tb', 'townsfolk', 'slayer', 'Slayer', 'Once per game, by day, publicly pick a player. If they are the Demon, they die.', { reminders: ['No ability'] }),
  c('tb', 'townsfolk', 'soldier', 'Soldier', 'The Demon cannot kill you.'),
  c('tb', 'townsfolk', 'mayor', 'Mayor', 'If three players remain alive and the day ends without an execution, good wins. If you would die at night, someone else might die in your place.'),
  c('tb', 'outsider', 'butler', 'Butler', 'Every night, pick a master (not yourself). Tomorrow you may only vote when your master votes.', { reminders: ['Master'] }),
  c('tb', 'outsider', 'drunk', 'Drunk', 'You believe you are a Townsfolk, but you are really the Drunk and your ability does nothing.', { reminders: ['Drunk'] }),
  c('tb', 'outsider', 'recluse', 'Recluse', 'You may show up as evil, and as a Minion or Demon, even after death.'),
  c('tb', 'outsider', 'saint', 'Saint', 'If you are executed, your team loses.'),
  c('tb', 'minion', 'poisoner', 'Poisoner', 'Every night, pick a player to poison for that night and the next day.', { reminders: ['Poisoned'] }),
  c('tb', 'minion', 'spy', 'Spy', 'Every night you may look at the Grimoire. You may show up as good, and as a Townsfolk or Outsider, even after death.'),
  c('tb', 'minion', 'scarletwoman', 'Scarlet Woman', 'If the Demon dies while at least 5 players are alive, you become the Demon. (Travellers are not counted.)', { reminders: ['Demon'] }),
  c('tb', 'minion', 'baron', 'Baron', 'Adds two extra Outsiders to the game, replacing two Townsfolk. [+2 Outsiders]', { setup: '+2 Outsiders, −2 Townsfolk' }),
  c('tb', 'demon', 'imp', 'Imp', 'Every night except the first, pick a player to kill. If you pick yourself, a Minion becomes the Imp.', { reminders: ['Dead'] }),
  c('tb', 'traveller', 'scapegoat', 'Scapegoat', 'If a player on your team is executed, you may be executed in their place.'),
  c('tb', 'traveller', 'gunslinger', 'Gunslinger', 'Each day, once the first vote is counted, you may pick a player who voted: they die.'),
  c('tb', 'traveller', 'beggar', 'Beggar', 'You need someone\'s vote token to vote. If a dead player gives you theirs, you learn their alignment. You are never drunk or poisoned.'),
  c('tb', 'traveller', 'bureaucrat', 'Bureaucrat', 'Every night, pick another player: tomorrow their vote is worth three.', { reminders: ['3 votes'] }),
  c('tb', 'traveller', 'thief', 'Thief', 'Every night, pick another player: tomorrow their vote counts as minus one.', { reminders: ['Negative vote'] }),

  // ---------------- Bad Moon Rising ----------------
  c('bmr', 'townsfolk', 'grandmother', 'Grandmother', 'On the first night, learn a good player and their character. If the Demon kills them, you die as well.', { reminders: ['Grandchild'] }),
  c('bmr', 'townsfolk', 'sailor', 'Sailor', 'Every night, pick a living player: you or they become drunk until dusk. You cannot die.', { reminders: ['Drunk'] }),
  c('bmr', 'townsfolk', 'chambermaid', 'Chambermaid', 'Every night, pick two other living players and learn how many of them woke tonight because of their own ability.'),
  c('bmr', 'townsfolk', 'exorcist', 'Exorcist', 'Every night except the first, pick a player (not last night\'s choice). If it is the Demon, they learn who you are and skip waking tonight.', { reminders: ['Chosen'] }),
  c('bmr', 'townsfolk', 'innkeeper', 'Innkeeper', 'Every night except the first, pick two players: neither can die tonight, but one of them is drunk until dusk.', { reminders: ['Protected', 'Drunk'] }),
  c('bmr', 'townsfolk', 'gambler', 'Gambler', 'Every night except the first, pick a player and guess their character. Guess wrong and you die.'),
  c('bmr', 'townsfolk', 'gossip', 'Gossip', 'Each day you may make a public claim. If it was true, someone dies that night.'),
  c('bmr', 'townsfolk', 'courtier', 'Courtier', 'Once per game, at night, name a character: that character is drunk for three days and nights.', { reminders: ['Drunk 1', 'Drunk 2', 'Drunk 3', 'No ability'] }),
  c('bmr', 'townsfolk', 'professor', 'Professor', 'Once per game, on a night after the first, pick a dead player: if they are a Townsfolk, they come back to life.', { reminders: ['Alive', 'No ability'] }),
  c('bmr', 'townsfolk', 'minstrel', 'Minstrel', 'If a Minion is executed, everyone else (not Travellers) is drunk until dusk the next day.', { reminders: ['Everyone drunk'] }),
  c('bmr', 'townsfolk', 'tealady', 'Tea Lady', 'While both of your living neighbours are good, neither of them can die.', { reminders: ['Can not die'] }),
  c('bmr', 'townsfolk', 'pacifist', 'Pacifist', 'A good player who is executed might survive.'),
  c('bmr', 'townsfolk', 'fool', 'Fool', 'You survive the first time you would die.', { reminders: ['No ability'] }),
  c('bmr', 'outsider', 'tinker', 'Tinker', 'You could die at any moment.'),
  c('bmr', 'outsider', 'moonchild', 'Moonchild', 'When you find out you have died, publicly pick a living player. If they are good, they die that night.'),
  c('bmr', 'outsider', 'goon', 'Goon', 'Each night, the first player whose ability targets you becomes drunk until dusk, and you switch to their alignment.', { reminders: ['Drunk'] }),
  c('bmr', 'outsider', 'lunatic', 'Lunatic', 'You believe you are the Demon, but you are not. The real Demon knows who you are and whom you pick at night.', { reminders: ['Attack 1', 'Attack 2', 'Attack 3'] }),
  c('bmr', 'minion', 'godfather', 'Godfather', 'On the first night, learn which Outsiders are in play. If an Outsider died today, pick a player tonight to kill. [−1 or +1 Outsider]', { setup: '−1 or +1 Outsider (Townsfolk adjust to keep the total)' }),
  c('bmr', 'minion', 'devilsadvocate', 'Devil\'s Advocate', 'Every night, pick a living player (not last night\'s choice): if executed tomorrow, they survive.', { reminders: ['Survives execution'] }),
  c('bmr', 'minion', 'assassin', 'Assassin', 'Once per game, on a night after the first, pick a player: they die, no matter what would normally protect them.', { reminders: ['No ability'] }),
  c('bmr', 'minion', 'mastermind', 'Mastermind', 'If the Demon is executed and that would end the game, play one more day. Whoever\'s team loses an execution that day loses the game.'),
  c('bmr', 'demon', 'zombuul', 'Zombuul', 'Every night except the first, if nobody died that day, pick a player to kill. The first time you die, you secretly survive but count as dead.', { reminders: ['Died today', 'Dead'] }),
  c('bmr', 'demon', 'pukka', 'Pukka', 'Every night, pick a player to poison. The player you poisoned before dies, then recovers from the poison.', { reminders: ['Poisoned', 'Dead'] }),
  c('bmr', 'demon', 'shabaloth', 'Shabaloth', 'Every night except the first, pick two players to kill. Someone you killed last night might come back to life.', { reminders: ['Dead', 'Alive'] }),
  c('bmr', 'demon', 'po', 'Po', 'Every night except the first, you may pick a player to kill. If you picked nobody last time, pick three players tonight.', { reminders: ['Dead', '3 attacks'] }),
  c('bmr', 'traveller', 'apprentice', 'Apprentice', 'On your first night, you receive a Townsfolk ability if you are good, or a Minion ability if you are evil.'),
  c('bmr', 'traveller', 'matron', 'Matron', 'Each day, you may swap the seats of up to three pairs of players. Nobody may leave their seat for a private chat.'),
  c('bmr', 'traveller', 'judge', 'Judge', 'Once per game, when someone else nominated, you may decide that the current execution succeeds or fails.'),
  c('bmr', 'traveller', 'bishop', 'Bishop', 'Only the Storyteller may nominate, and at least one player from your opposing team must be nominated every day.'),
  c('bmr', 'traveller', 'voudon', 'Voudon', 'Only you and dead players may vote, and they need no vote token. No majority is required.'),

  // ---------------- Sects & Violets ----------------
  c('snv', 'townsfolk', 'clockmaker', 'Clockmaker', 'On the first night, learn how many seats separate the Demon from its closest Minion.'),
  c('snv', 'townsfolk', 'dreamer', 'Dreamer', 'Every night, pick a player (not yourself or a Traveller): learn one good and one evil character, one of which is theirs.'),
  c('snv', 'townsfolk', 'snakecharmer', 'Snake Charmer', 'Every night, pick a living player. If it is the Demon, you swap characters and alignments, and they become poisoned.', { reminders: ['Poisoned'] }),
  c('snv', 'townsfolk', 'mathematician', 'Mathematician', 'Every night, learn how many players\' abilities have malfunctioned since dawn because of another character.', { reminders: ['Abnormal'] }),
  c('snv', 'townsfolk', 'flowergirl', 'Flowergirl', 'Every night except the first, learn whether a Demon voted today.', { reminders: ['Demon voted', 'Demon not voted'] }),
  c('snv', 'townsfolk', 'towncrier', 'Town Crier', 'Every night except the first, learn whether a Minion made a nomination today.', { reminders: ['Minion nominated', 'Minion not nominated'] }),
  c('snv', 'townsfolk', 'oracle', 'Oracle', 'Every night except the first, learn how many dead players are evil.'),
  c('snv', 'townsfolk', 'savant', 'Savant', 'Each day, you may visit the Storyteller in private to learn two statements: one true, one false.'),
  c('snv', 'townsfolk', 'seamstress', 'Seamstress', 'Once per game, at night, pick two other players and learn whether they share an alignment.', { reminders: ['No ability'] }),
  c('snv', 'townsfolk', 'philosopher', 'Philosopher', 'Once per game, at night, pick a good character and gain its ability. If that character is in play, its holder becomes drunk.', { reminders: ['Drunk', 'Is the Philosopher'] }),
  c('snv', 'townsfolk', 'artist', 'Artist', 'Once per game, by day, privately ask the Storyteller one yes-or-no question.', { reminders: ['No ability'] }),
  c('snv', 'townsfolk', 'juggler', 'Juggler', 'On your first day, publicly guess the characters of up to five players. That night, learn how many guesses were right.', { reminders: ['Correct'] }),
  c('snv', 'townsfolk', 'sage', 'Sage', 'If the Demon kills you, learn two players, one of whom is the Demon.'),
  c('snv', 'outsider', 'mutant', 'Mutant', 'If you are \'mad\' about being an Outsider, you could be executed.'),
  c('snv', 'outsider', 'sweetheart', 'Sweetheart', 'When you die, one player becomes drunk for the rest of the game.', { reminders: ['Drunk'] }),
  c('snv', 'outsider', 'barber', 'Barber', 'If you died today or tonight, the Demon may pick two players (not another Demon) to swap characters.', { reminders: ['Haircuts tonight'] }),
  c('snv', 'outsider', 'klutz', 'Klutz', 'When you find out you have died, publicly pick a living player. If they are evil, your team loses.'),
  c('snv', 'minion', 'eviltwin', 'Evil Twin', 'You and a player on the other team learn each other. If that good player is executed, evil wins. Good cannot win while both of you live.', { reminders: ['Twin'] }),
  c('snv', 'minion', 'witch', 'Witch', 'Every night, pick a player: if they nominate tomorrow, they die. You lose this ability once only three players live.', { reminders: ['Cursed'] }),
  c('snv', 'minion', 'cerenovus', 'Cerenovus', 'Every night, pick a player and a good character: tomorrow they must be \'mad\' that they are that character, or they might be executed.', { reminders: ['Mad'] }),
  c('snv', 'minion', 'pithag', 'Pit-Hag', 'Every night except the first, pick a player and a character not in play: they become it. If you create a Demon, tonight\'s deaths are up to the Storyteller.'),
  c('snv', 'demon', 'fanggu', 'Fang Gu', 'Every night except the first, pick a player to kill. The first Outsider you kill this way becomes an evil Fang Gu instead, and you die. [+1 Outsider]', { setup: '+1 Outsider', reminders: ['Dead', 'Once'] }),
  c('snv', 'demon', 'vigormortis', 'Vigormortis', 'Every night except the first, pick a player to kill. Minions you kill keep their ability and poison one neighbouring Townsfolk. [−1 Outsider]', { setup: '−1 Outsider', reminders: ['Dead', 'Has ability', 'Poisoned'] }),
  c('snv', 'demon', 'nodashii', 'No Dashii', 'Every night except the first, pick a player to kill. Your two nearest Townsfolk neighbours are poisoned.', { reminders: ['Dead', 'Poisoned'] }),
  c('snv', 'demon', 'vortox', 'Vortox', 'Every night except the first, pick a player to kill. Townsfolk only receive false information. If a day ends with no execution, evil wins.', { reminders: ['Dead'] }),
  c('snv', 'traveller', 'barista', 'Barista', 'Every night, a player is either made sober and healthy with true information, or has their ability work twice, until dusk. They are told which.'),
  c('snv', 'traveller', 'harlot', 'Harlot', 'Every night except the first, pick a living player. If they accept, you learn their character, but you might both die.'),
  c('snv', 'traveller', 'butcher', 'Butcher', 'Each day, after the first execution, you may make another nomination.'),
  c('snv', 'traveller', 'bonecollector', 'Bone Collector', 'Once per game, at night, pick a dead player: they get their ability back until dusk.'),
  c('snv', 'traveller', 'deviant', 'Deviant', 'If you were funny today, exile cannot kill you.'),

  // ---------------- Fabled ----------------
  c('fabled', 'fabled', 'doomsayer', 'Doomsayer', 'While 4 or more players live, each living player may once per game publicly call for a player of their own team to die.'),
  c('fabled', 'fabled', 'angel', 'Angel', 'Whoever is most to blame for a new player\'s death may suffer for it.'),
  c('fabled', 'fabled', 'buddhist', 'Buddhist', 'Experienced players stay silent for the first two minutes of every day.'),
  c('fabled', 'fabled', 'hellslibrarian', 'Hell\'s Librarian', 'Anyone who speaks while the Storyteller has asked for silence may suffer for it.'),
  c('fabled', 'fabled', 'revolutionary', 'Revolutionary', 'Two neighbouring players are known to share an alignment. Once per game, one of them registers falsely.'),
  c('fabled', 'fabled', 'fiddler', 'Fiddler', 'Once per game, the Demon secretly picks a player from the other team, and everyone votes on which of the two wins.'),
  c('fabled', 'fabled', 'toymaker', 'Toymaker', 'The Demon may skip attacking, and must do so at least once. Evil players still get their usual starting information.'),
  c('fabled', 'fabled', 'fibbin', 'Fibbin', 'Once per game, one good player might receive false information.'),
  c('fabled', 'fabled', 'duchess', 'Duchess', 'Each day, up to three players may visit a chosen player. That night each visitor learns how many visitors are evil, but one of them gets false info.'),
  c('fabled', 'fabled', 'sentinel', 'Sentinel', 'There might be one more, or one fewer, Outsider in play than normal.'),
  c('fabled', 'fabled', 'spiritofivory', 'Spirit of Ivory', 'There can be at most one extra evil player.'),
  c('fabled', 'fabled', 'djinn', 'Djinn', 'Announces that jinx rules are in effect and tells every player which ones.'),
  c('fabled', 'fabled', 'stormcatcher', 'Storm Catcher', 'Name a good character. If it is in play, it can only die by execution, but evil players learn who has it.'),
  c('fabled', 'fabled', 'bootlegger', 'Bootlegger', 'This script uses homebrew characters or rules.'),
  c('fabled', 'fabled', 'deusexfiasco', 'Deus ex Fiasco', 'At least once per game, the Storyteller makes a deliberate mistake, then corrects it and admits it publicly.'),
  c('fabled', 'fabled', 'ferryman', 'Ferryman', 'On the last day, every dead player gets their vote token back.'),
  c('fabled', 'fabled', 'gardener', 'Gardener', 'The Storyteller chooses some players\' characters.'),
];

export const CHARACTER_BY_ID: Record<string, Character> = Object.fromEntries(CHARACTERS.map(ch => [ch.id, ch]));

export const defaultAlignment = (type: CharacterType): Alignment =>
  type === 'minion' || type === 'demon' ? 'evil' : 'good';

/** Official recommended counts (Townsfolk, Outsiders, Minions, Demons). */
export const SETUP_COUNTS: Record<number, [number, number, number, number]> = {
  5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1], 10: [7, 0, 2, 1],
  11: [7, 1, 2, 1], 12: [7, 2, 2, 1], 13: [9, 0, 3, 1], 14: [9, 1, 3, 1], 15: [9, 2, 3, 1],
};

// Night order (combined official order for the three editions, condensed).
// 'minioninfo' / 'demoninfo' / 'dusk' / 'dawn' are pseudo-entries.
export const FIRST_NIGHT_ORDER = [
  'dusk', 'philosopher', 'minioninfo', 'lunatic', 'demoninfo', 'sailor', 'snakecharmer', 'eviltwin',
  'witch', 'cerenovus', 'godfather', 'devilsadvocate', 'poisoner', 'courtier', 'bureaucrat', 'thief',
  'barista', 'apprentice', 'pukka', 'grandmother', 'washerwoman', 'librarian', 'investigator', 'chef',
  'empath', 'fortuneteller', 'butler', 'clockmaker', 'dreamer', 'seamstress', 'mathematician',
  'chambermaid', 'spy', 'dawn',
];
export const OTHER_NIGHT_ORDER = [
  'dusk', 'philosopher', 'barista', 'bonecollector', 'harlot', 'sailor', 'snakecharmer', 'witch',
  'cerenovus', 'pithag', 'bureaucrat', 'thief', 'poisoner', 'devilsadvocate', 'courtier', 'innkeeper',
  'monk', 'gambler', 'exorcist', 'scarletwoman', 'lunatic', 'zombuul', 'pukka', 'shabaloth', 'po',
  'fanggu', 'nodashii', 'vortox', 'vigormortis', 'imp', 'assassin', 'godfather', 'gossip', 'tinker',
  'moonchild', 'grandmother', 'sweetheart', 'barber', 'sage', 'professor', 'ravenkeeper', 'undertaker',
  'empath', 'fortuneteller', 'dreamer', 'flowergirl', 'towncrier', 'oracle', 'seamstress', 'juggler',
  'mathematician', 'chambermaid', 'butler', 'spy', 'dawn',
];
export const NIGHT_PSEUDO: Record<string, { name: string; text: string }> = {
  dusk: { name: 'Dusk', text: 'Check all players are asleep.' },
  minioninfo: { name: 'Minion Info', text: 'If 7+ players: wake all Minions; show them the Demon and each other.' },
  demoninfo: { name: 'Demon Info', text: 'If 7+ players: wake the Demon; show the Minions and 3 not-in-play good characters (bluffs).' },
  dawn: { name: 'Dawn', text: 'Wait a few seconds, then begin the day.' },
};

/** Day-time abilities that get a [Use Ability] button. */
export interface DayAbility {
  public: boolean;          // public → can also be faked via [Claim Ability]
  target: boolean;          // needs a single player target
  frequency: 'once' | 'daily' | 'firstDay';
  prompt: string;
  /** 'kill' = the Storyteller may kill the target on the spot (Slayer); 'note' = the consequence comes later (night death, game end). */
  resolution: 'kill' | 'note';
  /** Usable only after the player has died (Klutz, Moonchild: "when you learn that you died"). */
  requiresDead?: boolean;
}
export const DAY_ABILITIES: Record<string, DayAbility> = {
  slayer: { public: true, target: true, frequency: 'once', resolution: 'kill', prompt: 'Publicly choose a player.' },
  gossip: { public: true, target: false, frequency: 'daily', resolution: 'note', prompt: 'Make your public statement aloud, then press Done.' },
  juggler: { public: true, target: false, frequency: 'firstDay', resolution: 'note', prompt: 'Publicly guess up to 5 players\' characters aloud, then press Done.' },
  klutz: { public: true, target: true, frequency: 'once', resolution: 'note', requiresDead: true, prompt: 'You have died. Publicly choose one living player.' },
  moonchild: { public: true, target: true, frequency: 'once', resolution: 'note', requiresDead: true, prompt: 'You have died. Publicly choose one living player.' },
  artist: { public: false, target: false, frequency: 'once', resolution: 'note', prompt: 'You will be taken to the Storyteller to ask one yes/no question.' },
  savant: { public: false, target: false, frequency: 'daily', resolution: 'note', prompt: 'You will be taken to the Storyteller to learn 2 things.' },
};
export const CLAIMABLE_ABILITIES = Object.entries(DAY_ABILITIES).filter(([, a]) => a.public).map(([id]) => id);

export const ROOM_NAMES = ['The Tavern', 'The Chapel', 'The Graveyard', 'The Library', 'The Apothecary', 'The Blacksmith', 'The Clocktower Stair', 'The Old Mill'];
export const ROOM_ICONS = ['🍺', '⛪', '🪦', '📚', '⚗️', '⚒️', '🕰️', '🌾'];
/** Background art files in client/public/art/ (same order as ROOM_NAMES). Missing files fall back to the plain theme. */
export const ROOM_ART = ['tavern', 'chapel', 'graveyard', 'library', 'apothecary', 'blacksmith', 'clocktower-stair', 'old-mill'];

/** Parse an official Script Tool JSON (array of ids or {id} objects, plus an optional _meta entry). */
export function parseScript(json: string): { ids: string[]; unknown: string[]; name: string | null } {
  const data = JSON.parse(json);
  if (!Array.isArray(data)) throw new Error('A script must be a JSON array.');
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const byNorm = Object.fromEntries(CHARACTERS.map(ch => [norm(ch.id), ch.id]));
  const ids: string[] = []; const unknown: string[] = []; let name: string | null = null;
  for (const item of data) {
    const raw = typeof item === 'string' ? item : item && typeof item === 'object' ? String(item.id ?? '') : '';
    if (raw === '_meta') { name = typeof item === 'object' ? String(item.name ?? '') || null : null; continue; }
    const id = byNorm[norm(raw)];
    if (id) { if (!ids.includes(id)) ids.push(id); } else if (raw) unknown.push(raw);
  }
  return { ids, unknown, name };
}

export const GENERIC_REMINDERS = ['Poisoned', 'Drunk', 'Protected', 'Mad', 'Dead tonight', 'Used ability', 'Red herring', 'Good', 'Evil'];
