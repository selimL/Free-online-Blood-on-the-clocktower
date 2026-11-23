// Every text shown in a game must have a translation in every language (they fall back to
// English otherwise). This scans the code for tr(...), this.t(...), g.t(...) and fail(...)
// and checks the data tables, then lists anything missing so it can be added to shared/i18n.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { _dicts, translate, LANGUAGES } from '../shared/i18n';
import { CHARACTERS, NIGHT_SLOTS, NIGHT_PSEUDO, GENERIC_REMINDERS, DAY_ABILITIES } from '../shared/characters';
import { HOUSE_RULE_INFO, EMOTES, WEATHERS } from '../shared/types';
import { ALMANAC, TYPE_TIPS } from '../shared/almanac';

const ROOT = path.join(import.meta.dirname, '..');
const FILES = [
  'server/src/game.ts', 'server/src/lobby.ts', 'server/src/views.ts', 'server/src/bots.ts',
  ...fs.readdirSync(path.join(ROOT, 'client/src/components')).filter(f => !/^(Lobby|Legal|AdminPage|AccountDialog|ScriptBuilder)\.tsx$/.test(f)).map(f => `client/src/components/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'client/src/three')).filter(f => f.endsWith('.tsx')).map(f => `client/src/three/${f}`),
  'client/src/nightInfo.ts', 'client/src/net.ts', 'client/src/voice.ts', 'client/src/three/occupants.ts', 'client/src/cheatSheet.ts',
];
const LIT = String.raw`("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`;
const unquote = (s: string) => (s[0] === '"' ? JSON.parse(s) : JSON.parse('"' + s.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"') + '"'));

function codeKeys(): Set<string> {
  const keys = new Set<string>();
  const direct = new RegExp(String.raw`(?:\btr|\.t|\bfail)\(\s*` + LIT, 'g');
  const ternary = new RegExp(String.raw`(?:\btr|\.t|\bfail)\([^()'"\x60]*?\?\s*` + LIT + String.raw`\s*:\s*` + LIT, 'g');
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(direct)) keys.add(unquote(m[1]));
    for (const m of src.matchAll(ternary)) { keys.add(unquote(m[1])); keys.add(unquote(m[2])); }
  }
  return keys;
}
function dataKeys(): Set<string> {
  const keys = new Set<string>();
  for (const v of Object.values(HOUSE_RULE_INFO) as { label: string; help: string }[]) { keys.add(v.label); keys.add(v.help); }
  EMOTES.forEach(e => keys.add(e.label)); WEATHERS.forEach(w => keys.add(w.label)); NIGHT_SLOTS.forEach(s => keys.add(s.label));
  Object.values(NIGHT_PSEUDO).forEach(p => { keys.add(p.name); keys.add(p.text); });
  GENERIC_REMINDERS.forEach(r => keys.add(r));
  CHARACTERS.forEach(c => (c.reminders ?? []).forEach(r => keys.add(r)));
  Object.values(DAY_ABILITIES).forEach(d => keys.add(d.prompt));
  return keys;
}

describe('translations', () => {
  const keys = [...codeKeys(), ...dataKeys()].filter(k => /[A-Za-z]/.test(k));
  for (const lang of LANGUAGES.filter(l => l.id !== 'en')) {
    it(`${lang.name}: every game text is translated`, () => {
      const missing = keys.filter(k => !_dicts.DICTS[lang.id][k]);
      expect(missing, `Add these to shared/i18n/${lang.id}.ts`).toEqual([]);
    });
    it(`${lang.name}: placeholders match`, () => {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
      const wrong = Object.entries(_dicts.DICTS[lang.id]).filter(([en, x]) => ph(en) !== ph(x)).map(([en]) => en);
      expect(wrong).toEqual([]);
    });
    it(`${lang.name}: every character ability and Almanac tip is translated`, () => {
      expect(CHARACTERS.filter(c => !_dicts.ABILITIES[lang.id][c.id]).map(c => c.id)).toEqual([]);
      const tips = new Set<string>();
      Object.values(TYPE_TIPS).forEach(t => t.forEach(x => tips.add(x)));
      Object.values(ALMANAC).forEach(e => { e.tips.forEach(x => tips.add(x)); Object.values(e.with ?? {}).forEach(x => tips.add(x)); });
      expect([...tips].filter(x => !_dicts.ALMANAC[lang.id][x])).toEqual([]);
    });
  }
  it('falls back to English and fills placeholders', () => {
    expect(translate('tr', 'Some text nobody translated {x}', { x: 1 })).toBe('Some text nobody translated 1');
    expect(translate('tr', '{name} joined.', { name: 'Ada' })).toBe('Ada katıldı.');
    expect(translate('en', '{name} joined.', { name: 'Ada' })).toBe('Ada joined.');
  });
});
