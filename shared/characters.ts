// Character data for the three official editions, the Experimental characters, Travellers, Fabled and Loric.
// Ability descriptions are PARAPHRASED summaries of each character's mechanics,
// not the official wording. For the exact official text and rulings see
// https://wiki.bloodontheclocktower.com (not reachable from the build sandbox,
// so verify mechanics there). Characters © The Pandemonium Institute.
// Private, non-commercial use only.

export type CharacterType = 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'traveller' | 'fabled' | 'loric';
export type Edition = 'tb' | 'bmr' | 'snv' | 'exp' | 'fabled';
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

/** The three base editions (each a complete script on its own). */
export const EDITIONS: Record<'tb' | 'bmr' | 'snv', string> = {
  tb: 'Trouble Brewing',
  bmr: 'Bad Moon Rising',
  snv: 'Sects & Violets',
};
/** Every group of characters, including Experimental (used on custom scripts) and Fabled/Loric. */
export const EDITION_NAMES: Record<Edition, string> = { ...EDITIONS, exp: 'Experimental', fabled: 'Fabled & Loric' };
export const EDITION_SHORT: Record<Edition, string> = { tb: 'TB', bmr: 'BMR', snv: 'S&V', exp: 'EXP', fabled: '' };

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
  c('fabled', 'fabled', 'deusexfiasco', 'Deus ex Fiasco', 'At least once per game, the Storyteller makes a deliberate mistake, then corrects it and admits it publicly.'),
  c('fabled', 'fabled', 'ferryman', 'Ferryman', 'On the last day, every dead player gets their vote token back.'),
  // ---------------- Experimental (official characters beyond the base editions; for custom scripts) ----------------
  // Paraphrased from the supplied Experimental Characters reference. Wording and balance may still change: check the wiki.
  c('exp', 'townsfolk', 'acrobat', 'Acrobat', 'Each night except the first, pick a player: if they are, or become, drunk or poisoned tonight, you die.', { reminders: ['Dead'] }),
  c('exp', 'townsfolk', 'alchemist', 'Alchemist', 'You have the ability of a Minion that is not in play.', { reminders: ['Is the Alchemist'] }),
  c('exp', 'townsfolk', 'alsaahir', 'Alsaahir', 'Each day, you may publicly guess which players are Minions and which is the Demon. If you are completely right, good wins.'),
  c('exp', 'townsfolk', 'amnesiac', 'Amnesiac', 'You do not know your own ability. Each day you may privately guess it and learn how close you are.', { reminders: ['?'] }),
  c('exp', 'townsfolk', 'atheist', 'Atheist', 'The Storyteller may break the game rules. If the Storyteller is executed, good wins. [No evil characters]', { setup: 'No evil characters in play' }),
  c('exp', 'townsfolk', 'balloonist', 'Balloonist', 'Each night, learn a player of a different character type than the player you learned last night. [+0 or +1 Outsider]', { setup: '+0 or +1 Outsider', reminders: ['Seen Townsfolk', 'Seen Outsider', 'Seen Minion', 'Seen Demon'] }),
  c('exp', 'townsfolk', 'banshee', 'Banshee', 'If the Demon kills you, everyone learns it. From then on you may nominate twice per day and vote twice per nomination.', { reminders: ['Has ability'] }),
  c('exp', 'townsfolk', 'bountyhunter', 'Bounty Hunter', 'You start knowing one evil player. If that player dies, you learn another evil player that night. [One Townsfolk is evil]', { setup: 'One Townsfolk is evil', reminders: ['Known', 'Evil'] }),
  c('exp', 'townsfolk', 'cannibal', 'Cannibal', 'You have the ability of the most recently executed player. If that player was evil, you are poisoned until a good player is executed.', { reminders: ['Poisoned', 'Died today'] }),
  c('exp', 'townsfolk', 'choirboy', 'Choirboy', 'If the Demon kills the King, you learn which player is the Demon. [+ the King]', { setup: 'The King is in play' }),
  c('exp', 'townsfolk', 'cultleader', 'Cult Leader', 'Each night, you take on the alignment of one of your living neighbours. If every good player chooses to join your cult, your team wins.'),
  c('exp', 'townsfolk', 'engineer', 'Engineer', 'Once per game, at night, choose which Minions or which Demon are in play (the evil characters change).', { reminders: ['No ability'] }),
  c('exp', 'townsfolk', 'farmer', 'Farmer', 'If you die at night, a living good player becomes a Farmer.'),
  c('exp', 'townsfolk', 'fisherman', 'Fisherman', 'Once per game, during the day, visit the Storyteller for advice to help your team win.', { reminders: ['No ability'] }),
  c('exp', 'townsfolk', 'general', 'General', 'Each night, learn which team the Storyteller believes is winning: good, evil, or neither.'),
  c('exp', 'townsfolk', 'highpriestess', 'High Priestess', 'Each night, learn which player the Storyteller believes you should talk to most.'),
  c('exp', 'townsfolk', 'huntsman', 'Huntsman', 'Once per game, at night, choose a living player: if they are the Damsel, she becomes a Townsfolk not in play. [+ the Damsel]', { setup: 'The Damsel is in play', reminders: ['No ability'] }),
  c('exp', 'townsfolk', 'king', 'King', 'Each night, if the dead equal or outnumber the living, learn one living character. The Demon knows who you are.'),
  c('exp', 'townsfolk', 'knight', 'Knight', 'You start knowing two players who are not the Demon.', { reminders: ['Know'] }),
  c('exp', 'townsfolk', 'lycanthrope', 'Lycanthrope', 'Each night except the first, choose a living player: if they are good, they die and the Demon does not kill tonight. One good player registers as evil.', { reminders: ['Dead', 'Faux paw'] }),
  c('exp', 'townsfolk', 'magician', 'Magician', 'The Demon thinks you are a Minion. Minions think you are the Demon.'),
  c('exp', 'townsfolk', 'nightwatchman', 'Nightwatchman', 'Once per game, at night, choose a player: they learn who you are.', { reminders: ['No ability'] }),
  c('exp', 'townsfolk', 'noble', 'Noble', 'You start knowing three players, exactly one of whom is evil.', { reminders: ['Seen'] }),
  c('exp', 'townsfolk', 'pixie', 'Pixie', 'You start knowing one Townsfolk in play. If you are "mad" about being that character, you gain its ability when its holder dies.', { reminders: ['Mad', 'Has ability'] }),
  c('exp', 'townsfolk', 'poppygrower', 'Poppy Grower', 'Minions and the Demon do not learn each other. When you die, they learn each other that night.', { reminders: ['Evil wakes'] }),
  c('exp', 'townsfolk', 'preacher', 'Preacher', 'Each night, choose a player: a Minion chosen this way learns it, and loses their ability.', { reminders: ['At a sermon'] }),
  c('exp', 'townsfolk', 'princess', 'Princess', 'On your first day, if you nominated and executed a player, the Demon does not kill that night.', { reminders: ['Safe'] }),
  c('exp', 'townsfolk', 'shugenja', 'Shugenja', 'You start knowing whether your nearest evil player is clockwise or anticlockwise from you (if equally close, either may be shown).'),
  c('exp', 'townsfolk', 'steward', 'Steward', 'You start knowing one good player.', { reminders: ['Know'] }),
  c('exp', 'townsfolk', 'villageidiot', 'Village Idiot', 'Each night, choose a player: learn their alignment. [+0 to +2 extra Village Idiots; one of the extras is drunk]', { setup: '+0 to +2 Village Idiots (one extra is drunk)', reminders: ['Drunk'] }),
  c('exp', 'outsider', 'damsel', 'Damsel', 'All Minions know a Damsel is in play. If a Minion publicly guesses who you are (once), your team loses.', { reminders: ['Guess used'] }),
  c('exp', 'outsider', 'golem', 'Golem', 'You may only nominate once per game. When you nominate, if the nominee is not the Demon, they die.', { reminders: ['Can not nominate'] }),
  c('exp', 'outsider', 'hatter', 'Hatter', 'If you die, the Minions and Demon may choose new Minion and Demon characters to become that night.', { reminders: ['Tea party tonight'] }),
  c('exp', 'outsider', 'heretic', 'Heretic', 'Whoever wins, loses, and whoever loses, wins, even if you are dead.'),
  c('exp', 'outsider', 'hermit', 'Hermit', 'You have every Outsider ability. [-0 or -1 Outsider]', { setup: '-0 or -1 Outsider' }),
  c('exp', 'outsider', 'ogre', 'Ogre', 'On your first night, choose another player: you secretly become their alignment, even if drunk or poisoned.', { reminders: ['Friend'] }),
  c('exp', 'outsider', 'plaguedoctor', 'Plague Doctor', 'When you die, the Storyteller gains a Minion ability.', { reminders: ['Storyteller ability'] }),
  c('exp', 'outsider', 'politician', 'Politician', 'If you were the player most responsible for your team losing, you change alignment and win, even if dead.'),
  c('exp', 'outsider', 'puzzlemaster', 'Puzzlemaster', 'One player is drunk, even if you die. If you guess who (once), you learn the Demon, but a wrong guess gives false information.', { reminders: ['Drunk', 'Guess used'] }),
  c('exp', 'outsider', 'snitch', 'Snitch', 'Each Minion gets three not-in-play characters as bluffs.'),
  c('exp', 'outsider', 'zealot', 'Zealot', 'While five or more players are alive, you must vote whenever a vote is held.'),
  c('exp', 'minion', 'boffin', 'Boffin', 'The Demon (even if drunk or poisoned) has the ability of a good character not in play. You both know which.'),
  c('exp', 'minion', 'boomdandy', 'Boomdandy', 'If you are executed, all but three players die. After a 10-second countdown, the player most others point at dies.'),
  c('exp', 'minion', 'fearmonger', 'Fearmonger', 'Each night, choose a player: if you nominate and execute them, their team loses. Everyone learns when you choose a new player.', { reminders: ['Fear'] }),
  c('exp', 'minion', 'goblin', 'Goblin', 'If you publicly claim to be the Goblin when nominated and are executed that day, evil wins.', { reminders: ['Claimed'] }),
  c('exp', 'minion', 'harpy', 'Harpy', 'Each night, choose two players: tomorrow the first must be "mad" that the second is evil, or one or both of them might die.', { reminders: ['Mad', '2nd'] }),
  c('exp', 'minion', 'marionette', 'Marionette', 'You think you are a good character, but you are not. The Demon knows who you are. [You neighbour the Demon]', { setup: 'Sits next to the Demon; told a good character' }),
  c('exp', 'minion', 'mezepheles', 'Mezepheles', 'You start knowing a secret word. The first good player to say it becomes evil that night.', { reminders: ['Turns evil', 'No ability'] }),
  c('exp', 'minion', 'organgrinder', 'Organ Grinder', 'Votes are cast with eyes closed and the tally is secret. Each night, you may choose to be drunk until dusk.', { reminders: ['About to die', 'Drunk'] }),
  c('exp', 'minion', 'psychopath', 'Psychopath', 'Each day, before nominations, you may publicly choose a player: they die. If executed, you only die if you lose at rock-paper-scissors.'),
  c('exp', 'minion', 'summoner', 'Summoner', 'You get three bluffs. On the 3rd night, choose a player: they become an evil Demon of your choice. [No Demon at the start]', { setup: 'No Demon in play at the start' }),
  c('exp', 'minion', 'vizier', 'Vizier', 'Everyone knows who you are. You cannot die by day. If good players voted, you may choose to execute immediately.'),
  c('exp', 'minion', 'widow', 'Widow', 'On your first night, look at the Grimoire and choose a player: they are poisoned. One good player learns a Widow is in play.', { reminders: ['Poisoned', 'Knows'] }),
  c('exp', 'minion', 'wizard', 'Wizard', 'Once per game, make a wish to the Storyteller. If granted, it might have a price and leave a clue as to its nature.'),
  c('exp', 'minion', 'wraith', 'Wraith', 'You may choose to open your eyes at night. You wake when other evil players do.'),
  c('exp', 'minion', 'xaan', 'Xaan', 'On night X, all Townsfolk are poisoned until dusk. [X Outsiders]', { setup: 'X Outsiders in play', reminders: ['Night 1', 'Night 2', 'Night 3', 'X'] }),
  c('exp', 'demon', 'alhadikhia', 'Al-Hadikhia', 'Each night except the first, you may choose three players (everyone learns who): each secretly decides to live or die, but if all three live, all three die.', { reminders: ['1', '2', '3'] }),
  c('exp', 'demon', 'kazali', 'Kazali', 'Each night except the first, choose a player: they die. [You choose which players are which Minions. -? to +? Outsiders]', { setup: 'The Kazali chooses the Minions; Outsider count may change', reminders: ['Dead'] }),
  c('exp', 'demon', 'legion', 'Legion', 'Each night except the first, a player might die. Executions fail if only evil players voted. You register as a Minion too. [Most players are Legion]', { setup: 'Most players are Legion', reminders: ['Dead', 'About to die'] }),
  c('exp', 'demon', 'leviathan', 'Leviathan', 'If more than one good player is executed, evil wins. All players know you are in play. After day 5, evil wins.', { reminders: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Good player executed'] }),
  c('exp', 'demon', 'lilmonsta', "Lil' Monsta", "Each night, Minions choose who babysits Lil' Monsta and \"is the Demon\". Each night except the first, a player might die. [+1 Minion]", { setup: '+1 Minion; no player holds the Demon token', reminders: ['Is the Demon', 'Dead'] }),
  c('exp', 'demon', 'lleech', 'Lleech', 'Each night except the first, choose a player: they die. You start by choosing an alive player: they are poisoned, and you die only if they die.', { reminders: ['Dead', 'Poisoned'] }),
  c('exp', 'demon', 'lordoftyphon', 'Lord of Typhon', 'Each night except the first, choose a player: they die. [Evil characters sit in a line, with you in the middle. +1 Minion. -? to +? Outsiders]', { setup: '+1 Minion; evil sit in a line with the Demon in the middle', reminders: ['Dead'] }),
  c('exp', 'demon', 'ojo', 'Ojo', 'Each night except the first, choose a character: they die. If they are not in play, the Storyteller chooses who dies.', { reminders: ['Dead'] }),
  c('exp', 'demon', 'riot', 'Riot', 'On day 3, Minions become Riot, and nominees die but must nominate a living player immediately.'),
  c('exp', 'demon', 'yaggababble', 'Yaggababble', 'You start knowing a secret phrase. For each time you said it publicly today, a player might die.', { reminders: ['Dead'] }),
  c('exp', 'traveller', 'cacklejack', 'Cacklejack', 'Each day, choose a player: a different player changes character tonight.'),
  c('exp', 'traveller', 'gangster', 'Gangster', 'Once per day, you may choose to kill an alive neighbour, if your other alive neighbour agrees.'),
  c('exp', 'traveller', 'gnome', 'Gnome', 'All players start knowing a player of your alignment. You may choose to kill anyone who nominates them.'),

  // ---------------- Loric (public, Storyteller-side rules that change the whole game; like Fabled) ----------------
  c('fabled', 'loric', 'bigwig', 'Big Wig', 'Each nominee chooses a player (alive or dead): until voting, only that player may speak for them, and might die if they do not argue that the nominee is good.'),
  c('fabled', 'loric', 'bootlegger', 'Bootlegger', 'This script has homebrew characters or rules.', { setup: 'Custom rules are listed' }),
  c('fabled', 'loric', 'gardener', 'Gardener', 'The Storyteller assigns one or more players\' characters.', { setup: 'The Storyteller assigns characters' }),
  c('fabled', 'loric', 'godofug', 'God of Ug', 'The player wearing the "Ug hat" may only use one-syllable words, and their vote counts twice. If they slip, the hat passes on.', { setup: 'The hat is given at the start (it may be refused)' }),
  c('fabled', 'loric', 'hindu', 'Hindu', 'The first four players to die come back as Travellers of their original alignment, chosen by the Storyteller.'),
  c('fabled', 'loric', 'knaves', 'Knaves', 'There are two Storytellers: one always gives true character information, the other always false. Players choose whom to ask. Once per game, at dusk, they may swap roles.', { setup: 'Two Storytellers (not supported by this table: run it with one Storyteller playing both voices)' }),
  c('fabled', 'loric', 'pope', 'Pope', 'Some good characters appear in more than one copy; the Demon may get duplicates as bluffs.', { setup: 'Duplicate tokens' }),
  c('fabled', 'loric', 'stormcatcher', 'Storm Catcher', 'Name a good character. If it is in play, it can only die by execution, but evil players learn who has it.', { setup: 'A character is named' }),
  c('fabled', 'loric', 'tor', 'Tor', 'Characters and alignments are hidden from everyone until each player dies. Minions and the Demon do not know each other.', { setup: 'Storyteller deals the tokens (players keep their card hidden: use "Shown as: none" in the Grimoire)' }),
  c('fabled', 'loric', 'ventriloquist', 'Ventriloquist', 'A nominee who presents as a character they have not claimed before can survive execution that day.'),
  c('fabled', 'loric', 'zenomancer', 'Zenomancer', 'The Storyteller secretly gives players goals. Achieving one earns one true piece of information, even if drunk or poisoned.', { setup: 'Goals are assigned' }),
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
  'dusk', 'wraith', 'lordoftyphon', 'kazali', 'boffin', 'philosopher', 'alchemist', 'poppygrower', 'yaggababble', 'magician',
  'minioninfo', 'snitch', 'lunatic', 'summoner', 'demoninfo', 'king', 'sailor', 'marionette', 'engineer', 'preacher', 'lilmonsta', 'lleech',
  'xaan', 'poisoner', 'widow', 'courtier', 'snakecharmer', 'godfather', 'organgrinder', 'devilsadvocate', 'eviltwin', 'witch', 'cerenovus',
  'fearmonger', 'harpy', 'mezepheles', 'pukka', 'pixie', 'huntsman', 'damsel', 'amnesiac', 'washerwoman', 'librarian', 'investigator',
  'chef', 'empath', 'fortuneteller', 'butler', 'grandmother', 'clockmaker', 'dreamer', 'seamstress', 'steward', 'knight', 'noble', 'balloonist',
  'shugenja', 'villageidiot', 'bountyhunter', 'nightwatchman', 'cultleader', 'spy', 'ogre', 'highpriestess', 'general', 'chambermaid',
  'mathematician', 'bureaucrat', 'thief', 'barista', 'apprentice', 'dawn',
];
export const OTHER_NIGHT_ORDER = [
  'dusk', 'wraith', 'philosopher', 'poppygrower', 'barista', 'bonecollector', 'harlot', 'sailor', 'engineer', 'preacher', 'xaan',
  'poisoner', 'courtier', 'innkeeper', 'snakecharmer', 'witch', 'cerenovus', 'pithag', 'fearmonger', 'harpy', 'mezepheles',
  'scarletwoman', 'summoner', 'lunatic', 'exorcist', 'lycanthrope', 'legion', 'imp', 'zombuul', 'pukka', 'shabaloth', 'po', 'fanggu',
  'nodashii', 'vortox', 'lordoftyphon', 'vigormortis', 'ojo', 'alhadikhia', 'lleech', 'lilmonsta', 'yaggababble', 'kazali', 'assassin',
  'godfather', 'gossip', 'acrobat', 'hatter', 'barber', 'sweetheart', 'sage', 'banshee', 'professor', 'choirboy', 'huntsman', 'damsel',
  'amnesiac', 'farmer', 'tinker', 'moonchild', 'grandmother', 'ravenkeeper', 'empath', 'fortuneteller', 'undertaker', 'dreamer',
  'flowergirl', 'towncrier', 'oracle', 'seamstress', 'juggler', 'balloonist', 'villageidiot', 'king', 'bountyhunter', 'nightwatchman',
  'cultleader', 'butler', 'spy', 'highpriestess', 'general', 'chambermaid', 'mathematician', 'monk', 'gambler', 'bureaucrat', 'thief', 'dawn',
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
  // Experimental
  alsaahir: { public: true, target: false, frequency: 'daily', resolution: 'note', prompt: 'Publicly name which players you think are the Minions and which is the Demon, then press Done.' },
  psychopath: { public: true, target: true, frequency: 'daily', resolution: 'kill', prompt: 'Before nominations, publicly choose a player.' },
  goblin: { public: true, target: false, frequency: 'daily', resolution: 'note', prompt: 'You are nominated: publicly claim to be the Goblin, then press Done.' },
  gangster: { public: true, target: true, frequency: 'daily', resolution: 'kill', prompt: 'Choose a living neighbour (your other living neighbour must agree out loud).' },
  fisherman: { public: false, target: false, frequency: 'once', resolution: 'note', prompt: 'You will be taken to the Storyteller for advice.' },
  amnesiac: { public: false, target: false, frequency: 'daily', resolution: 'note', prompt: 'You will be taken to the Storyteller to guess your ability.' },
  wizard: { public: false, target: false, frequency: 'once', resolution: 'note', prompt: 'You will be taken to the Storyteller to make your wish.' },
};
// good players' public abilities are the ones worth bluffing (and Travellers are public anyway)
export const CLAIMABLE_ABILITIES = Object.entries(DAY_ABILITIES).filter(([id, a]) => a.public && ['townsfolk', 'outsider'].includes(CHARACTER_BY_ID[id]?.type)).map(([id]) => id);

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
