// Voice transcript: only with a word character in play (judged from public info), consent first,
// only audible speech, Storyteller only, deletable; secret words are detected.
import { describe, it, expect } from 'vitest';
import { Game, syllables } from '../server/src/game';
import { playerView, storytellerView } from '../server/src/views';

function game(cast = ['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'mezepheles', 'imp']) {
  const g = new Game({ name: 'T', visibility: 'public', stName: 'ST' });
  const sent: { to: unknown; event: string; data: any }[] = [];
  g.emit = ((to: unknown, event: string, data: unknown) => { sent.push({ to, event, data }); }) as typeof g.emit;
  cast.forEach((_, i) => g.join(`P${i}`, undefined));
  g.updateSettings({ characters: cast });
  g.deal();
  cast.forEach((c, i) => g.setCharacter(g.players[i].id, c));
  g.reveal(); g.beginNight(); g.beginDay(); g.tick(Date.now() + 10_000);
  return { g, sent, by: (c: string) => g.players.find(p => p.characterId === c)! };
}

describe('voice transcript', () => {
  it('runs only when a word character is on the public list, the script or the Loric', () => {
    const plain = game(['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'poisoner', 'imp']);
    expect(plain.g.transcriptActive()).toBe(false);
    const a = plain.g.players[0];
    plain.g.setTranscriptConsent(a, true);
    plain.g.addTranscript(a.id, 'hello');
    expect(plain.g.transcript).toHaveLength(0);
    plain.g.updateSettings({ fabled: ['godofug'] });
    expect(plain.g.transcriptActive()).toBe(true);
    const hidden = game();
    hidden.g.updateSettings({ publicList: { ...hidden.g.settings.publicList, hidden: ['mezepheles'] } });
    expect(hidden.g.transcriptActive()).toBe(false); // never gives away a hidden character
    expect(game().g.transcriptActive()).toBe(true);
  });
  it('needs consent, is Storyteller only, and withdrawing deletes it', () => {
    const { g, sent } = game();
    const [a, b] = g.players;
    expect(!playerView(g, a).self.isStoryteller && playerView(g, a).self.transcriptActive).toBe(true);
    g.addTranscript(a.id, 'not agreed');
    expect(g.transcript).toHaveLength(0);
    g.setTranscriptConsent(a, true); g.setTranscriptConsent(b, true);
    g.addTranscript(a.id, 'secret plan'); g.addTranscript(b.id, 'from b');
    expect(sent.filter(s => s.event === 'transcript').every(s => JSON.stringify(s.to) === '["st"]')).toBe(true);
    expect(JSON.stringify(playerView(g, b))).not.toContain('secret plan');
    expect(JSON.stringify(storytellerView(g))).not.toContain('secret plan');
    g.setTranscriptConsent(a, false);
    expect(g.transcript.map(l => l.text)).toEqual(['from b']);
  });
  it('ignores speech nobody could hear', () => {
    const { g } = game();
    const a = g.players[0];
    g.setTranscriptConsent(a, true);
    a.muted = true;
    g.addTranscript(a.id, 'muted words');
    expect(g.transcript).toHaveLength(0);
  });
});

describe('word detection', () => {
  it('spots the Mezepheles word (English or Turkish) for the Storyteller to confirm', () => {
    const { g, by } = game();
    g.setSecretWord('mezepheles', 'Pumpkin');
    const chef = by('chef');
    g.setTranscriptConsent(chef, true);
    g.addTranscript(chef.id, 'I really like pumpkin pie', 'en-US');
    expect(g.wordHits.map(h => [h.kind, h.playerId])).toEqual([['mezepheles', chef.id]]);
    g.setSecretWord('mezepheles', 'balkabağı');
    const emp = by('empath');
    g.setTranscriptConsent(emp, true);
    g.addTranscript(emp.id, 'Bence BALKABAĞI güzel', 'tr-TR');
    expect(g.wordHits).toHaveLength(2);
    g.addTranscript(emp.id, 'nothing here', 'tr-TR');
    expect(g.wordHits).toHaveLength(2);
  });
  it('counts the Yaggababble phrase and marks a Goblin claim', () => {
    const { g, by } = game(['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'goblin', 'yaggababble']);
    const y = by('yaggababble'), gob = by('goblin');
    g.setSecretWord('yaggababble', 'what a lovely day');
    g.setTranscriptConsent(y, true); g.setTranscriptConsent(gob, true);
    g.addTranscript(y.id, 'What a lovely day! Really, what a lovely day.');
    expect(g.yaggababbleCount).toBe(2);
    g.setStage('nominations');
    g.nominate(by('chef').id, gob.id);
    g.startDefense(); // the nominee speaks in the defence
    g.addTranscript(gob.id, 'Fine. I am the Goblin.');
    expect(gob.reminders).toContain('Claimed');
  });
  it('counts syllables for the Ug hat', () => {
    expect(['cat', 'dog', 'make', 'the'].map(w => syllables(w, 'en'))).toEqual([1, 1, 1, 1]);
    expect(syllables('wonderful', 'en')).toBeGreaterThan(1);
    expect(syllables('ev', 'tr')).toBe(1);
    expect(syllables('kitap', 'tr')).toBe(2);
  });
});
