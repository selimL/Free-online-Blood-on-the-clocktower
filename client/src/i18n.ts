// The game screens speak the game's language (chosen by the Storyteller). Outside a game
// (lobby, accounts, admin) everything is English.
import { translate, abilityIn, almanacIn, type Vars } from '../../shared/i18n';
import { CHARACTER_BY_ID } from '../../shared/characters';

import type { Lang } from '../../shared/i18n';

// net.ts tells us where to read the current game's language (no import back, to keep this light)
let currentLang: () => Lang = () => 'en';
export function bindLanguage(fn: () => Lang) { currentLang = fn; }
export const gameLang = () => currentLang();
/** Translate an English UI text into the game's language. */
export function tr(text: string, vars?: Vars): string { return translate(gameLang(), text, vars); }
/** A character's ability in the game's language. */
export function ability(id: string): string {
  const c = CHARACTER_BY_ID[id];
  if (!c) return '';
  return c.edition === 'homebrew' ? c.ability : abilityIn(gameLang(), id, c.ability);
}
/** An Almanac tip in the game's language. */
export const tip = (english: string) => almanacIn(gameLang(), english);
