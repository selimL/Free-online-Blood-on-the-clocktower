// Walking in the 3D Town Square: cosmetic positions, allowed only when seats don't matter.
import { describe, it, expect } from 'vitest';
import { Game, WALK_RADIUS } from '../server/src/game';
import { playerView } from '../server/src/views';

function setup() {
  const g = new Game({ name: 'T', visibility: 'public', stName: 'ST' });
  const events: { event: string; payload: any }[] = [];
  g.emit = (_a, event, payload) => events.push({ event, payload });
  for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
  g.updateSettings({ characters: ['washerwoman', 'empath', 'slayer', 'monk', 'chef', 'poisoner', 'imp'] });
  return { g, events };
}

describe('walking', () => {
  it('broadcasts a lightweight pos event and stores the position (clamped, rounded)', () => {
    const { g, events } = setup();
    const p = g.players[0];
    g.walk(p.id, 3.14159, -2, 1.5);
    expect(p.pos).toEqual({ x: 3.14, z: -2, ry: 1.5 });
    expect(events.at(-1)).toEqual({ event: 'pos', payload: { id: p.id, x: 3.14, z: -2, ry: 1.5 } });
    g.walk(p.id, 100, 0, 0);
    expect(Math.hypot(p.pos!.x, p.pos!.z)).toBeCloseTo(WALK_RADIUS, 1);
    g.walk(p.id, NaN, 0, 0);
    expect(p.pos!.x).toBeCloseTo(WALK_RADIUS, 1); // ignored
    expect(playerView(g, g.players[1]).players[0].pos).toEqual(p.pos);
  });
  it('is refused in side rooms, at night, during nominations and abilities; seats are restored', () => {
    const { g, events } = setup();
    g.deal(); g.reveal();
    g.beginNight();
    const p = g.players[0];
    g.walk(p.id, 1, 1, 0);
    expect(p.pos).toBeNull();
    g.beginDay(); g.tick(Date.now() + 10_000);
    g.walk(p.id, 1, 1, 0);
    expect(p.pos).not.toBeNull();                    // discussion: free walking
    g.setStage('private');
    g.movePlayer(p, 'r0');
    expect(p.pos).toBeNull();                        // leaving the square drops the position
    g.walk(p.id, 2, 2, 0);
    expect(p.pos).toBeNull();                        // can't walk while inside a building
    const q = g.players[1];
    g.walk(q.id, 2, 2, 0);
    expect(q.pos).not.toBeNull();
    events.length = 0;
    g.setStage('nominations');
    expect(q.pos).toBeNull();                        // back to the seats
    expect(events.some(e => e.event === 'pos-reset')).toBe(true);
    g.walk(q.id, 2, 2, 0);
    expect(q.pos).toBeNull();
    expect(g.canWalk()).toBe(false);
  });
  it('the Storyteller can walk too', () => {
    const { g } = setup();
    g.walk('st', -3, 4, 0.5);
    expect(g.storyteller.pos).toEqual({ x: -3, z: 4, ry: 0.5 });
  });
});
