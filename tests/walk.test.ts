// Walking in the 3D Town Square: cosmetic positions, allowed only when seats don't matter.
import { describe, it, expect } from 'vitest';
import { Game, WALK_RADIUS, ROOM_HALF_W, ROOM_Z } from '../server/src/game';
import { playerView } from '../server/src/views';

function setup() {
  const g = new Game({ name: 'T', visibility: 'public', stName: 'ST' });
  const events: { event: string; payload: any; to?: unknown }[] = [];
  g.emit = (to, event, payload) => { events.push({ event, payload }); Object.defineProperty(events.at(-1)!, 'to', { value: to, enumerable: false }); };
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
    expect(events.at(-1)).toEqual({ event: 'pos', payload: { id: p.id, x: 3.14, z: -2, ry: 1.5, room: 'square' } });
    g.walk(p.id, 100, 0, 0);
    expect(Math.hypot(p.pos!.x, p.pos!.z)).toBeCloseTo(WALK_RADIUS, 1);
    g.walk(p.id, NaN, 0, 0);
    expect(p.pos!.x).toBeCloseTo(WALK_RADIUS, 1); // ignored
    expect(playerView(g, g.players[1]).players[0].pos).toEqual(p.pos);
  });
  it('is refused at night, during nominations and abilities; seats are restored', () => {
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

describe('open buildings', () => {
  it('the Storyteller can open specific buildings; the minimum is always met; occupants of closed rooms are moved out', () => {
    const { g } = setup();                       // 7 players → at least 4 side rooms
    expect(g.privateRoomIds()).toEqual(['r0', 'r1', 'r2', 'r3']);
    g.updateSettings({ openBuildings: [5, 6, 7, 1] });
    expect(g.privateRoomIds()).toEqual(['r1', 'r5', 'r6', 'r7']);
    expect(g.rooms().find(r => r.id === 'r5')!.name).toBe('The Blacksmith');
    g.updateSettings({ openBuildings: [7] });    // too few: topped up with the first unchosen buildings
    expect(g.privateRoomIds()).toEqual(['r0', 'r1', 'r2', 'r7']);
    const p = g.players[0];
    g.movePlayer(p, 'r7');
    g.updateSettings({ openBuildings: [0, 1, 2, 3, 4] });
    expect(p.location).toBe('square');
    expect(g.privateRoomIds()).toHaveLength(5);  // more than the minimum is fine
  });
  it('inside a building: positions stay within the room and only its occupants are told', () => {
    const { g, events } = setup();
    g.deal(); g.reveal(); g.beginNight(); g.beginDay(); g.tick(Date.now() + 10_000);
    g.setStage('private');
    const [p, q, r] = g.players;
    g.movePlayer(p, 'r0'); g.movePlayer(q, 'r0');
    events.length = 0;
    g.walk(p.id, 99, -99, 0);
    expect(p.pos).toEqual({ x: ROOM_HALF_W, z: ROOM_Z[0], ry: 0 });   // clamped to the room's floor
    const e = events.at(-1)!;
    expect(e.event).toBe('pos');
    expect(e.payload.room).toBe('r0');
    expect(e.to).toEqual(expect.arrayContaining([p.id, q.id]));
    expect(e.to).not.toContain(r.id);
    expect(playerView(g, q).players[0].pos).toEqual(p.pos);       // same room: sees it
    expect(playerView(g, r).players[0].pos).toBeNull();           // elsewhere: does not
    g.beginNight();
    g.walk(p.id, 1, 1, 0);
    expect(p.pos).toBeNull();                                      // never at night
  });
});
