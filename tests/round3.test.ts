// Co-Storytellers, jinxes and the replay timeline.
import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game';
import { playerView } from '../server/src/views';
import { jinxesFor } from '../shared/jinxes';
import { encode, decode } from '../server/src/persist';

function game() {
  const g = new Game({ name: 'R', visibility: 'public', stName: 'ST' });
  g.emit = () => {};
  for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
  return g;
}

describe('co-Storytellers', () => {
  it('are Storytellers who follow the lead Storyteller\'s room', () => {
    const g = game();
    const c = g.addCoStoryteller('Helper');
    expect(c.id.startsWith('co:')).toBe(true);
    expect(g.isStoryteller(c.id)).toBe(true);
    expect(g.isStoryteller(g.players[0].id)).toBe(false);
    expect(g.voiceTarget(c.id)).toEqual(g.voiceTarget('st'));
    g.moveST('study');
    expect(g.voiceTarget(c.id).room).toBe('study');
    expect(g.nameOf(c.id)).toBe('Helper (co-Storyteller)');
    expect(playerView(g, g.players[0]).coStorytellers.map(x => x.name)).toEqual(['Helper']);
    expect(JSON.stringify(playerView(g, g.players[0]))).not.toContain(c.token);
  });
  it('at most two; removing one bans their seat; undo keeps them', () => {
    const g = game();
    const snap = encode(g.toJSON());
    const a = g.addCoStoryteller('A'); g.addCoStoryteller('B');
    expect(() => g.addCoStoryteller('C')).toThrow(/two/);
    g.restoreSnapshot(decode(snap), 1000);
    expect(g.coStorytellers).toHaveLength(2);
    g.removeCoStoryteller(a.id);
    expect(g.coStorytellers.map(c => c.name)).toEqual(['B']);
    expect(g.banned.has(a.id)).toBe(true);
  });
});

describe('jinxes', () => {
  it('finds jinxes between characters in play, including the Storyteller\'s own', () => {
    expect(jinxesFor(['spy', 'damsel', 'imp']).map(j => `${j.a}+${j.b}`)).toEqual(['spy+damsel']);
    expect(jinxesFor(['washerwoman', 'imp'])).toEqual([]);
    const mine = jinxesFor(['chef', 'imp'], [{ a: 'chef', b: 'imp', text: 'House ruling' }]);
    expect(mine).toEqual([{ a: 'chef', b: 'imp', text: 'House ruling', custom: true }]);
  });
  it('custom jinxes are validated in the settings', () => {
    const g = game();
    g.updateSettings({ customJinxes: [{ a: 'chef', b: 'imp', text: 'x' }, { a: 'nobody', b: 'imp', text: 'bad' }, { a: 'imp', b: 'imp', text: 'same' }] });
    expect(g.settings.customJinxes).toEqual([{ a: 'chef', b: 'imp', text: 'x' }]);
  });
});

describe('replay timeline', () => {
  it('records each event with who was alive at that moment', () => {
    const g = game();
    g.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'poisoner', 'imp'] });
    g.deal(); g.reveal(); g.beginNight(); g.kill(g.players[3].id); g.beginDay();
    g.execute(g.players[5].id);
    const last = g.timeline.at(-1)!;
    expect(last.text).toMatch(/executed/);
    expect(last.alive).not.toContain(g.players[3].id);
    expect(last.alive).not.toContain(g.players[5].id); // shown dead on the execution itself
    const before = g.timeline.find(e => /Night 1 begins/.test(e.text))!;
    expect(before.alive).toContain(g.players[3].id);
    g.endGame('good');
    expect(playerView(g, g.players[0]).story!.timeline.length).toBeGreaterThan(3);
  });
});
