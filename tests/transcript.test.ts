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
  g.deal();
  cast.forEach((c, i) => g.setCharacter(g.players[i].id, c));
  g.reveal(); g.beginNight(); g.beginDay(); g.tick(Date.now() + 10_000);
  for (const p of g.players) g.setTranscriptConsent(p, true);
  return { g, by: (c: string) => g.players.find(p => p.characterId === c)! };
}

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
  it('needs consent and audible speech; withdrawing deletes what was recorded', () => {
    const { g, by } = game();
    g.setSecretWord('mezepheles', 'pumpkin');
    const [chef, emp] = [by('chef'), by('empath')];
    g.setTranscriptConsent(emp, false);
    g.checkSpeech(emp.id, 'pumpkin');
    expect(g.wordLog).toHaveLength(0);
    chef.muted = true;
    g.checkSpeech(chef.id, 'pumpkin');
    expect(g.wordLog).toHaveLength(0);
    chef.muted = false;
    g.checkSpeech(chef.id, 'pumpkin');
    expect(g.wordLog).toHaveLength(1);
    g.setTranscriptConsent(chef, false);
    expect(g.wordLog).toHaveLength(0);
    expect(g.wordHits).toHaveLength(0);
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
