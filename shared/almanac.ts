// Player-facing tips for the Almanac. Original wording (this is a fan project): short advice on
// how to play each character and how characters affect each other. Characters without their own
// entry fall back to advice for their type.
import type { CharacterType } from './characters';

export interface AlmanacEntry { tips: string[]; with?: Record<string, string> }

export const TYPE_TIPS: Record<CharacterType, string[]> = {
  townsfolk: [
    'You are good. Share what you learn, but think about when: information is strongest when the evil team cannot react to it.',
    'Your information might be wrong if you are drunk or poisoned. Compare it with what others say.',
  ],
  outsider: [
    'You are good, but your ability can hurt your own team. Tell the town what you are early, so they can plan around you.',
    'Evil players love to bluff as Outsiders, because Outsiders rarely have information to prove.',
  ],
  minion: [
    'You are evil. You know your Demon (in games of 7 or more), and your job is to keep them alive.',
    'Pick a believable good character to bluff and stick to it. Defend your Demon without looking like you are.',
  ],
  demon: [
    'You are evil and you kill at night. You know your Minions and three characters not in play: good bluffs for you.',
    'Kill the players whose information is closing in on you, but don\'t make your kills too obvious.',
  ],
  traveller: [
    'Travellers join part-way through. Your character is public, but your alignment is decided by the Storyteller.',
    'Travellers can be exiled at any time by a vote of half the players, alive or dead.',
  ],
  fabled: [
    'Fabled are not players: the Storyteller adds them to adjust the game. Everyone knows which Fabled are in play.',
  ],
};

export const ALMANAC: Record<string, AlmanacEntry> = {
  washerwoman: {
    tips: ['You learn one of two players is a specific Townsfolk. Ask both to tell you their character in private.', 'If one of them confirms, you have probably found two good players.'],
    with: { spy: 'The Spy can show up as a Townsfolk, so your "Townsfolk" might be the Spy.', drunk: 'If you are the Drunk you may have been shown anything.' },
  },
  librarian: {
    tips: ['You learn one of two players is a specific Outsider, or that there are no Outsiders.', '"No Outsiders" is useful too: anyone claiming an Outsider may be lying.'],
    with: { baron: 'A Baron adds two Outsiders, so lots of Outsiders hints at a Baron.', drunk: 'You may be shown the Drunk, who thinks they are a Townsfolk.' },
  },
  investigator: {
    tips: ['You learn one of two players is a specific Minion. Keep it quiet for a while: the Demon may kill you once you share it.', 'Watch who those two players defend.'],
    with: { recluse: 'The Recluse can show up as a Minion, so one of your two might be an innocent Recluse.' },
  },
  chef: {
    tips: ['You learn how many pairs of evil players sit next to each other. A 0 means no two evil players are neighbours.', 'Combine your number with the seat order: it rules out whole groups of players.'],
    with: { recluse: 'The Recluse may count as evil for your number.', spy: 'The Spy may count as good.' },
  },
  empath: {
    tips: ['Each night you learn how many of your two living neighbours are evil. When a neighbour dies, your neighbours change.', 'A 0 is great news: both neighbours are probably good. Your neighbours are prime suspects if you get a 1 or 2.'],
    with: { poisoner: 'If you are poisoned your number may be wrong, so look for changes from night to night.', recluse: 'A Recluse neighbour may count as evil.' },
  },
  fortuneteller: {
    tips: ['Each night pick two players: you learn whether either is a Demon. One good player (the red herring) also shows as a Demon for you.', 'Check yourself with someone to find out if you are the red herring.'],
    with: { recluse: 'The Recluse can register as a Demon.' },
  },
  undertaker: {
    tips: ['Each night you learn the character of the player executed that day. This confirms or breaks their claim.', 'Keep this secret for a day or two, so the Demon doesn\'t kill you.'],
    with: { spy: 'An executed Spy may show up as a good character.', drunk: 'An executed Drunk shows up as the Drunk.' },
  },
  monk: {
    tips: ['Each night protect another player from the Demon. Protect the players with the best information.', 'If nobody dies, you may have stopped a kill: tell the town who you protected.'],
    with: { imp: 'The Imp cannot kill the player you protect. If the Imp picks them, nobody dies.', poisoner: 'If you are poisoned your protection does nothing.' },
  },
  ravenkeeper: {
    tips: ['If the Demon kills you at night, you wake and learn one player\'s character.', 'Pick someone whose claim nobody can confirm.'],
    with: { poisoner: 'A poisoned Ravenkeeper may be shown a false character.' },
  },
  virgin: {
    tips: ['The first time you are nominated, if the nominator is a Townsfolk, they are executed immediately.', 'Claim openly and ask a trusted Townsfolk to nominate you: if they die, both of you are proven good.'],
    with: { spy: 'The Spy may register as a Townsfolk and die from your ability.', drunk: 'A Drunk nominator is not a Townsfolk, so nothing happens.' },
  },
  slayer: {
    tips: ['Once per game, by day, publicly pick a player: if they are the Demon, they die.', 'Wait until you have a strong suspect, or use it early to scare the Demon.'],
    with: { recluse: 'The Recluse can register as the Demon and die from your shot.', poisoner: 'A poisoned Slayer\'s shot never works.' },
  },
  soldier: {
    tips: ['The Demon cannot kill you. Many players claim Soldier, so be ready to be doubted.', 'If you survive many nights, the town can trust you more.'],
    with: { imp: 'The Imp cannot kill you at night.', poisoner: 'A poisoned Soldier can be killed.' },
  },
  mayor: {
    tips: ['If three players remain alive and no one is executed that day, good wins.', 'If the Demon attacks you, someone else might die instead.'],
    with: { imp: 'When the Imp attacks the Mayor, the Storyteller may let another player die instead.' },
  },
  butler: {
    tips: ['Each night choose a master. The next day you may only vote if your master votes too.', 'Pick someone you trust as your master.'],
  },
  drunk: {
    tips: ['You don\'t know you are the Drunk: you think you are a Townsfolk, but your ability does nothing and your information may be wrong.', 'Anyone\'s information could secretly be Drunk information.'],
  },
  recluse: {
    tips: ['You may show up as evil, even as a Minion or Demon, to other players\' abilities.', 'Tell the town you are the Recluse so they can explain strange results.'],
    with: { slayer: 'You might die to a Slayer shot.', investigator: 'You might be shown as a Minion.' },
  },
  saint: {
    tips: ['If you are executed, good loses. Make sure everyone knows not to execute you.', 'Evil players may bluff Saint to avoid execution.'],
  },
  poisoner: {
    tips: ['Each night poison a player for that night and the next day: their ability fails and their information may be wrong.', 'Poison the players whose information would find your Demon.'],
    with: { monk: 'A poisoned Monk protects nobody.', soldier: 'A poisoned Soldier can be killed.', slayer: 'A poisoned Slayer\'s shot fails.' },
  },
  spy: {
    tips: ['Each night you see the Grimoire: you know every character. Use it to give your Demon perfect information.', 'You may show up as good to other abilities, so you can bluff convincingly.'],
    with: { virgin: 'Nominating the Virgin may get you executed if you register as a Townsfolk.' },
  },
  scarletwoman: {
    tips: ['If the Demon dies while 5 or more players are alive, you become the Demon.', 'Stay unsuspicious: you are the evil team\'s backup plan.'],
    with: { imp: 'If the Imp is executed with 5+ players alive, you become the Imp.' },
  },
  baron: {
    tips: ['You add two Outsiders to the game. Many Outsider claims point at a Baron.', 'Bluff an Outsider yourself: there are more of them in a Baron game.'],
  },
  imp: {
    tips: ['Each night (not the first) kill a player. If you kill yourself, a Minion becomes the new Imp.', 'If the town is about to execute you, killing yourself at night passes the Demon role on.'],
    with: { monk: 'You cannot kill the Monk\'s protected player.', soldier: 'You cannot kill the Soldier.', mayor: 'Attacking the Mayor may kill someone else.', scarletwoman: 'If you are executed, the Scarlet Woman may take over.' },
  },
};
