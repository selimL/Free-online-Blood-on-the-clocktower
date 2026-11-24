// Live warnings while the Storyteller fills the bag. Suggestions only: the Storyteller may
// break any of them on purpose. Each warning is an English template with values (translated
// where it is shown).
import { CHARACTER_BY_ID, SETUP_COUNTS } from './characters';

export interface SetupWarning { text: string; vars?: Record<string, string | number> }

/** How a character changes the usual number of Outsiders: [min change, max change]. */
const OUTSIDER_MOD: Record<string, [number, number]> = {
  baron: [2, 2], godfather: [-1, 1], fanggu: [1, 1], vigormortis: [-1, -1], balloonist: [0, 1], hermit: [-1, 0],
  kazali: [-9, 9], lordoftyphon: [-9, 9], xaan: [-9, 9], sentinel: [-1, 1], summoner: [0, 0],
};
const INFO = new Set(['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'undertaker', 'ravenkeeper',
  'grandmother', 'clockmaker', 'dreamer', 'seamstress', 'oracle', 'flowergirl', 'towncrier', 'mathematician', 'savant', 'chambermaid',
  'noble', 'knight', 'steward', 'shugenja', 'balloonist', 'villageidiot', 'king', 'sage', 'juggler', 'artist', 'bountyhunter',
  'highpriestess', 'general', 'nightwatchman', 'amnesiac', 'fisherman', 'acrobat', 'pixie', 'cultleader', 'preacher']);

export function setupWarnings(bag: string[], residents: number): SetupWarning[] {
  const out: SetupWarning[] = [];
  if (residents < 5 || !bag.length) return out;
  const type = (id: string) => CHARACTER_BY_ID[id]?.type;
  const count = (t: string) => bag.filter(id => type(id) === t).length;
  const has = (id: string) => bag.includes(id);
  const [, outs, mins] = SETUP_COUNTS[Math.min(15, residents)];
  const demons = count('demon'), minions = count('minion'), outsiders = count('outsider');
  if (bag.length !== residents) return out; // the counts below only make sense for a full bag
  if (demons === 0 && !has('summoner') && !has('atheist')) out.push({ text: 'There is no Demon in the bag.' });
  if (demons > 1 && !has('legion') && !has('riot')) out.push({ text: 'There are {n} Demons in the bag. Normally there is exactly one.', vars: { n: demons } });
  if (has('atheist') && (demons || minions)) out.push({ text: 'The Atheist means there are no evil players, but the bag has Minions or a Demon.' });
  // Minions: Lil' Monsta and Lord of Typhon add one
  const extraMinions = (has('lilmonsta') ? 1 : 0) + (has('lordoftyphon') ? 1 : 0);
  if (!has('legion') && !has('atheist') && minions !== mins + extraMinions) out.push({ text: 'For {players} players the usual number of Minions is {n} (the bag has {have}).', vars: { players: residents, n: mins + extraMinions, have: minions } });
  // Outsiders, adjusted by setup characters
  if (!has('legion') && !has('atheist')) {
    let lo = outs, hi = outs;
    const why: string[] = [];
    for (const id of bag) { const m = OUTSIDER_MOD[id]; if (m) { lo += m[0]; hi += m[1]; why.push(CHARACTER_BY_ID[id].name); } }
    lo = Math.max(0, lo);
    if (outsiders < lo || outsiders > hi) {
      const range = lo === hi ? String(lo) : `${lo}–${hi}`;
      out.push(why.length
        ? { text: 'With {chars}, you would normally have {range} Outsiders (the bag has {have}).', vars: { chars: why.join(', '), range, have: outsiders } }
        : { text: 'For {players} players the usual number of Outsiders is {range} (the bag has {have}).', vars: { players: residents, range, have: outsiders } });
    }
  }
  // information for the good team
  const info = bag.filter(id => INFO.has(id)).length;
  if (count('townsfolk') >= 3 && info < 2) out.push({ text: 'Only {n} information character(s) for the good team: the game may be very hard for good.', vars: { n: info } });
  if (has('drunk') && count('townsfolk') === 0) out.push({ text: 'The Drunk thinks they are a Townsfolk, but there are no Townsfolk in the bag to copy.' });
  return out;
}
