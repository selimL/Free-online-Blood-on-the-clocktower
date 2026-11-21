// Gestures are cosmetic, but must follow the same visibility rules as voice: never leak across rooms or at night.
import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game';

function started() {
  const g = new Game({ name: 'Gestures', visibility: 'public', stName: 'ST' });
  const sent: { to: string[] | 'all'; event: string; data: any }[] = [];
  g.emit = ((to: string[] | 'all', event: string, data: unknown) => { sent.push({ to, event, data }); }) as typeof g.emit;
  for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
  g.updateSettings({ characters: ['washerwoman', 'empath', 'slayer', 'monk', 'chef', 'poisoner', 'imp'] });
  g.deal(); g.reveal();
  return { g, emotes: () => sent.filter(s => s.event === 'emote') };
}

describe('gestures', () => {
  it('reach everyone in the same place, but not people in other rooms', () => {
    const { g, emotes } = started();
    const [a, b, c] = g.players;
    for (const p of g.players) { p.location = 'square'; p.joining = false; }
    c.location = 'r0'; // in a side room
    const s = g.addSpectator('Watcher', undefined);
    g.emote(a.id, 'wave');
    const e = emotes().at(-1)!;
    expect(e.data).toMatchObject({ id: a.id, kind: 'wave' });
    expect(e.to).toContain(b.id);
    expect(e.to).toContain(s.id);
    expect(e.to).toContain('st'); // the Storyteller is in the square too
    expect(e.to).not.toContain(c.id);
  });
  it('are refused at night, for spectators, and for unknown gestures', () => {
    const { g } = started();
    const s = g.addSpectator('Watcher', undefined);
    expect(() => g.emote(s.id, 'wave')).toThrow(/Spectators/);
    expect(() => g.emote(g.players[0].id, 'dance')).toThrow(/Unknown/);
    g.beginNight();
    g.players[0].awake = true;
    expect(() => g.emote(g.players[0].id, 'wave')).toThrow(/night/);
    expect(() => g.emote('st', 'wave')).toThrow(/night/);
  });
  it('are rate-limited', () => {
    const { g, emotes } = started();
    const a = g.players[0];
    g.emote(a.id, 'wave'); g.emote(a.id, 'clap'); g.emote(a.id, 'nod');
    expect(emotes().length).toBe(1);
  });
});
