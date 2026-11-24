// Storyteller helpers: undo snapshots, suggested night information and kill warnings.
import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game';
import { encode, decode } from '../server/src/persist';
import { storytellerView } from '../server/src/views';
import { suggestInfo, killWarnings, impairment } from '../client/src/nightInfo';

// seats 0..6: empath, imp, chef, washerwoman, poisoner, monk, soldier
function setup() {
  const g = new Game({ name: 'H', visibility: 'public', stName: 'ST' });
  g.emit = () => {};
  for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
  const cast = ['empath', 'imp', 'chef', 'washerwoman', 'poisoner', 'monk', 'soldier'];
  g.updateSettings({ characters: cast });
  g.deal();
  cast.forEach((c, i) => g.setCharacter(g.players[i].id, c));
  g.reveal();
  return g;
}

describe('undo', () => {
  it('restores the game to just before an action, keeping connections', () => {
    const g = setup();
    g.beginNight(); g.beginDay();
    const snap = encode(g.toJSON());
    const victim = g.players[2];
    g.kill(victim.id);
    g.players[3].connected = false;
    expect(victim.alive).toBe(false);
    g.restoreSnapshot(decode(snap), 5000);
    expect(g.players[2].alive).toBe(true);
    expect(g.players[3].connected).toBe(false); // connection state is kept, not rolled back
    expect(g.phase).toBe('day');
  });
  it('shifts a running timer so it resumes where it was', () => {
    const g = setup();
    g.beginNight(); g.beginDay();
    const endsAt = g.timer!.endsAt!;
    const snap = encode(g.toJSON());
    g.restoreSnapshot(decode(snap), 60_000);
    expect(g.timer!.endsAt).toBe(endsAt + 60_000);
  });
  it('refuses when someone joined or left since', () => {
    const g = new Game({ name: 'H', visibility: 'public', stName: 'ST' });
    g.emit = () => {};
    for (let i = 0; i < 5; i++) g.join(`P${i}`, undefined);
    const snap = encode(g.toJSON());
    g.join('Late', undefined);
    expect(() => g.restoreSnapshot(decode(snap), 1000)).toThrow(/joined or left/);
  });
});

describe('suggested night information', () => {
  it('works out the Chef and Empath numbers from the seating', () => {
    const g = setup();
    const v = storytellerView(g);
    const [empath, , chef] = g.players;
    expect(suggestInfo('chef', chef.id, v)!.value).toBe(0);           // imp (1) and poisoner (4) are not neighbours
    expect(suggestInfo('empath', empath.id, v)!.value).toBe(1);       // neighbours: soldier (6, good) and imp (1, evil)
    g.kill(g.players[1].id);                                            // the imp dies: next living neighbour is the chef
    expect(suggestInfo('empath', empath.id, storytellerView(g))!.value).toBe(0);
  });
  it('gives the Washerwoman a real Townsfolk among two players', () => {
    const g = setup();
    const ww = g.players[3];
    for (let i = 0; i < 20; i++) {
      const s = suggestInfo('washerwoman', ww.id, storytellerView(g))!;
      const [a, b] = s.card!.playerIds!;
      const c = s.card!.characterIds![0];
      expect([a, b]).not.toContain(ww.id);
      expect([a, b].some(id => g.player(id).characterId === c)).toBe(true);
      expect(['empath', 'chef', 'monk', 'soldier']).toContain(c);
    }
  });
  it('answers the Fortune Teller from their choice and the red herring', () => {
    const g = setup();
    g.beginNight();
    const ft = g.players[0];
    ft.characterId = 'fortuneteller';
    ft.nightChoice = [g.players[2].id, g.players[3].id];
    expect(suggestInfo('fortuneteller', ft.id, storytellerView(g))!.value).toBe('no');
    g.players[3].reminders = ['Red herring'];
    expect(suggestInfo('fortuneteller', ft.id, storytellerView(g))!.value).toBe('yes');
    ft.nightChoice = [g.players[1].id, g.players[2].id];
    expect(suggestInfo('fortuneteller', ft.id, storytellerView(g))!.value).toBe('yes');
  });
  it('tells the Undertaker who was executed', () => {
    const g = setup();
    g.beginNight(); g.beginDay();
    g.execute(g.players[2].id);
    g.endDay();
    const s = suggestInfo('undertaker', g.players[0].id, storytellerView(g))!;
    expect(s.card!.characterIds).toEqual(['chef']);
  });
  it('flags impaired players and impossible kills', () => {
    const g = setup();
    g.beginNight();
    g.players[0].reminders = ['Poisoned'];
    const v = storytellerView(g);
    expect(impairment(v.self.isStoryteller ? v.self.grimoire[0] : undefined)).toMatch(/poisoned/);
    expect(killWarnings(g.players[6].id, v).join()).toMatch(/Soldier/);
    g.players[2].reminders = ['Protected'];
    expect(killWarnings(g.players[2].id, storytellerView(g)).join()).toMatch(/protected/);
    expect(killWarnings(g.players[3].id, storytellerView(g))).toEqual([]);
  });
});

describe('dawn recap', () => {
  it('summarises the night deaths and yesterday\'s execution', () => {
    const g = setup();
    g.beginNight(); g.kill(g.players[2].id); g.beginDay();
    expect(g.dawnRecap).toEqual({ day: 1, died: [g.players[2].id], executed: null, exiled: [] });
    g.execute(g.players[4].id);
    g.endDay(); g.beginDay();
    expect(g.dawnRecap).toEqual({ day: 2, died: [], executed: g.players[4].id, exiled: [] });
  });
});

describe('more night information', () => {
  it('Oracle, Seamstress, Village Idiot, Noble, Knight and Shugenja', () => {
    const g = setup();
    g.beginNight();
    const me = g.players[0];
    g.players[4].alive = false; // the poisoner (evil) is dead
    expect(suggestInfo('oracle', me.id, storytellerView(g))!.value).toBe(1);
    me.nightChoice = [g.players[2].id, g.players[3].id]; // chef & washerwoman: both good
    expect(suggestInfo('seamstress', me.id, storytellerView(g))!.value).toBe('yes');
    me.nightChoice = [g.players[1].id, g.players[3].id]; // imp & washerwoman
    expect(suggestInfo('seamstress', me.id, storytellerView(g))!.value).toBe('no');
    me.nightChoice = [g.players[1].id];
    expect(suggestInfo('villageidiot', me.id, storytellerView(g))!.card!.text).toMatch(/evil/);
    for (let i = 0; i < 10; i++) {
      const noble = suggestInfo('noble', me.id, storytellerView(g))!.card!.playerIds!;
      expect(noble.filter(id => g.player(id).alignment === 'evil').length).toBe(1);
      const knight = suggestInfo('knight', me.id, storytellerView(g))!.card!.playerIds!;
      expect(knight.some(id => g.player(id).characterId === 'imp')).toBe(false);
    }
    // seat 0's nearest evil player: the imp in seat 1 (one step)
    expect(suggestInfo('shugenja', me.id, storytellerView(g))!.card!.text).toBeTruthy();
  });
  it('Flower Girl and Town Crier read today\'s votes and nominations', () => {
    const g = setup();
    g.beginNight(); g.beginDay();
    g.voteHistory.push({ day: g.day, nominatorId: g.players[4].id, nomineeId: g.players[2].id, exile: false, yes: [g.players[1].id], votes: 1, needed: 4, result: '' });
    const v = storytellerView(g);
    expect(suggestInfo('flowergirl', g.players[0].id, v)!.value).toBe('yes'); // the imp voted
    expect(suggestInfo('towncrier', g.players[0].id, v)!.value).toBe('yes');  // the poisoner nominated
  });
});

import { FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER, NIGHT_PSEUDO } from '../shared/characters';
describe('night helper coverage', () => {
  it('has information or instructions for every character that wakes at night', () => {
    const g = setup();
    const v1 = storytellerView(g);
    g.beginNight(); g.beginDay(); g.beginNight();
    const v2 = storytellerView(g);
    const me = g.players[0].id;
    const ids = [...new Set([...FIRST_NIGHT_ORDER, ...OTHER_NIGHT_ORDER])].filter(id => !NIGHT_PSEUDO[id]);
    const missing = ids.filter(id => !suggestInfo(id, me, v1) && !suggestInfo(id, me, v2));
    expect(missing).toEqual([]);
  });
});

describe('night order', () => {
  it('protections and poison come before the Demon on other nights', () => {
    const at = (id: string) => OTHER_NIGHT_ORDER.indexOf(id);
    for (const before of ['poisoner', 'monk', 'innkeeper', 'devilsadvocate', 'exorcist', 'sailor', 'gambler'])
      expect(at(before), before).toBeLessThan(at('imp'));
    expect(at('ravenkeeper')).toBeGreaterThan(at('imp'));
    expect(new Set(OTHER_NIGHT_ORDER).size).toBe(OTHER_NIGHT_ORDER.length);
  });
});
