// Game backups (download and restore).
import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game';
import { encode, decode } from '../server/src/persist';

function game() {
  const g = new Game({ name: 'R4', visibility: 'public', stName: 'ST' });
  g.emit = () => {};
  for (let i = 0; i < 6; i++) g.join(`P${i}`, undefined);
  return g;
}

describe('game backups', () => {
  it('restore the game with a fresh Storyteller secret and the players\' own seat codes', () => {
    const g = game();
    g.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'monk', 'poisoner', 'imp'] });
    g.deal();
    const back = Game.fromBackup(decode(encode(g.toJSON())));
    expect(back.id).toBe(g.id);
    expect(back.players.map(p => [p.name, p.token, p.characterId])).toEqual(g.players.map(p => [p.name, p.token, p.characterId]));
    expect(back.storyteller.token).not.toBe(g.storyteller.token);
    expect(typeof back.changed).toBe('function');
  });
  it('ignore prototype tricks and refuse to overwrite methods', () => {
    const g = game();
    const data = JSON.parse(encode(g.toJSON()));
    const evil = `{"__proto__":{"polluted":true},${encode(data).slice(1, -1)},"changed":"nope","settings":{"__proto__":{"x":1},"characters":[]}}`;
    const back = Game.fromBackup(JSON.parse(evil));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(typeof back.changed).toBe('function');
    expect((back.settings as unknown as Record<string, unknown>).x).toBeUndefined();
  });
  it('reject files that are not games', () => {
    expect(() => Game.fromBackup({ hello: 1 })).toThrow();
    expect(() => Game.fromBackup([1, 2])).toThrow();
    expect(() => Game.fromBackup(null)).toThrow();
  });
});

import { lobbyEntry } from '../server/src/views';
describe('looking for players', () => {
  it('shows in the lobby until the game starts', () => {
    const g = game();
    g.setLookingFor(3, 'beginners welcome\u0007');
    expect(lobbyEntry(g).lookingFor).toEqual({ count: 3, note: 'beginners welcome' });
    g.setLookingFor(0, '');
    expect(lobbyEntry(g).lookingFor).toBeNull();
    g.setLookingFor(99, '');
    expect(g.lookingFor?.count).toBe(20);
  });
});
