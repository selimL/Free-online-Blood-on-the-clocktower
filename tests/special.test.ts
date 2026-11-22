// Experimental mechanics: voting powers, secret votes, group actions, secret words, win reminders, Tor.
import { describe, it, expect } from 'vitest';
import { Game, type Player } from '../server/src/game';
import { playerView, storytellerView } from '../server/src/views';

function game(cast: string[]) {
  const g = new Game({ name: 'X', visibility: 'public', stName: 'ST' });
  g.emit = () => {};
  cast.forEach((_, i) => g.join(`P${i}`, undefined));
  g.updateSettings({ characters: cast.filter(c => !['traveller'].includes(c)) });
  g.deal();
  cast.forEach((c, i) => g.setCharacter(g.players[i].id, c));
  g.reveal(); g.beginNight(); g.beginDay(); g.tick(Date.now() + 10_000);
  g.setStage('nominations');
  return g;
}
const byChar = (g: Game, c: string) => g.players.find(p => p.characterId === c)!;
function vote(g: Game, nominator: Player, nominee: Player, yes: Player[]) {
  g.nominate(nominator.id, nominee.id); g.startDefense(); g.startVote();
  for (const p of yes) g.setHand(p, true);
  let t = Date.now();
  while (g.nomination && !g.nomination.done) { t += 5000; g.tick(t); }
  return g.nomination!;
}

describe('voting powers', () => {
  it('Banshee (killed by the Demon) votes twice, even dead, and may nominate twice', () => {
    const g = game(['banshee', 'empath', 'chef', 'monk', 'soldier', 'poisoner', 'imp']);
    const b = byChar(g, 'banshee');
    b.alive = false; b.reminders = ['Has ability'];
    const n = vote(g, byChar(g, 'chef'), byChar(g, 'monk'), [b]);
    expect(g.tally(n)).toBe(2);
    expect(b.ghostVoteUsed).toBe(false);
    g.nominate(b.id, byChar(g, 'soldier').id);
    g.startDefense(); g.startVote(); let t = Date.now(); while (!g.nomination!.done) { t += 5000; g.tick(t); }
    expect(() => g.nominate(b.id, byChar(g, 'empath').id)).not.toThrow();
  });
  it('God of Ug: the hat wearer\'s vote counts twice', () => {
    const g = game(['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'poisoner', 'imp']);
    g.updateSettings({ fabled: ['godofug'] });
    const w = byChar(g, 'washerwoman');
    g.setUgHat(w.id);
    expect(playerView(g, byChar(g, 'chef')).ugHat).toBe(w.id);
    const n = vote(g, byChar(g, 'chef'), byChar(g, 'monk'), [w]);
    expect(g.tally(n)).toBe(2);
  });
  it('Zealot always votes while 5+ are alive', () => {
    const g = game(['zealot', 'empath', 'chef', 'monk', 'soldier', 'poisoner', 'imp']);
    const n = vote(g, byChar(g, 'chef'), byChar(g, 'monk'), []);
    expect(n.locked[byChar(g, 'zealot').id]).toBe(true);
  });
  it('Organ Grinder: hands and tally are secret from players, not the Storyteller', () => {
    const g = game(['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'organgrinder', 'imp']);
    const [ww, emp] = [byChar(g, 'washerwoman'), byChar(g, 'empath')];
    g.nominate(byChar(g, 'chef').id, byChar(g, 'monk').id);
    g.setHand(ww, true); g.setHand(emp, true);
    const pv = playerView(g, ww).nomination!;
    expect(pv.secret).toBe(true);
    expect(Object.keys(pv.hands)).toEqual([ww.id]);
    expect(storytellerView(g).nomination!.hands[emp.id]).toBe(true);
    g.startDefense(); g.startVote(); let t = Date.now(); while (!g.nomination!.done) { t += 5000; g.tick(t); }
    expect(playerView(g, ww).nomination!.result).toMatch(/secret/);
    expect(playerView(g, ww).aboutToDie).toBeNull();
    expect(JSON.stringify(playerView(g, emp).announcements)).not.toMatch(/Voted yes/);
  });
});

describe('group actions', () => {
  it('rock-paper-scissors is secret until both chose, then announced', () => {
    const g = game(['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'psychopath', 'imp']);
    const [a, b, c] = [byChar(g, 'psychopath'), byChar(g, 'chef'), byChar(g, 'monk')];
    const pr = g.startPrompt('rps', [a.id, b.id]);
    expect(playerView(g, c).prompts).toEqual([]);
    g.answerPrompt(a.id, pr.id, 'Rock');
    expect(playerView(g, b).prompts[0].answers).toEqual({});
    g.answerPrompt(b.id, pr.id, 'Scissors');
    expect(pr.result).toMatch(/P\d wins/);
    expect(pr.result).toContain(a.name + ' wins');
  });
  it('Al-Hadikhia: if all three choose to live, all three die', () => {
    const g = game(['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'poisoner', 'alhadikhia']);
    const ids = g.players.slice(0, 3).map(p => p.id);
    const pr = g.startPrompt('livedie', ids);
    for (const id of ids) g.answerPrompt(id, pr.id, 'Live');
    g.applyPrompt(pr.id);
    expect(g.players.slice(0, 3).every(p => !p.alive)).toBe(true);
  });
  it('Boomdandy: all but three die, then the most pointed-at survivor dies after 10 s', () => {
    const g = game(['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'boomdandy', 'imp']);
    const keep = g.players.slice(0, 3);
    g.boomdandy(keep.map(p => p.id));
    expect(g.players.filter(p => p.alive)).toHaveLength(3);
    const pr = g.prompts.at(-1)!;
    expect(playerView(g, g.players[5]).prompts).toHaveLength(1); // public
    g.answerPrompt(keep[0].id, pr.id, keep[2].name); g.answerPrompt(keep[1].id, pr.id, keep[2].name);
    g.tick(Date.now() + 11_000);
    expect(keep[2].alive).toBe(false);
    expect(pr.result).toMatch(/dies/);
  });
});

describe('secret words, win reminders and Tor', () => {
  it('Mezepheles and Yaggababble helpers', () => {
    const g = game(['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'mezepheles', 'yaggababble']);
    g.setSecretWord('mezepheles', 'pumpkin');
    const stSelf = storytellerView(g).self;
    expect(stSelf.isStoryteller ? stSelf.secretWords.mezepheles : null).toBe('pumpkin');
    expect(JSON.stringify(playerView(g, byChar(g, 'chef')))).not.toContain('pumpkin');
    g.mezephelesSaid(byChar(g, 'chef').id);
    expect(byChar(g, 'chef').reminders).toContain('Turns evil');
    g.yaggababbleSaid(1); g.yaggababbleSaid(1);
    expect(g.yaggababbleCount).toBe(2);
  });
  it('lists special win rules and flags a Goblin execution', () => {
    const g = game(['washerwoman', 'empath', 'chef', 'monk', 'heretic', 'goblin', 'imp']);
    const sv = storytellerView(g).self;
    expect(sv.isStoryteller && sv.winRules.join(' ')).toMatch(/Heretic/);
    const gob = byChar(g, 'goblin');
    gob.reminders = ['Claimed'];
    g.execute(gob.id);
    expect(g.winHint()).toMatch(/Goblin/);
  });
  it('Tor hides your character and team until you die', () => {
    const g = game(['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'poisoner', 'imp']);
    g.updateSettings({ fabled: ['tor'] });
    const imp = byChar(g, 'imp');
    const v = playerView(g, imp);
    expect(!v.self.isStoryteller && v.self.characterId).toBeNull();
    expect(!v.self.isStoryteller && v.self.evilTeam).toBeNull();
    expect(v.torActive).toBe(true);
    g.kill(imp.id);
    const dead = playerView(g, imp);
    expect(!dead.self.isStoryteller && dead.self.characterId).toBe('imp');
  });
});
