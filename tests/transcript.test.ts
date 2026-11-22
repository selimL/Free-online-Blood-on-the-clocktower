// Word listening: only with a word character visible, consent first, only audible speech,
// sentences never stored (only detections), Storyteller only, deletable.
import { describe, it, expect } from 'vitest';
import { Game, syllables } from '../server/src/game';
import { playerView, storytellerView } from '../server/src/views';

function game(cast = ['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'mezepheles', 'imp']) {
  const g = new Game({ name: 'T', visibility: 'public', stName: 'ST' });
  g.emit = () => {};
  cast.forEach((_, i) => g.join(`P${i}`, undefined));
  g.updateSettings({ characters: cast });
  for (const p of g.players) g.setTranscriptConsent(p, true);
  g.deal();
  cast.forEach((c, i) => g.setCharacter(g.players[i].id, c));
  g.reveal(); g.beginNight(); g.beginDay(); g.tick(Date.now() + 10_000);
  return { g, by: (c: string) => g.players.find(p => p.characterId === c)! };
}

describe('consent before the game starts', () => {
  it('a word character in the setup blocks dealing until every player has said yes', () => {
    const g = new Game({ name: 'C', visibility: 'public', stName: 'ST' });
    g.emit = () => {};
    for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
    g.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'mezepheles', 'imp'] });
    expect(g.transcriptRequired()).toBe(true);
    expect(!playerView(g, g.players[0]).self.isStoryteller && playerView(g, g.players[0]).self.transcriptRequired).toBe(true); // asked in the lobby
    expect(() => g.deal()).toThrow(/Waiting for: P0, P1, P2, P3, P4, P5, P6/);
    for (const p of g.players.slice(0, 6)) g.setTranscriptConsent(p, true);
    g.setTranscriptConsent(g.players[6], false);
    expect(() => g.deal()).toThrow(/Waiting for: P6\./);
    const sv = storytellerView(g).self;
    expect(sv.isStoryteller && sv.awaitingConsent).toEqual([g.players[6].id]);
    g.setTranscriptConsent(g.players[6], true);
    expect(() => g.deal()).not.toThrow();
  });
  it('games without a word character (or with the rule off) are not affected', () => {
    const g = new Game({ name: 'C', visibility: 'public', stName: 'ST' });
    g.emit = () => {};
    for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
    g.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'poisoner', 'imp'] });
    expect(() => g.deal()).not.toThrow();
    const h = new Game({ name: 'D', visibility: 'public', stName: 'ST' });
    h.emit = () => {};
    for (let i = 0; i < 7; i++) h.join(`P${i}`, undefined);
    h.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'mezepheles', 'imp'], houseRules: { ...h.settings.houseRules, voiceTranscript: false } });
    expect(() => h.deal()).not.toThrow();
  });
});

describe('Travellers and locked answers', () => {
  function started() {
    const g = new Game({ name: 'L', visibility: 'public', stName: 'ST' });
    g.emit = () => {};
    for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
    g.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'mezepheles', 'imp'] });
    for (const p of g.players) g.setTranscriptConsent(p, true);
    g.deal(); g.reveal();
    return g;
  }
  it('a Traveller cannot join a listening game without agreeing', () => {
    const g = started();
    expect(() => g.join('Late', undefined)).toThrow(/must agree/);
    const t = g.join('Late', undefined, { listeningConsent: true });
    expect(t.traveller).toBe(true);
    expect(t.transcriptConsent).toBe(true);
  });
  it('answers are locked once the game has started', () => {
    const g = started();
    expect(g.consentLocked()).toBe(true);
    expect(() => g.setTranscriptConsent(g.players[0], false)).toThrow(/locked/);
    expect(g.players[0].transcriptConsent).toBe(true);
    const v = playerView(g, g.players[0]).self;
    expect(!v.isStoryteller && v.consentLocked).toBe(true);
  });
  it('in the lobby answers can still be changed', () => {
    const g = new Game({ name: 'L', visibility: 'public', stName: 'ST' });
    g.emit = () => {};
    for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
    g.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'mezepheles', 'imp'] });
    g.setTranscriptConsent(g.players[0], false);
    g.setTranscriptConsent(g.players[0], true);
    expect(g.players[0].transcriptConsent).toBe(true);
  });
});

describe('word listening', () => {
  it('runs only when a word character is visible (never reveals a hidden one)', () => {
    expect(game(['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'poisoner', 'imp']).g.transcriptActive()).toBe(false);
    const { g } = game();
    expect(g.transcriptActive()).toBe(true);
    g.updateSettings({ publicList: { ...g.settings.publicList, hidden: ['mezepheles'] } });
    expect(g.transcriptActive()).toBe(false);
  });
  it('never stores what was said, only detections with who, when, where and who heard', () => {
    const { g, by } = game();
    g.setSecretWord('mezepheles', 'pumpkin');
    const chef = by('chef');
    g.checkSpeech(chef.id, 'I think Bram is the Demon, honestly');
    g.checkSpeech(chef.id, 'Pumpkin pie is the best');
    const json = JSON.stringify(g.toJSON());
    expect(json).not.toContain('Bram is the Demon');
    expect(json).not.toContain('pie is the best');
    expect(g.wordLog).toHaveLength(1);
    const e = g.wordLog[0];
    expect(e).toMatchObject({ kind: 'mezepheles', playerId: chef.id, room: 'square', when: 'Day 1' });
    expect(e.withIds).toContain('st');
    expect(e.withIds).toContain(by('empath').id);
    expect(e.withIds).not.toContain(chef.id);
    const sv = storytellerView(g).self;
    expect(sv.isStoryteller && sv.wordLog).toHaveLength(1);
    expect(JSON.stringify(playerView(g, by('empath')))).not.toContain('pumpkin');
  });
  it('needs consent and audible speech; answers cannot be withdrawn mid-game', () => {
    const { g, by } = game();
    g.setSecretWord('mezepheles', 'pumpkin');
    const [chef, emp] = [by('chef'), by('empath')];
    emp.transcriptConsent = false; // e.g. a Traveller's answer from before the change: not listened to
    g.checkSpeech(emp.id, 'pumpkin');
    expect(g.wordLog).toHaveLength(0);
    chef.muted = true;
    g.checkSpeech(chef.id, 'pumpkin');
    expect(g.wordLog).toHaveLength(0);
    chef.muted = false;
    g.checkSpeech(chef.id, 'pumpkin');
    expect(g.wordLog).toHaveLength(1);
    expect(() => g.setTranscriptConsent(chef, false)).toThrow(/locked/); // can't withdraw mid-game
    expect(g.wordLog).toHaveLength(1);
  });
  it('counts the Yaggababble phrase and marks a Goblin claim', () => {
    const { g, by } = game(['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'goblin', 'yaggababble']);
    const y = by('yaggababble'), gob = by('goblin');
    g.setSecretWord('yaggababble', 'what a lovely day');
    g.checkSpeech(y.id, 'What a lovely day! Really, what a lovely day.');
    expect(g.yaggababbleCount).toBe(2);
    g.setStage('nominations');
    g.nominate(by('chef').id, gob.id);
    g.startDefense();
    g.checkSpeech(gob.id, 'Fine. I am the Goblin.');
    expect(gob.reminders).toContain('Claimed');
    expect(g.wordLog.map(e => e.kind)).toEqual(['yaggababble', 'goblin']);
  });
  it('counts English syllables for the Ug hat', () => {
    expect(['cat', 'dog', 'make', 'the'].map(syllables)).toEqual([1, 1, 1, 1]);
    expect(syllables('wonderful')).toBeGreaterThan(1);
  });
});
