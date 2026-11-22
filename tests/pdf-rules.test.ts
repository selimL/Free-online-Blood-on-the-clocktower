// Rules changed to match the "BotC Rules & Characters" reference PDF.
import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game';
import { playerView, storytellerView } from '../server/src/views';
import { parseScript } from '../shared/characters';
import type { StorytellerSelf } from '../shared/types';

function setup(bag: string[], n = bag.length) {
  const g = new Game({ name: 'T', visibility: 'public', stName: 'ST' });
  g.emit = () => {};
  for (let i = 0; i < n; i++) g.join(`P${i}`, undefined);
  g.updateSettings({ characters: bag });
  g.deal(); g.reveal();
  return g;
}
const byChar = (g: Game, id: string) => g.players.find(p => p.characterId === id)!;
const st = (g: Game) => storytellerView(g).self as StorytellerSelf;
const runVote = (g: Game) => { let t = Date.now(); while (g.nomination && !g.nomination.done) { t += 5000; g.tick(t); } };
const day = (g: Game) => { g.beginNight(); g.beginDay(); g.tick(Date.now() + 10_000); };

const TB = ['washerwoman', 'virgin', 'slayer', 'butler', 'chef', 'poisoner', 'imp'];

describe('Virgin is checked when she is nominated', () => {
  it('a Townsfolk nominator is executed immediately and nominations close', () => {
    const g = setup(TB);
    day(g); g.setStage('nominations');
    const virgin = byChar(g, 'virgin'), chef = byChar(g, 'chef');
    g.nominate(chef.id, virgin.id);
    expect(chef.alive).toBe(false);
    expect(g.executedToday).toBe(true);
    expect(g.stage).toBe('closed');
    expect(virgin.reminders).toContain('No ability');
  });
  it('a non-Townsfolk nominator just starts a normal nomination; the ability is spent', () => {
    const g = setup(TB);
    day(g); g.setStage('nominations');
    const virgin = byChar(g, 'virgin'), imp = byChar(g, 'imp');
    g.nominate(imp.id, virgin.id);
    expect(imp.alive).toBe(true);
    expect(g.stage).toBe('accusation');
    expect(virgin.reminders).toContain('No ability');
  });
  it('a poisoned Virgin does nothing', () => {
    const g = setup(TB);
    day(g); g.setStage('nominations');
    const virgin = byChar(g, 'virgin'), chef = byChar(g, 'chef');
    g.setReminders(virgin.id, ['Poisoned']);
    g.nominate(chef.id, virgin.id);
    expect(chef.alive).toBe(true);
  });
});

describe('Butler votes are checked against the master', () => {
  it('the Butler\'s yes does not count unless the master also votes yes', () => {
    const g = setup(TB);
    g.beginNight();
    const butler = byChar(g, 'butler'), master = byChar(g, 'chef');
    g.toggleWake(butler.id); g.nightChoose(butler, [master.id]);
    g.beginDay(); g.tick(Date.now() + 10_000); g.setStage('nominations');
    // keep the Virgin out of these nominations: her ability would (correctly) end the nomination early
    const others = g.players.filter(p => p !== butler && p !== master && p.characterId !== 'virgin');
    const [a, b] = others;
    g.nominate(a.id, b.id); g.startDefense(); g.startVote();
    g.setHand(butler, true);
    runVote(g);
    expect(g.voteHistory.at(-1)!.yes).not.toContain(butler.id);

    const [c, d] = others.filter(p => ![a, b].includes(p));
    g.nominate(c.id, d.id); g.startDefense(); g.startVote();
    g.setHand(butler, true); g.setHand(master, true);
    runVote(g);
    expect(g.voteHistory.at(-1)!.yes).toContain(butler.id);
  });
});

describe('exile', () => {
  it('any number of exiles may happen per day, and dead players can call them', () => {
    const g = setup(TB);
    g.beginNight(); g.kill(g.players[0].id); g.beginDay(); g.tick(Date.now() + 10_000);
    const t = g.join('Trav', undefined);
    g.pickTraveller(t, 'scapegoat');
    g.setStage('nominations');
    g.nominate(g.players[0].id, t.id, true); // dead player calls for exile
    g.startDefense(); g.startVote(); runVote(g);
    g.nominate(g.players[1].id, t.id, true); // again, same day
    expect(g.nomination?.exile).toBe(true);
  });
});

describe('Travellers', () => {
  it('pick their own character; an evil Traveller is known only to themselves and the Demon', () => {
    const g = setup(TB);
    day(g);
    const t = g.join('Trav', undefined);
    expect(() => g.pickTraveller(t, 'imp')).toThrow();
    g.pickTraveller(t, 'gunslinger');
    expect(t.characterId).toBe('gunslinger');
    g.setAlignment(t.id, 'evil');
    const imp = byChar(g, 'imp'), poisoner = byChar(g, 'poisoner');
    expect(playerView(g, imp).players.find(p => p.id === t.id)!.evilMark).toBe(true);
    expect(playerView(g, poisoner).players.find(p => p.id === t.id)!.evilMark).toBe(false);
    expect(playerView(g, t).players.filter(p => p.evilMark)).toHaveLength(0);
  });
  it('house rule: Travellers can\'t be changed', () => {
    const g = setup(TB);
    day(g);
    const t = g.join('Trav', undefined);
    g.pickTraveller(t, 'thief');
    g.updateSettings({ houseRules: { ...g.settings.houseRules, travellersCantBeChanged: true } });
    expect(() => g.setCharacter(t.id, 'beggar')).toThrow(/Travellers/);
  });
});

describe('Lunatic', () => {
  it('the real Demon learns who the Lunatic is and what they choose', () => {
    const g = setup(['washerwoman', 'chef', 'empath', 'lunatic', 'poisoner', 'imp', 'monk']);
    const imp = byChar(g, 'imp'), lun = byChar(g, 'lunatic');
    expect(imp.notes.some(n => n.playerIds.includes(lun.id))).toBe(true);
    g.beginNight(); g.toggleWake(lun.id); g.nightChoose(lun, [g.players[0].id]);
    expect(imp.notes.at(-1)!.text).toMatch(/Lunatic/);
    expect(lun.notes).toHaveLength(0);
  });
});

describe('abilities', () => {
  it('resurrected players regain a used ability', () => {
    const g = setup(TB);
    day(g); g.setStage('private');
    const slayer = byChar(g, 'slayer');
    g.useAbility(slayer, 'real'); g.tick(Date.now() + 4000);
    g.abilityTarget(slayer, g.players[0].id); g.abilityDone(slayer); g.resolveAbility('nothing'); g.tick(Date.now() + 10_000);
    expect(g.abilityAvailable(slayer)).toBe(false);
    g.kill(slayer.id); g.revive(slayer.id);
    expect(g.abilityAvailable(slayer)).toBe(true);
  });
  it('Klutz/Moonchild can only be used (or bluffed) once dead, and never kill on the spot', () => {
    const g = setup(['washerwoman', 'chef', 'empath', 'moonchild', 'poisoner', 'imp', 'monk']);
    day(g); g.setStage('private');
    const mc = byChar(g, 'moonchild'), bluffer = byChar(g, 'chef');
    expect(() => g.useAbility(mc, 'real')).toThrow(/died/);
    expect(() => g.useAbility(bluffer, 'claim', 'klutz')).toThrow(/died/);
    g.kill(mc.id);
    g.useAbility(mc, 'real'); g.tick(Date.now() + 4000);
    const target = byChar(g, 'empath');
    g.abilityTarget(mc, target.id); g.abilityDone(mc);
    expect(st(g).pendingAbility!.resolution).toBe('note');
    expect(st(g).pendingAbility!.suggestionText).toMatch(/die tonight/);
    g.resolveAbility('kill');
    expect(target.alive).toBe(true);
  });
  it('ability declaration limit caps public uses per day', () => {
    const g = setup(TB);
    g.updateSettings({ houseRules: { ...g.settings.houseRules, abilityDeclarationLimit: 1 } });
    day(g); g.setStage('private');
    const a = byChar(g, 'chef'), b = byChar(g, 'empath' as string) ?? byChar(g, 'washerwoman');
    g.useAbility(a, 'claim', 'slayer'); g.tick(Date.now() + 4000);
    g.abilityTarget(a, g.players[0].id); g.abilityDone(a); g.resolveAbility('nothing'); g.tick(Date.now() + 10_000);
    expect(() => g.useAbility(b ?? byChar(g, 'washerwoman'), 'claim', 'slayer')).toThrow(/declarations/);
  });
});

describe('house rules from the PDF', () => {
  it('open vote record, speed round, whisper limits, grimoire reveal, beginner mode', () => {
    const g = setup(TB);
    g.updateSettings({ houseRules: { ...g.settings.houseRules, openVoteRecord: true, speedRound: true, maxWhispersPerDay: 1, roomCapOverride: 2, grimoireRevealAtEnd: true, beginnerMode: true, noOaths: true } });
    expect(g.settings.fabled).toEqual(expect.arrayContaining(['toymaker', 'angel', 'buddhist']));
    expect(g.roomCapacity).toBe(2);
    day(g);
    const v0 = playerView(g, g.players[0]);
    expect(v0.tableRules.join(' ')).toMatch(/oaths/);
    // speed round: every living player gets the spotlight, then nominations open
    g.setStage('speedround');
    expect(g.speakerId).toBe(g.players[0].id);
    for (let i = 0; i < g.players.length; i++) g.expireTimer();
    expect(g.stage).toBe('nominations');
    // whisper limit
    g.setStage('private');
    const p = g.players[0];
    p.whispersToday = 1;
    expect(g.canEnter(p, 'r0')).toMatch(/visits/);
    // vote record is public
    g.setStage('nominations');
    // (never the Virgin: a Townsfolk nominating them ends the nomination at once)
    const nominee = g.players.find((x, i) => i !== 2 && x.characterId !== 'virgin')!;
    g.nominate(g.players[2].id, nominee.id); g.startDefense(); g.startVote(); runVote(g);
    expect(playerView(g, g.players[5]).voteHistory).toHaveLength(1);
    g.endGame('good');
    const rg = playerView(g, g.players[1]).players.find(x => x.id === byChar(g, 'imp').id)!.revealedGrimoire;
    expect(rg?.alignment).toBe('evil');
  });
  it('win hints for the Storyteller (game never ends on its own)', () => {
    const g = setup(TB);
    day(g);
    expect(st(g).winHint).toBeNull();
    g.kill(byChar(g, 'imp').id);
    expect(st(g).winHint).toMatch(/good wins/);
    expect(g.phase).toBe('day');
  });
});

describe('custom scripts', () => {
  it('parses Script Tool JSON with _meta, objects and other id spellings', () => {
    const r = parseScript('[{"id":"_meta","name":"Mine"},"washerwoman",{"id":"fortune_teller"},"scarlet_woman","huntsman","my_homebrew_guy"]');
    expect(r.name).toBe('Mine');
    expect(r.ids).toEqual(['washerwoman', 'fortuneteller', 'scarletwoman', 'huntsman']); // Experimental characters are known now
    expect(r.unknown).toEqual(['my_homebrew_guy']);
  });
});
