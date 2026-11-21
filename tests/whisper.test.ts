// Whispers stay between one player and the Storyteller; connection drops are announced after a grace period.
import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game';
import { playerView, storytellerView, spectatorView } from '../server/src/views';

function game() {
  const g = new Game({ name: 'W', visibility: 'public', stName: 'ST' });
  const sent: { to: unknown; event: string; data: any }[] = [];
  g.emit = ((to: unknown, event: string, data: unknown) => { sent.push({ to, event, data }); }) as typeof g.emit;
  for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
  return { g, sent };
}

describe('whispers', () => {
  it('are seen only by that player and the Storyteller', () => {
    const { g, sent } = game();
    const [a, b] = g.players;
    g.whisper(a.id, 'st', 'Is the Drunk in play?');
    g.whisper('st', a.id, 'I cannot tell you that.');
    expect(sent.filter(s => s.event === 'whisper').every(s => JSON.stringify(s.to) === JSON.stringify(['st', a.id]))).toBe(true);
    expect(playerView(g, a).whispers.map(w => w.text)).toEqual(['Is the Drunk in play?', 'I cannot tell you that.']);
    expect(playerView(g, b).whispers).toEqual([]);
    expect(storytellerView(g).whispers).toHaveLength(2);
    const s = g.addSpectator('Watcher', undefined);
    expect(spectatorView(g, s).whispers).toEqual([]);
    expect(JSON.stringify(playerView(g, b))).not.toContain('Drunk in play');
  });
  it('cannot go player to player, from spectators, or too fast', () => {
    const { g } = game();
    const [a, b] = g.players;
    expect(() => g.whisper(a.id, b.id, 'psst')).toThrow(/only whisper to the Storyteller/);
    const s = g.addSpectator('Watcher', undefined);
    expect(() => g.whisper(s.id, 'st', 'hi')).toThrow(/Spectators/);
    g.whisper(a.id, 'st', 'one');
    expect(() => g.whisper(a.id, 'st', 'two')).toThrow(/Slow down/);
  });
});

describe('connection drops', () => {
  it('are announced after the grace period, and when they come back', () => {
    const { g, sent } = game();
    const a = g.players[0];
    g.setConnected(a, false);
    const t0 = a.offlineSince!;
    g.tick(t0 + 3000);
    expect(sent.some(s => s.event === 'alert' && /lost connection/.test(s.data.text))).toBe(false);
    expect(playerView(g, g.players[1]).players[0].offlineSince).toBeNull();
    g.tick(t0 + 9000);
    expect(sent.some(s => s.event === 'alert' && /P0 lost connection/.test(s.data.text))).toBe(true);
    expect(playerView(g, g.players[1]).players[0].offlineSince).toBe(t0);
    g.setConnected(a, true);
    expect(sent.some(s => s.event === 'alert' && /P0 is back/.test(s.data.text))).toBe(true);
    expect(playerView(g, g.players[1]).players[0].offlineSince).toBeNull();
  });
  it('a quick reconnect is not announced at all', () => {
    const { g, sent } = game();
    const a = g.players[0];
    g.setConnected(a, false);
    g.tick(a.offlineSince! + 2000);
    g.setConnected(a, true);
    expect(sent.some(s => s.event === 'alert' && /connection|is back/.test(s.data.text))).toBe(false);
  });
});
