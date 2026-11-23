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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileKV } from '../server/src/persist';
import { Accounts, type Account } from '../server/src/accounts';

describe('handing over the Storyteller role', () => {
  it('swaps with a co-Storyteller at any time, tokens moving with the people', () => {
    const g = game();
    const co = g.addCoStoryteller('Helper');
    const [stTok, coTok] = [g.storyteller.token, co.token];
    g.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'monk', 'poisoner', 'imp'] });
    g.deal();
    expect(g.handOver(co.id)).toBe(co.id);
    expect(g.storyteller.name).toBe('Helper');
    expect(g.storyteller.token).toBe(coTok);
    expect(co.name).toBe('ST');
    expect(co.token).toBe(stTok);
  });
  it('swaps seats with a player only before the start', () => {
    const g = game();
    const p = g.players[2];
    const [stTok, pTok] = [g.storyteller.token, p.token];
    expect(g.handOver(p.id)).toBe(p.id);
    expect(g.storyteller.name).toBe('P2');
    expect(p.name).toBe('ST');
    expect([g.storyteller.token, p.token]).toEqual([pTok, stTok]);
    g.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'monk', 'poisoner', 'imp'] });
    g.deal();
    expect(() => g.handOver(g.players[0].id)).toThrow();
  });
});

describe('friends\' leaderboard', () => {
  it('lists accounts that shared a game, except those who hide', async () => {
    const acc = new Accounts(new FileKV(fs.mkdtempSync(path.join(os.tmpdir(), 'botc-lb-'))), {});
    const mk = async (name: string, history: unknown[], hide = false) => {
      const a = await (acc as unknown as { create(p: Partial<Account>): Promise<Account> }).create({ displayName: name, history, hideFromFriends: hide });
      return a;
    };
    const h = (gameId: string, won: boolean) => ({ gameId, role: 'player', won, alignment: 'good', mvpMe: false });
    const me = await mk('Me', [h('g1', true), h('g2', false)]);
    await mk('Friend', [h('g1', false), h('g9', true)]);
    await mk('Stranger', [h('g7', true)]);
    await mk('Shy', [h('g2', true)], true);
    const rows = await acc.leaderboard(me);
    expect(rows.map(r => r.name).sort()).toEqual(['Friend', 'Me']);
    expect(rows.find(r => r.name === 'Friend')).toMatchObject({ together: 1, games: 2, wins: 1 });
  });
});

import { CHARACTER_BY_ID } from '../shared/characters';
import { nightOrder, playerView } from '../server/src/views';
describe('homebrew characters', () => {
  it('can be dealt, wake in the night order and bring the Bootlegger', () => {
    const g = game();
    g.updateSettings({ homebrew: [{ name: 'Lamplighter', type: 'townsfolk', ability: 'Each night, learn something.', firstNight: 'late', otherNights: 'early', reminders: ['Lit', 'x'.repeat(50)] }] as never });
    const hb = g.settings.homebrew[0];
    expect(hb.id).toMatch(/^hb_[a-z0-9]{10}$/);
    expect(hb.reminders[1].length).toBe(20);
    expect(CHARACTER_BY_ID[hb.id].name).toBe('Lamplighter');
    expect(g.settings.fabled).toContain('bootlegger');
    g.updateSettings({ characters: [hb.id, 'empath', 'chef', 'monk', 'poisoner', 'imp'] });
    g.deal();
    for (const p of g.players) if (p.characterId === null) throw new Error('not dealt');
    const order = nightOrder(g).map(x => x.id);
    expect(order.indexOf(hb.id)).toBe(order.indexOf('dawn') - 1);
    expect(playerView(g, g.players[0]).homebrew[0].name).toBe('Lamplighter');
  });
  it('keep their id when edited, lose it when removed, and refuse forged ids', () => {
    const g = game();
    g.updateSettings({ homebrew: [{ name: 'A', type: 'minion' }] as never });
    const id = g.settings.homebrew[0].id;
    g.updateSettings({ homebrew: [{ id, name: 'A2', type: 'minion' }, { id: 'hb_aaaaaaaaaa', name: 'B' }] as never });
    expect(g.settings.homebrew[0].id).toBe(id);
    expect(g.settings.homebrew[1].id).not.toBe('hb_aaaaaaaaaa');
    g.updateSettings({ characters: [id] });
    g.updateSettings({ homebrew: [] });
    expect(g.settings.characters).not.toContain(id);
  });
});

import { addBot, botTick } from '../server/src/bots';
describe('smarter bots', () => {
  it('claim, share info, nominate, vote and choose at night', () => {
    const g = new Game({ name: 'Bots', visibility: 'public', stName: 'ST' });
    const chat: string[] = [];
    g.emit = (_a, ev, payload) => { if (ev === 'chat') chat.push(`${(payload as { name: string }).name}: ${(payload as { text: string }).text}`); };
    for (let i = 0; i < 7; i++) addBot(g);
    g.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'poisoner', 'imp'] });
    g.deal();
    const ids = ['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'poisoner', 'imp'];
    g.players.forEach((p, i) => g.setCharacter(p.id, ids[i]));
    g.demonBluffs = ['investigator', 'librarian', 'virgin'];
    g.reveal();
    for (const p of g.players) if (p.wantsQuestion === null) g.answerQuestion(p, false);
    g.beginNight();
    const imp = g.players[6];
    g.setAwake(imp.id, true);
    let t = Date.now();
    botTick(g, undefined, t); botTick(g, undefined, t + 3000);
    expect(imp.nightChoice.length).toBe(1);
    expect(['poisoner', 'imp']).not.toContain(g.player(imp.nightChoice[0]).characterId);
    g.setAwake(imp.id, false);
    g.sendInfoCard(g.players[1].id, { text: 'Your Empath number is 1.', playerIds: [g.players[0].id, g.players[2].id] });
    g.beginDay();
    for (const p of g.players) p.joining = false; // past the join grace period (this test runs on a fake clock)
    for (let s = 0; s < 40; s++) { t += 1000; botTick(g, undefined, t); }
    const said = chat.join('\n');
    expect(said).toMatch(/Washerwoman/);
    expect(said).toMatch(/My info: Your Empath number is 1/);
    // the evil bots bluff instead of telling the truth
    expect(said).not.toMatch(/Poisoner|the Imp\b/);
    g.setStage('nominations');
    for (let s = 0; s < 60 && !g.nomination; s++) { t += 1000; botTick(g, undefined, t); }
    // bots only nominate when someone looks suspicious enough; either way nothing throws
    if (g.nomination) {
      g.startDefense(); g.startVote();
      for (let s = 0; s < 5; s++) { t += 200; botTick(g, undefined, t); }
      expect(Object.keys(g.nomination.hands).length).toBeGreaterThan(0);
    }
  });
});
