// End-of-game MVP votes and scheduled start times.
import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game';
import { playerView, storytellerView, lobbyEntry } from '../server/src/views';

function game() {
  const g = new Game({ name: 'M', visibility: 'public', stName: 'ST' });
  g.emit = () => {};
  for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
  return g;
}

describe('MVP', () => {
  it('opens when the game ends; one changeable vote each, never for yourself', () => {
    const g = game();
    const [a, b, c] = g.players;
    expect(() => g.voteMvp(a.id, b.id)).toThrow(/game is over/);
    g.endGame('good');
    g.voteMvp(a.id, b.id); g.voteMvp(c.id, b.id); g.voteMvp('st', a.id);
    expect(() => g.voteMvp(a.id, a.id)).toThrow(/yourself/);
    expect(playerView(g, a).mvp).toEqual({ votes: { [b.id]: 2, [a.id]: 1 }, mine: b.id });
    g.voteMvp(a.id, c.id);
    expect(storytellerView(g).mvp).toEqual({ votes: { [b.id]: 1, [c.id]: 1, [a.id]: 1 }, mine: a.id });
    const s = g.addSpectator('W', undefined);
    expect(() => g.voteMvp(s.id, a.id)).toThrow(/Spectators/);
  });
});

describe('scheduled games', () => {
  it('stores a start time shown in the lobby and the game view', () => {
    const g = game();
    const at = Date.now() + 2 * 86400_000;
    g.setSchedule(at);
    expect(lobbyEntry(g).scheduledFor).toBe(at);
    expect(playerView(g, g.players[0]).scheduledFor).toBe(at);
    g.setSchedule(null);
    expect(g.scheduledFor).toBeNull();
  });
  it('refuses times in the past or too far ahead, and after the start', () => {
    const g = game();
    expect(() => g.setSchedule(Date.now() - 2 * 3600_000)).toThrow(/passed/);
    expect(() => g.setSchedule(Date.now() + 40 * 86400_000)).toThrow(/30 days/);
    g.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'monk', 'saint', 'poisoner', 'imp'] });
    g.deal();
    expect(() => g.setSchedule(Date.now() + 3600_000)).toThrow(/already started/);
  });
});
