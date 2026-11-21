// Build a custom script from any edition's characters, save it, export it, and share it.
import { useMemo, useState } from 'react';
import { CHARACTERS, CHARACTER_BY_ID, EDITIONS, parseScript } from '../../../shared/characters';
import { Modal, TYPE_LABEL } from './Overlays';
import { pushAlert } from '../net';
import { saveScript, toScriptJson, shareLink, newScriptId, type SavedScript } from '../scripts';

const TYPES = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller'] as const;
// a typical full script has about this many of each
const TYPICAL: Record<string, string> = { townsfolk: '13', outsider: '4', minion: '4', demon: '4', traveller: 'optional' };

export function ScriptBuilder({ initial, onClose, onUse }: { initial?: Partial<SavedScript>; onClose: () => void; onUse?: (s: SavedScript) => void }) {
  const [id] = useState(initial?.id ?? newScriptId());
  const [name, setName] = useState(initial?.name ?? '');
  const [author, setAuthor] = useState(initial?.author ?? '');
  const [ids, setIds] = useState<string[]>(initial?.ids ?? []);
  const [filter, setFilter] = useState('');
  const [importText, setImportText] = useState('');
  const has = useMemo(() => new Set(ids), [ids]);
  const toggle = (cid: string) => setIds(list => (list.includes(cid) ? list.filter(x => x !== cid) : [...list, cid]));
  const count = (t: string) => ids.filter(x => CHARACTER_BY_ID[x]?.type === t).length;
  const script: SavedScript = { id, name: name.trim() || 'Untitled script', author: author.trim(), ids, updated: Date.now() };
  const problems = [
    !ids.some(x => CHARACTER_BY_ID[x]?.type === 'demon') && 'a Demon',
    !ids.some(x => CHARACTER_BY_ID[x]?.type === 'minion') && 'a Minion',
    count('townsfolk') < 5 && 'at least 5 Townsfolk',
  ].filter(Boolean) as string[];
  const save = () => { saveScript(script); pushAlert(`Saved “${script.name}” to My scripts.`, 'info'); };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toScriptJson(script)], { type: 'application/json' }));
    a.download = `${script.name.replace(/[^\w-]+/g, '_')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const share = async () => {
    const link = shareLink(script);
    try { await navigator.clipboard.writeText(link); pushAlert('Share link copied. Anyone who opens it can save this script.', 'info'); }
    catch { prompt('Copy this link:', link); }
  };
  const importJson = () => {
    try {
      const r = parseScript(importText);
      if (!r.ids.length) return pushAlert('No known characters in that JSON.', 'error');
      setIds(r.ids); if (r.name) setName(r.name);
      setImportText('');
      pushAlert(`Imported ${r.ids.length} characters${r.unknown.length ? ` (${r.unknown.length} not supported here)` : ''}.`, 'info');
    } catch (e) { pushAlert(`Could not read that JSON: ${(e as Error).message}`, 'error'); }
  };
  const q = filter.trim().toLowerCase();
  return (
    <Modal title="📜 Script builder" onClose={onClose} wide>
      <div className="row">
        <label className="field">Script name<input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="e.g. Midnight in the Ravenswood" /></label>
        <label className="field">Author<input value={author} maxLength={40} onChange={e => setAuthor(e.target.value)} placeholder="optional" /></label>
        <label className="field">Find<input value={filter} onChange={e => setFilter(e.target.value)} placeholder="name or ability" /></label>
      </div>
      <p className="muted small">Pick characters from any edition. {TYPES.map(t => `${TYPE_LABEL[t]}: ${count(t)} (typical ${TYPICAL[t]})`).join(' · ')}</p>
      <div className="sb-grid">
        {TYPES.map(t => (
          <section key={t} className={`sb-col ${t}`}>
            <h3>{TYPE_LABEL[t]} <span className="muted small">{count(t)}</span></h3>
            {CHARACTERS.filter(c => c.type === t && (!q || `${c.name} ${c.ability}`.toLowerCase().includes(q))).map(c => (
              <label key={c.id} className={`sb-char ${has.has(c.id) ? 'on' : ''}`} title={c.ability}>
                <input type="checkbox" checked={has.has(c.id)} onChange={() => toggle(c.id)} /> {c.name}
                <span className="sb-ed">{c.edition === 'tb' ? 'TB' : c.edition === 'bmr' ? 'BMR' : c.edition === 'snv' ? 'S&V' : ''}</span>
              </label>
            ))}
          </section>
        ))}
      </div>
      <details className="sb-import"><summary>Import from JSON</summary>
        <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder='[{"id":"_meta","name":"My script"},"washerwoman","imp"]' aria-label="Script JSON" />
        <button className="btn small" onClick={importJson}>Import</button>
      </details>
      {problems.length > 0 && <p className="warn small">A playable script needs {problems.join(', ')}.</p>}
      <div className="row end">
        <button className="btn ghost" onClick={() => setIds([])} disabled={!ids.length}>Clear</button>
        <button className="btn ghost" onClick={download} disabled={!ids.length}>⬇ Export JSON</button>
        <button className="btn ghost" onClick={share} disabled={!ids.length}>🔗 Copy share link</button>
        <button className="btn" onClick={save} disabled={!ids.length}>💾 Save to My scripts</button>
        {onUse && <button className="btn primary" disabled={problems.length > 0} onClick={() => { saveScript(script); onUse(script); onClose(); }}>Use in this game</button>}
      </div>
      <p className="muted small">Editions: {Object.values(EDITIONS).join(', ')}. Saved scripts live in this browser.</p>
    </Modal>
  );
}
