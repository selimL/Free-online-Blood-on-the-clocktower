// The end-of-game story reveals everything, so it must not exist before the game ends.
import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game';
import { playerView } from '../server/src/views';

describe('end-of-game story', () => {
  it('is hidden during the game and complete afterwards', () => {
    const g = new Game({ name: 'Story', visibility: 'public', stName: 'ST' });
    g.emit = () => {};
    for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
    g.updateSettings({ characters: ['washerwoman', 'empath', 'slayer', 'monk', 'chef', 'poisoner', 'imp'] });
    g.deal(); g.reveal(); g.beginNight();
    g.sendInfoCard(g.players[0].id, { text: 'Secret night info' });
    g.beginDay(); g.tick(Date.now() + 10_000);
    const during = playerView(g, g.players[1]);
    expect(during.story).toBeNull();
    expect(JSON.stringify(during)).not.toContain('Secret night info');
    g.endGame('good');
    const after = playerView(g, g.players[1]).story!;
    expect(after.grimoire).toHaveLength(7);
    expect(after.grimoire.map(x => x.characterId).sort()).toEqual(g.players.map(p => p.characterId).sort());
    expect(after.log.join('\n')).toContain('Secret night info');
  });
});
