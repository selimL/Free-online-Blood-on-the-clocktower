// Spectators watch without a seat: public information only, listen-only voice, no chat, no secrets.
import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game';
import { spectatorView } from '../server/src/views';

function started() {
  const g = new Game({ name: 'Watched', visibility: 'public', stName: 'ST' });
  g.emit = () => {};
  for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
  g.updateSettings({ characters: ['washerwoman', 'empath', 'slayer', 'monk', 'chef', 'poisoner', 'imp'] });
  g.deal(); g.reveal();
  return g;
}

describe('spectators', () => {
  it('see only public information', () => {
    const g = started();
    const s = g.addSpectator('Watcher', undefined);
    g.sendInfoCard(g.players[0].id, { text: 'Secret for P0' });
    const v = spectatorView(g, s);
    const json = JSON.stringify(v);
    expect(v.self.isStoryteller).toBe(false);
    expect(!v.self.isStoryteller && v.self.spectator).toBe(true);
    expect(!v.self.isStoryteller && v.self.characterId).toBeNull();
    expect(v.players.every(p => !p.evilMark)).toBe(true);
    expect(json).not.toContain('"grimoire"');
    expect(json).not.toContain('Secret for P0');
    for (const p of g.players) expect(json).not.toContain(p.token);
    expect(v.spectators.map(x => x.name)).toEqual(['Watcher']);
  });
  it('can listen to the Town Square but never speak, type, or hear at night', () => {
    const g = started();
    const s = g.addSpectator('Watcher', undefined);
    expect(g.voiceTarget(s.id)).toEqual({ room: 'square', publish: false, subscribe: true });
    expect(() => g.sendChat(s.id, 'hello')).toThrow(/Spectators/);
    g.beginNight();
    expect(g.voiceTarget(s.id).room).toBeNull();
    const v = spectatorView(g, s);
    expect(v.rooms.every(r => r.occupants.length === 0)).toBe(true);
  });
  it('can be switched off by the Storyteller', () => {
    const g = started();
    g.updateSettings({ houseRules: { ...g.settings.houseRules, allowSpectators: false } });
    expect(() => g.addSpectator('Nope', undefined)).toThrow(/not allowing/);
  });
});
