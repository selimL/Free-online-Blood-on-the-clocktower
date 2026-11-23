// Translations. Every text in the game is written in English in the code; a language is a
// dictionary from that English text to its translation. Anything missing falls back to English.
//
// To add a language:
//   1. Copy shared/i18n/tr.ts to e.g. shared/i18n/es.ts and translate the right-hand sides.
//      Keep the {placeholders} (they are filled in with names and numbers).
//   2. Do the same for the character abilities (abilities.tr.ts) and Almanac tips (almanac.tr.ts).
//   3. Add the language to LANGUAGES and DICTS below.
// `npm test` lists any text that is still missing a translation.
import { TR } from './tr';
import { ABILITIES_TR } from './abilities.tr';
import { ALMANAC_TR } from './almanac.tr';

export type Lang = 'en' | 'tr';
export const LANGUAGES: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'tr', name: 'Türkçe' },
];
export const isLang = (v: unknown): v is Lang => LANGUAGES.some(l => l.id === v);

const DICTS: Record<Lang, Record<string, string>> = { en: {}, tr: TR };
const ABILITIES: Record<Lang, Record<string, string>> = { en: {}, tr: ABILITIES_TR };
const ALMANAC: Record<Lang, Record<string, string>> = { en: {}, tr: ALMANAC_TR };

export type Vars = Record<string, string | number | null | undefined>;
const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? '') : m)) : s);

/** Translate an English text (with optional {placeholders}) into a language. */
export function translate(lang: Lang | null | undefined, text: string, vars?: Vars): string {
  return fill((lang && DICTS[lang]?.[text]) || text, vars);
}
/** A character's ability in a language (homebrew characters keep the Storyteller's own text). */
export function abilityIn(lang: Lang | null | undefined, id: string, english: string): string {
  return (lang && ABILITIES[lang]?.[id]) || english;
}
/** An Almanac tip (keyed by its English text). */
export function almanacIn(lang: Lang | null | undefined, english: string): string {
  return (lang && ALMANAC[lang]?.[english]) || english;
}
/** For the coverage test: the dictionaries themselves. */
export const _dicts = { DICTS, ABILITIES, ALMANAC };
