// Jinxes: special rulings when two particular characters are in the same game.
// This starter list is paraphrased from memory and is NOT complete or authoritative: check the
// official wiki for the current jinx list. Storytellers can add their own in Setup.
export interface Jinx { a: string; b: string; text: string; custom?: boolean }

export const JINXES: Jinx[] = [
  { a: 'chambermaid', b: 'mathematician', text: 'The Chambermaid learns whether the Mathematician wakes tonight, even though the Chambermaid wakes first.' },
  { a: 'butler', b: 'cannibal', text: 'If the Cannibal gains the Butler ability, the Cannibal learns this.' },
  { a: 'cannibal', b: 'juggler', text: 'If the Juggler guesses on their first day and dies by execution, the living Cannibal learns that night how many guesses were correct.' },
  { a: 'lunatic', b: 'mathematician', text: 'The Mathematician might learn if the Lunatic attacks the wrong player(s).' },
  { a: 'pithag', b: 'heretic', text: 'A Pit-Hag cannot create a Heretic.' },
  { a: 'pithag', b: 'damsel', text: 'If a Pit-Hag creates a Damsel, the Storyteller chooses which player it is.' },
  { a: 'spy', b: 'damsel', text: 'Only one of these two characters can be in play.' },
  { a: 'widow', b: 'damsel', text: 'Only one of these two characters can be in play.' },
  { a: 'poppygrower', b: 'spy', text: 'While the Poppy Grower is in play, the Spy does not see the Grimoire until the Poppy Grower dies.' },
  { a: 'poppygrower', b: 'widow', text: 'While the Poppy Grower is in play, the Widow does not see the Grimoire until the Poppy Grower dies.' },
  { a: 'magician', b: 'spy', text: 'When the Spy sees the Grimoire, the Demon and Magician tokens are removed from it.' },
  { a: 'magician', b: 'widow', text: 'When the Widow sees the Grimoire, the Demon and Magician tokens are removed from it.' },
  { a: 'magician', b: 'lilmonsta', text: 'Only one of these two characters can be in play.' },
  { a: 'lilmonsta', b: 'poppygrower', text: "While the Poppy Grower is in play, Minions don't wake together: they wake one by one until one of them takes Lil' Monsta." },
  { a: 'lilmonsta', b: 'scarletwoman', text: "If 5 or more players are alive and the player babysitting Lil' Monsta dies, the Scarlet Woman takes Lil' Monsta that night." },
  { a: 'leviathan', b: 'mayor', text: 'If the Leviathan and the Mayor are both alive on day 5 and there is no execution, good wins.' },
  { a: 'leviathan', b: 'soldier', text: 'If the Leviathan nominates and executes the Soldier, the Soldier does not die.' },
  { a: 'legion', b: 'engineer', text: 'Legion and the Engineer cannot both be in play at the start. If the Engineer creates Legion, most players (including all evil players) become evil Legion.' },
  { a: 'legion', b: 'preacher', text: 'If the Preacher chooses Legion, Legion keeps its ability, but the Preacher might learn they are Legion.' },
  { a: 'vizier', b: 'zealot', text: 'If the Vizier is in play, the Zealot has no ability.' },
  { a: 'kazali', b: 'bountyhunter', text: 'An evil Townsfolk is only created if the Bounty Hunter is still in play after the Kazali acts.' },
  { a: 'cultleader', b: 'boffin', text: 'If the Boffin gives the Demon the Cult Leader ability, the Demon cannot turn good through it.' },
  { a: 'yaggababble', b: 'exorcist', text: 'If the Exorcist chooses the Yaggababble, the Yaggababble ability does not kill tonight.' },
  { a: 'alhadikhia', b: 'scarletwoman', text: 'If there are two living Al-Hadikhias, the Scarlet Woman Al-Hadikhia becomes the Scarlet Woman again.' },
];

/** Jinxes that apply to a set of character ids (built-in plus the Storyteller's own). */
export function jinxesFor(ids: Iterable<string>, custom: Jinx[] = []): Jinx[] {
  const set = new Set(ids);
  return [...JINXES, ...custom.map(j => ({ ...j, custom: true }))].filter(j => set.has(j.a) && set.has(j.b));
}
