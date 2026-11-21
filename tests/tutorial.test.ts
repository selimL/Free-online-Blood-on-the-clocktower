// The practice game must run start to finish on the real engine, and bots must behave.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Game } from '../server/src/game';
import { addBot, botTick } from '../server/src/bots';
import { startTutorial, tutorialNext, tutorialTick } from '../server/src/tutorial';
import { playerView } from '../server/src/views';

afterEach(() => vi.useRealTimers());

function practice() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  const g = new Game({ name: 'Practice', visibility: 'private', stName: 'The Guide' });
  const chat: string[] = [];
  g.emit = ((to: unknown, ev: string, d: any) => { if (ev === 'chat') chat.push(`${d.name}: ${d.text}`); }) as typeof g.emit;
  const me = g.join('Learner', undefined);
  startTutorial(g, me.id);
  const run = (ms: number) => { for (let t = 0; t < ms; t += 250) { vi.advanceTimersByTime(250); g.tick(); tutorialTick(g); } };
  return { g, me, chat, run };
}

describe('practice game', () => {
  it('teaches a whole game and good wins when the Imp is executed', () => {
    const { g, me, chat, run } = practice();
    expect(g.players).toHaveLength(7);
    const self = playerView(g, me).self;
    expect(!self.isStoryteller && self.tutorial?.title).toMatch(/Welcome/);
    tutorialNext(g, me.id);                                 // deal
    expect(me.characterId).toBe('empath');
    expect(g.players.find(p => p.name === 'Ada')!.characterId).toBe('imp');
    tutorialNext(g, me.id);                                 // night: info card
    expect(me.notes.at(-1)!.text).toMatch(/number is 1/);
    tutorialNext(g, me.id);                                 // day 1
    run(26_000);
    expect(chat.some(c => c.startsWith('Finn:') && /Soldier/.test(c))).toBe(true);
    expect(chat.length).toBeGreaterThanOrEqual(6);
    tutorialNext(g, me.id);                                 // private rooms
    tutorialNext(g, me.id);                                 // nominations
    const ada = g.players.find(p => p.name === 'Ada')!;
    g.nominate(me.id, ada.id);
    run(1000);
    g.setHand(me, true);
    run(40_000);
    expect(g.phase).toBe('ended');
    expect(g.winner).toBe('good');
    expect(g.tutorial!.done).toBe(true);
    expect(ada.alive).toBe(false);
  });
  it('gives a second day if the wrong player is nominated, then evil wins', () => {
    const { g, me, run } = practice();
    for (let i = 0; i < 5; i++) tutorialNext(g, me.id);
    const finn = g.players.find(p => p.name === 'Finn')!;
    g.nominate(me.id, finn.id);
    run(60_000);
    expect(g.phase).toBe('day');
    expect(g.day).toBe(2);
    expect(g.players.find(p => p.name === 'Edda')!.alive).toBe(false);
    const bram = g.players.find(p => p.name === 'Bram')!;
    g.nominate(me.id, bram.id);
    run(40_000);
    expect(g.phase).toBe('ended');
    expect(g.winner).toBe('evil');
  });
  it('only the learner can press Next', () => {
    const { g } = practice();
    tutorialNext(g, g.players[3].id);
    expect(g.phase).toBe('lobby');
  });
});

describe('bots', () => {
  it('fill seats, decline questions and vote by themselves', () => {
    const g = new Game({ name: 'Bots', visibility: 'public', stName: 'ST' });
    g.emit = () => {};
    const human = g.join('Human', undefined);
    for (let i = 0; i < 6; i++) addBot(g);
    expect(new Set(g.players.map(p => p.name)).size).toBe(7);
    g.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'monk', 'saint', 'poisoner', 'imp'] });
    g.deal(); g.reveal();
    botTick(g);
    expect(g.players.filter(p => p.bot).every(p => p.wantsQuestion === false)).toBe(true);
    expect(human.wantsQuestion).toBeNull();
    g.beginNight(); g.beginDay(); g.setStage('nominations');
    const nominee = g.players.find(p => p.bot && p.characterId !== 'virgin')!;
    g.nominate(human.id, nominee.id);
    botTick(g, () => true);
    for (const p of g.players.filter(x => x.bot)) expect(g.nomination!.hands[p.id]).toBe(true);
    expect(() => addBot(g)).toThrow(/before the game/);
  });
});
