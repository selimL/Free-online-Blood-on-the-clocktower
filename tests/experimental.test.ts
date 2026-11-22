// Experimental characters and Loric from the supplied reference.
import { describe, it, expect } from 'vitest';
import { CHARACTERS, CHARACTER_BY_ID, FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER, NIGHT_PSEUDO, parseScript, CLAIMABLE_ABILITIES } from '../shared/characters';
import { Game } from '../server/src/game';

const count = (edition: string, type: string) => CHARACTERS.filter(c => c.edition === edition && c.type === type).length;

describe('Experimental characters', () => {
  it('has every character from the reference', () => {
    expect(count('exp', 'townsfolk')).toBe(30);
    expect(count('exp', 'outsider')).toBe(11);
    expect(count('exp', 'minion')).toBe(15);
    expect(count('exp', 'demon')).toBe(10);
    expect(count('exp', 'traveller')).toBe(3);
    expect(CHARACTERS.filter(c => c.type === 'loric')).toHaveLength(11);
    for (const id of ['deusexfiasco', 'ferryman']) expect(CHARACTER_BY_ID[id].type).toBe('fabled');
    expect(new Set(CHARACTERS.map(c => c.id)).size).toBe(CHARACTERS.length);
  });
  it('night orders only name real characters', () => {
    for (const id of [...FIRST_NIGHT_ORDER, ...OTHER_NIGHT_ORDER]) expect(NIGHT_PSEUDO[id] || CHARACTER_BY_ID[id]).toBeTruthy();
  });
  it('imports scripts that use them (ids with punctuation too)', () => {
    const r = parseScript(JSON.stringify([{ id: '_meta', name: 'Exp' }, 'lil_monsta', 'al-hadikhia', 'village_idiot', { id: 'bigwig' }, 'imp']));
    expect(r.ids).toEqual(['lilmonsta', 'alhadikhia', 'villageidiot', 'bigwig', 'imp']);
    expect(r.unknown).toEqual([]);
  });
  it('Loric go with the Fabled, never in the bag', () => {
    const g = new Game({ name: 'L', visibility: 'public', stName: 'ST' });
    g.emit = () => {};
    g.updateSettings({ fabled: ['bigwig', 'ferryman'], characters: ['bigwig', 'imp'] });
    expect(g.settings.fabled).toEqual(['bigwig', 'ferryman']);
    expect(g.settings.characters).toEqual(['imp']);
  });
  it('allows a Demon-less bag with the Summoner', () => {
    const g = new Game({ name: 'S', visibility: 'public', stName: 'ST' });
    g.emit = () => {};
    for (let i = 0; i < 7; i++) g.join(`P${i}`, undefined);
    g.updateSettings({ characters: ['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'poisoner', 'summoner'] });
    expect(() => g.deal()).not.toThrow();
  });
  it('only good public abilities can be bluffed', () => {
    expect(CLAIMABLE_ABILITIES).toContain('alsaahir');
    expect(CLAIMABLE_ABILITIES).not.toContain('psychopath');
    expect(CLAIMABLE_ABILITIES).not.toContain('gangster');
  });
});
