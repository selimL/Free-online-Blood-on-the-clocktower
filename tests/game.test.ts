import { describe, it, expect, beforeEach } from 'vitest';
import { Game, SQUARE } from '../server/src/game';
import { playerView, storytellerView, evilTeamFor } from '../server/src/views';
import { VoiceManager, type RoomApi } from '../server/src/voice';
import { CHARACTER_BY_ID } from '../shared/characters';

const TB7 = ['washerwoman', 'empath', 'slayer', 'monk', 'drunk', 'poisoner', 'imp'];

function setup(n = 7, bag = TB7) {
  const g = new Game({ name: 'T', visibility: 'public', stName: 'ST' });
  const events: { audience: string[] | 'all'; event: string; payload: any }[] = [];
  g.emit = (audience, event, payload) => events.push({ audience, event, payload });
  for (let i = 0; i < n; i++) g.join(`P${i}`, undefined);
  g.updateSettings({ characters: bag });
  g.deal();
  g.reveal();
  return { g, events };
}
const byChar = (g: Game, id: string) => g.players.find(p => p.characterId === id)!;
const settle = (g: Game) => g.tick(Date.now() + 10_000);

describe('lobby & setup', () => {
  it('refuses to deal with fewer than 6 players', () => {
    const g = new Game({ name: 'x', visibility: 'public', stName: 'st' });
    for (let i = 0; i < 5; i++) g.join(`P${i}`, undefined);
    g.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'poisoner', 'imp'] });
    expect(() => g.deal()).toThrow(/at least 6/);
  });
  it('caps at 10 players', () => {
    const g = new Game({ name: 'x', visibility: 'public', stName: 'st' });
    for (let i = 0; i < 10; i++) g.join(`P${i}`, undefined);
    expect(() => g.join('eleven', undefined)).toThrow(/full/);
  });
  it('requires the bag to match the player count', () => {
    const g = new Game({ name: 'x', visibility: 'public', stName: 'st' });
    for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
    g.updateSettings({ characters: TB7.slice(0, 6) });
    expect(() => g.deal()).toThrow(/exactly 7/);
  });
  it('rooms: ceil(n/2) private rooms with floor(n/2) capacity', () => {
    const { g } = setup(7);
    const priv = g.rooms().filter(r => r.kind === 'private');
    expect(priv).toHaveLength(4);
    expect(priv[0].capacity).toBe(3);
  });
});

describe('hidden information', () => {
  let g: Game;
  beforeEach(() => { ({ g } = setup()); });

  it('no player view contains another seat\'s true character or alignment', () => {
    for (const viewer of g.players) {
      const json = JSON.stringify(playerView(g, viewer));
      for (const other of g.players) {
        if (other.id === viewer.id) continue;
        // the other player's TRUE character id must not appear unless it is also in the viewer's own legit data
        const own = new Set([viewer.shownCharacterId, ...g.settings.characters, ...g.demonBluffs, ...g.lunaticBluffs]);
        if (!own.has(other.characterId)) expect(json).not.toContain(`"${other.characterId}"`);
      }
      expect(json).not.toMatch(/"characterId":"(?!null)[^"]*","shownCharacterId"/); // grimoire never present
      expect(json).not.toContain('grimoire');
      expect(json).not.toContain('"real"');
    }
  });

  it('the Drunk sees a Townsfolk, not "drunk"', () => {
    const drunk = byChar(g, 'drunk');
    const v = playerView(g, drunk);
    expect(v.self.isStoryteller).toBe(false);
    if (!v.self.isStoryteller) {
      expect(v.self.characterId).not.toBe('drunk');
      expect(CHARACTER_BY_ID[v.self.characterId!].type).toBe('townsfolk');
    }
  });

  it('evil sees (evil) marks at 7 players; good never does', () => {
    const imp = byChar(g, 'imp');
    const poisoner = byChar(g, 'poisoner');
    const impView = playerView(g, imp);
    expect(impView.players.find(p => p.id === poisoner.id)!.evilMark).toBe(true);
    for (const p of g.players.filter(p => p.alignment === 'good')) {
      expect(playerView(g, p).players.every(x => !x.evilMark)).toBe(true);
    }
    if (!impView.self.isStoryteller) expect(impView.self.evilTeam!.bluffs).toHaveLength(3);
  });

  it('no evil info in a 6-player game (Teensyville) unless the house rule is on', () => {
    const { g: g6 } = setup(6, ['washerwoman', 'empath', 'chef', 'saint', 'poisoner', 'imp']);
    const imp = byChar(g6, 'imp');
    expect(playerView(g6, imp).players.some(p => p.evilMark)).toBe(false);
    g6.updateSettings({ houseRules: { ...g6.settings.houseRules, evilInfoSmallGames: true } });
    expect(playerView(g6, imp).players.some(p => p.evilMark)).toBe(true);
  });

  it('evil marks update live on alignment change', () => {
    const imp = byChar(g, 'imp');
    const empath = byChar(g, 'empath');
    g.setAlignment(empath.id, 'evil');
    expect(playerView(g, imp).players.find(p => p.id === empath.id)!.evilMark).toBe(true);
    expect(playerView(g, empath).players.find(p => p.id === imp.id)!.evilMark).toBe(true);
  });

  it('the Lunatic gets a fake evil team in exactly the same shape as the real Demon', () => {
    const bag = ['washerwoman', 'empath', 'chef', 'lunatic', 'poisoner', 'imp', 'monk'];
    const { g: gl } = setup(7, bag);
    const lun = byChar(gl, 'lunatic');
    const imp = byChar(gl, 'imp');
    const lv = evilTeamFor(gl, lun)!;
    const iv = evilTeamFor(gl, imp)!;
    expect(Object.keys(lv).sort()).toEqual(Object.keys(iv).sort());
    expect(lv.members[0]).toEqual({ id: lun.id, role: 'demon' });
    expect(lv.bluffs).toHaveLength(3);
    // the real evil team does not see the Lunatic as evil, the Lunatic sees no real marks unless picked as fake
    const lunView = playerView(gl, lun);
    if (!lunView.self.isStoryteller) {
      expect(lunView.self.alignment).toBe('evil');
      expect(CHARACTER_BY_ID[lunView.self.characterId!].type).toBe('demon');
    }
    const marked = lunView.players.filter(p => p.evilMark).map(p => p.id).sort();
    expect(marked).toEqual([lun.id, ...lun.fakeEvilTeam].sort());
  });

  it('sleeping players learn nothing during the night', () => {
    g.beginNight();
    const sleeper = g.players[0];
    g.kill(g.players[1].id);
    const v = playerView(g, sleeper);
    expect(v.players.find(p => p.id === g.players[1].id)!.alive).toBe(true);
    expect(v.rooms.every(r => r.occupants.length === 0)).toBe(true);
    expect(v.players.every(p => !('awake' in p))).toBe(true);
  });
});

describe('real vs bluffed abilities look identical', () => {
  it('public ability view and alerts carry no bluff marker', () => {
    const { g, events } = setup();
    g.beginNight(); g.beginDay(); g.setStage('private');
    const slayer = byChar(g, 'slayer');
    const bluffer = byChar(g, 'empath');
    const observer = byChar(g, 'washerwoman');

    g.useAbility(slayer, 'real');
    const realView = playerView(g, observer).ability!;
    const realAlerts = events.filter(e => e.event === 'alert' && /using an ability/.test(e.payload.text)).map(e => e.payload);
    settle(g);
    g.abilityTarget(slayer, observer.id); g.abilityDone(slayer);
    expect(storytellerView(g).self.isStoryteller && (storytellerView(g).self as any).pendingAbility.real).toBe(true);
    g.resolveAbility('nothing'); g.tick(Date.now() + 10_000);

    events.length = 0;
    g.useAbility(bluffer, 'claim', 'slayer');
    const bluffView = playerView(g, observer).ability!;
    const bluffAlerts = events.filter(e => e.event === 'alert' && /using an ability/.test(e.payload.text)).map(e => e.payload);
    expect(Object.keys(bluffView).sort()).toEqual(Object.keys(realView).sort());
    expect({ ...bluffView, id: '', playerId: '' }).toEqual({ ...realView, id: '', playerId: '' });
    expect(bluffAlerts.length).toBe(realAlerts.length);
    settle(g);
    g.abilityTarget(bluffer, observer.id); g.abilityDone(bluffer);
    const st = storytellerView(g).self as any;
    expect(st.pendingAbility.real).toBe(false);
    expect(st.pendingAbility.suggestion).toBe('nothing');
  });

  it('Slayer on the Demon: suggestion kill when sober, nothing when Drunk/poisoned', () => {
    const { g } = setup();
    g.beginNight(); g.beginDay(); g.setStage('private');
    const slayer = byChar(g, 'slayer');
    const imp = byChar(g, 'imp');
    g.useAbility(slayer, 'real'); settle(g);
    g.abilityTarget(slayer, imp.id); g.abilityDone(slayer);
    expect((storytellerView(g).self as any).pendingAbility.suggestion).toBe('kill');
    g.resolveAbility('kill');
    expect(imp.alive).toBe(false);
    expect(() => g.useAbility(slayer, 'real')).toThrow();

    const { g: g2 } = setup();
    g2.beginNight(); g2.beginDay(); g2.setStage('private');
    const s2 = byChar(g2, 'slayer');
    g2.setReminders(s2.id, ['Poisoned']);
    g2.useAbility(s2, 'real'); settle(g2);
    g2.abilityTarget(s2, byChar(g2, 'imp').id); g2.abilityDone(s2);
    expect((storytellerView(g2).self as any).pendingAbility.suggestion).toBe('nothing');
  });
});

describe('rooms and join delay', () => {
  it('joining players are deaf/mute for 3 s and occupants are alerted', () => {
    const { g, events } = setup();
    g.beginNight(); g.beginDay(); settle(g); g.setStage('private');
    const [a, b] = g.players;
    g.movePlayer(a, 'r0'); settle(g);
    events.length = 0;
    g.movePlayer(b, 'r0');
    expect(g.voiceTarget(b.id)).toEqual({ room: 'r0', publish: false, subscribe: false });
    const alert = events.find(e => e.event === 'alert');
    expect(alert?.audience).toEqual([a.id]);
    expect(alert?.payload.text).toBe(`${b.name} is joining…`);
    g.tick(Date.now() + 3100);
    expect(g.voiceTarget(b.id)).toEqual({ room: 'r0', publish: true, subscribe: true });
  });
  it('enforces the private room cap (joining players count)', () => {
    const { g } = setup();
    g.beginNight(); g.beginDay(); settle(g); g.setStage('private');
    for (const p of g.players.slice(0, 3)) g.movePlayer(p, 'r1');
    expect(g.canEnter(g.players[3], 'r1')).toMatch(/full/);
  });
  it('night silences everyone; waking gives a private chamber with the Storyteller', () => {
    const { g } = setup();
    g.beginNight();
    for (const p of g.players) expect(g.voiceTarget(p.id).room).toBeNull();
    const p = g.players[2];
    g.toggleWake(p.id);
    expect(g.voiceTarget(p.id)).toEqual({ room: `night:${p.id}`, publish: true, subscribe: true });
    expect(g.voiceTarget('st').room).toBe(`night:${p.id}`);
    expect(g.voiceTarget(g.players[3].id).room).toBeNull();
  });
  it('Storyteller mute removes publish permission and blocks chat', () => {
    const { g } = setup();
    g.beginNight(); g.beginDay(); settle(g);
    const p = g.players[0];
    g.toggleMute(p.id);
    expect(g.voiceTarget(p.id).publish).toBe(false);
    expect(() => g.sendChat(p.id, 'hi')).toThrow(/muted/);
  });
});

describe('nominations & voting', () => {
  it('runs sequential voting clockwise from the nominee, nominee last, with threshold and ghost votes', () => {
    const { g } = setup();
    g.beginNight(); g.kill(g.players[6].id); g.beginDay(); settle(g);
    const dead = g.players[6];
    expect(dead.alive).toBe(false);
    g.setStage('nominations');
    const [p0, p1] = g.players;
    g.nominate(p0.id, p1.id);
    expect(() => g.nominate(p0.id, g.players[3].id)).toThrow(); // stage is accusation now
    g.startDefense(); g.startVote();
    const n = g.nomination!;
    expect(n.order[0]).toBe(g.players[2].id);
    expect(n.order.at(-1)).toBe(p1.id);
    expect(n.needed).toBe(3); // ceil(6 alive / 2)
    for (const id of [g.players[2].id, g.players[3].id, dead.id]) g.setHand(g.player(id), true);
    let t = Date.now();
    while (!n.done) { t += 5000; g.tick(t); }
    expect(g.tally(n)).toBe(3);
    expect(dead.ghostVoteUsed).toBe(true);
    expect(g.aboutToDie?.playerId).toBe(p1.id);
    // same nominator can't nominate again; same nominee can't be nominated again
    expect(() => g.nominate(p0.id, g.players[4].id)).toThrow(/already nominated/);
    expect(() => g.nominate(g.players[2].id, p1.id)).toThrow(/already been nominated/);
    // a tie clears the block
    g.nominate(g.players[2].id, g.players[4].id); g.startDefense(); g.startVote();
    const n2 = g.nomination!;
    for (const id of [g.players[0].id, g.players[1].id, g.players[5].id]) g.setHand(g.player(id), true);
    while (!n2.done) { t += 5000; g.tick(t); }
    expect(g.aboutToDie).toBeNull();
    g.endDay();
    expect(g.phase).toBe('night');
  });
  it('dead players cannot nominate', () => {
    const { g } = setup();
    g.beginNight(); g.kill(g.players[0].id); g.beginDay(); g.setStage('nominations');
    expect(() => g.nominate(g.players[0].id, g.players[1].id)).toThrow(/Dead/);
  });
});

describe('voice manager', () => {
  it('mints deaf/mute tokens and raises permissions only after the join delay', async () => {
    const { g } = setup();
    const calls: any[] = [];
    const api: RoomApi = {
      updateParticipant: async (room, id, o) => { calls.push({ room, id, ...o.permission }); return {}; },
      removeParticipant: async () => ({}),
    };
    const sent: any[] = [];
    const vm = new VoiceManager([{ name: 'eu', url: 'wss://eu.example', apiKey: 'k', apiSecret: 's'.repeat(32) }], (gid, id, ev, p) => sent.push({ id, ev, p }), () => api);
    await vm.reconcile(g);
    const p = g.players[0];
    const join = sent.find(s => s.id === p.id && s.ev === 'voice:join');
    expect(join).toBeTruthy();
    const payload = JSON.parse(Buffer.from(join.p.token.split('.')[1], 'base64url').toString());
    expect(payload.video.canPublish).toBe(false);
    expect(payload.video.canSubscribe).toBe(false);
    vm.markConnected(g, p.id, join.p.room);
    await new Promise(r => setTimeout(r, 10));
    expect(calls.find(c => c.id === p.id)).toMatchObject({ canPublish: false, canSubscribe: false }); // still joining
    g.tick(Date.now() + 5000);
    await vm.reconcile(g);
    expect(calls.filter(c => c.id === p.id).at(-1)).toMatchObject({ canPublish: true, canSubscribe: true });
  });
});

describe('end of game', () => {
  it('reveals everyone\'s true characters to all players', () => {
    const { g } = setup();
    g.endGame('good');
    const v = playerView(g, g.players[0]);
    for (const p of g.players) expect(v.players.find(x => x.id === p.id)!.revealedCharacter).toBe(p.characterId);
  });
  it('pauses when the Storyteller disconnects (via setPaused) and freezes timers', () => {
    const { g } = setup();
    g.beginNight(); g.beginDay();
    const before = g.timer!.endsAt!;
    g.setPaused(true);
    g.tick(before + 1000);
    expect(g.stage).toBe('discussion');
    g.setPaused(false);
    expect(g.timer!.endsAt!).toBeGreaterThanOrEqual(before);
    expect(SQUARE).toBe('square');
  });
});
