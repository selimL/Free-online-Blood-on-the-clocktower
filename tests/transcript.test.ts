// Voice transcript: off by default, consent first, only audible speech, Storyteller only, deletable.
import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game';
import { playerView, storytellerView } from '../server/src/views';

function game() {
  const g = new Game({ name: 'T', visibility: 'public', stName: 'ST' });
  const sent: { to: unknown; event: string; data: any }[] = [];
  g.emit = ((to: unknown, event: string, data: unknown) => { sent.push({ to, event, data }); }) as typeof g.emit;
  for (let i = 0; i < 5; i++) g.join(`P${i}`, undefined);
  g.tick(Date.now() + 10_000); // everyone settled in the square
  return { g, sent };
}

describe('voice transcript', () => {
  it('is off by default and needs each player\'s consent', () => {
    const { g } = game();
    const [a] = g.players;
    g.addTranscript(a.id, 'hello');
    expect(g.transcript).toHaveLength(0);                 // rule off
    g.updateSettings({ houseRules: { ...g.settings.houseRules, voiceTranscript: true } });
    const self = playerView(g, a).self;
    expect(self.isStoryteller ? 'st' : self.transcriptConsent).toBeNull();
    g.addTranscript(a.id, 'hello');
    expect(g.transcript).toHaveLength(0);                 // not agreed yet
    g.setTranscriptConsent(a, true);
    g.addTranscript(a.id, 'I am the Chef');
    expect(g.transcript.map(l => l.text)).toEqual(['I am the Chef']);
    expect(g.transcript[0].room).toBe('square');
  });
  it('is sent only to the Storyteller and never appears in player views', () => {
    const { g, sent } = game();
    g.updateSettings({ houseRules: { ...g.settings.houseRules, voiceTranscript: true } });
    const [a, b] = g.players;
    g.setTranscriptConsent(a, true);
    g.addTranscript(a.id, 'secret plan');
    const ev = sent.filter(s => s.event === 'transcript');
    expect(ev).toHaveLength(1);
    expect(ev[0].to).toEqual(['st']);
    expect(JSON.stringify(playerView(g, b))).not.toContain('secret plan');
    expect(JSON.stringify(storytellerView(g))).not.toContain('secret plan'); // fetched on demand, not broadcast
  });
  it('ignores speech nobody could hear (muted, joining, asleep)', () => {
    const { g } = game();
    g.updateSettings({ houseRules: { ...g.settings.houseRules, voiceTranscript: true } });
    const a = g.players[0];
    g.setTranscriptConsent(a, true);
    a.muted = true;
    g.addTranscript(a.id, 'muted words');
    expect(g.transcript).toHaveLength(0);
  });
  it('withdrawing consent deletes what was kept', () => {
    const { g } = game();
    g.updateSettings({ houseRules: { ...g.settings.houseRules, voiceTranscript: true } });
    const [a, b] = g.players;
    g.setTranscriptConsent(a, true); g.setTranscriptConsent(b, true);
    g.addTranscript(a.id, 'from a'); g.addTranscript(b.id, 'from b');
    g.setTranscriptConsent(a, false);
    expect(g.transcript.map(l => l.text)).toEqual(['from b']);
    g.addTranscript(a.id, 'after withdrawing');
    expect(g.transcript).toHaveLength(1);
  });
});
