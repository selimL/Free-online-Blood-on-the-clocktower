// Saving and restoring games across a server restart.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Game } from '../server/src/game';
import { FileStore, encode, decode } from '../server/src/persist';
import { playerView } from '../server/src/views';

function midGame() {
  const g = new Game({ name: 'Saved night', visibility: 'private', stName: 'Ezra' });
  g.emit = () => {};
  for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
  g.updateSettings({ characters: ['washerwoman', 'empath', 'slayer', 'monk', 'chef', 'poisoner', 'imp'] });
  g.deal(); g.reveal(); g.beginNight();
  g.setReminders(g.players[2].id, ['Poisoned']);
  g.kill(g.players[3].id);
  g.beginDay(); g.tick(Date.now() + 10_000);
  g.setStage('nominations');
  g.nominate(g.players[0].id, g.players[1].id);
  return g;
}

describe('saving games', () => {
  it('round-trips the full game, including Sets, characters and the timer', () => {
    const g = midGame();
    const restored = Game.fromJSON(decode(encode(g.toJSON())));
    expect(restored.id).toBe(g.id);
    expect(restored.code).toBe(g.code);
    expect(restored.players.map(p => p.characterId)).toEqual(g.players.map(p => p.characterId));
    expect(restored.players[2].reminders).toEqual(['Poisoned']);
    expect(restored.players[3].alive).toBe(false);
    expect(restored.nominatorsToday).toBeInstanceOf(Set);
    expect([...restored.nominatorsToday]).toEqual([g.players[0].id]);
    expect(restored.stage).toBe('accusation');
    expect(restored.timer?.kind).toBe('accusation');
    expect(restored.nomination?.deadline).toBe(Infinity); // Infinity survives JSON
    // the same seat tokens still work after a restart
    expect(restored.players[0].token).toBe(g.players[0].token);
    expect(restored.storyteller.token).toBe(g.storyteller.token);
  });

  it('comes back paused, and resumes with timers shifted by the downtime', () => {
    const g = midGame();
    const saved = g.toJSON();
    const before = g.timer!.endsAt!;
    const restored = Game.fromJSON(decode(encode(saved)));
    restored.emit = () => {};
    expect(restored.paused).toBe(true);
    expect(restored.players.every(p => !p.connected)).toBe(true);
    restored.tick(before + 60_000);                // time passes while nobody is connected…
    expect(restored.stage).toBe('accusation');     // …but nothing advances while paused
    restored.setPaused(false);
    expect(restored.timer!.endsAt!).toBeGreaterThan(before - 1);
    // timers still drive the game after restoring
    restored.expireTimer();
    expect(restored.stage).toBe('defense');
  });

  it('keeps hidden information hidden after restoring', () => {
    const g = midGame();
    const restored = Game.fromJSON(decode(encode(g.toJSON())));
    const view = JSON.stringify(playerView(restored, restored.players[0]));
    expect(view).not.toContain('"grimoire"');
    expect(view).not.toContain(restored.players[0].token);
  });

  it('stores games in a local folder', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-save-'));
    const store = new FileStore(dir);
    const g = midGame();
    await store.save(g.id, encode(g.toJSON()));
    const all = await store.loadAll();
    expect(all).toHaveLength(1);
    expect(Game.fromJSON(decode(all[0])).name).toBe('Saved night');
    await store.remove(g.id);
    expect(await store.loadAll()).toHaveLength(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
