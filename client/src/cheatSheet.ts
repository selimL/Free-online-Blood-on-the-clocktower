// A printable one-page summary of the script for the Storyteller: every character with its
// ability, the first-night and other-night order, and the jinxes. Opens a print-ready page
// (the browser's "Save as PDF" makes it a PDF).
import type { Settings } from '../../shared/types';
import { CHARACTERS, CHARACTER_BY_ID, NIGHT_PSEUDO, nightOrderWith, type CharacterType } from '../../shared/characters';
import { jinxesFor } from '../../shared/jinxes';
import { tr, ability } from './i18n';

const TYPES: CharacterType[] = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller', 'fabled', 'loric'];
const TYPE_NAME: Record<CharacterType, string> = { townsfolk: 'Townsfolk', outsider: 'Outsider', minion: 'Minion', demon: 'Demon', traveller: 'Traveller', fabled: 'Fabled', loric: 'Loric' };
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The characters on this game's script (or edition), plus homebrew and Fabled/Loric in play. */
export function scriptIds(settings: Settings): string[] {
  const base = settings.script.length ? settings.script
    : CHARACTERS.filter(c => ['townsfolk', 'outsider', 'minion', 'demon'].includes(c.type) && (settings.edition === 'custom' ? settings.characters.includes(c.id) : c.edition === settings.edition)).map(c => c.id);
  return [...new Set([...base, ...settings.characters, ...(settings.homebrew ?? []).map(h => h.id), ...settings.fabled])].filter(id => CHARACTER_BY_ID[id]);
}

export function openCheatSheet(gameName: string, settings: Settings) {
  const ids = scriptIds(settings);
  const inScript = new Set(ids);
  const order = (first: boolean) => nightOrderWith(first, settings.homebrew).filter(id => inScript.has(id) || (NIGHT_PSEUDO[id] && id !== 'dusk' && id !== 'dawn'));
  const step = (id: string) => NIGHT_PSEUDO[id] ? `<li class="pseudo">${esc(tr(NIGHT_PSEUDO[id].name))}</li>` : `<li>${esc(CHARACTER_BY_ID[id].name)}</li>`;
  const groups = TYPES.map(t => {
    const list = ids.filter(id => CHARACTER_BY_ID[id].type === t);
    if (!list.length) return '';
    return `<h2>${esc(tr(TYPE_NAME[t]))}</h2><dl>${list.map(id => `<dt>${esc(CHARACTER_BY_ID[id].name)}</dt><dd>${esc(ability(id))}</dd>`).join('')}</dl>`;
  }).join('');
  const jinxes = jinxesFor(ids, settings.customJinxes ?? []);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(tr('Cheat sheet'))}: ${esc(settings.scriptName || gameName)}</title>
<style>
  body { font: 11pt/1.35 Georgia, serif; color: #1d1712; margin: 1.4cm; }
  h1 { font-size: 18pt; margin: 0 0 .2cm; } h2 { font-size: 12pt; margin: .45cm 0 .15cm; border-bottom: 1px solid #b9a37a; text-transform: uppercase; letter-spacing: .05em; }
  dl { margin: 0; display: grid; grid-template-columns: 3.6cm 1fr; gap: .08cm .3cm; } dt { font-weight: bold; } dd { margin: 0; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: .8cm; } ol { margin: 0; padding-left: .6cm; columns: 2; } .pseudo { font-style: italic; color: #6b5a3a; }
  .jinx { margin: .05cm 0; } .muted { color: #6b5a3a; font-size: 9pt; }
  @media print { button { display: none; } h2 { break-after: avoid; } }
</style></head><body>
<button onclick="print()" style="float:right">🖨 ${esc(tr('Print / save as PDF'))}</button>
<h1>${esc(settings.scriptName || gameName)}</h1>
<p class="muted">${esc(tr('Storyteller cheat sheet · Clocktower Nights · abilities are paraphrased summaries'))}</p>
${groups}
<div class="cols">
  <section><h2>${esc(tr('First night'))}</h2><ol>${order(true).map(step).join('')}</ol></section>
  <section><h2>${esc(tr('Other nights'))}</h2><ol>${order(false).map(step).join('')}</ol></section>
</div>
${jinxes.length ? `<h2>${esc(tr('Jinxes'))}</h2>${jinxes.map(j => `<p class="jinx"><b>${esc(CHARACTER_BY_ID[j.a]?.name ?? j.a)} & ${esc(CHARACTER_BY_ID[j.b]?.name ?? j.b)}:</b> ${esc(j.text)}</p>`).join('')}` : ''}
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
