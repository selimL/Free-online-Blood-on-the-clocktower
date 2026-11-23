// The Almanac: every character's ability, when they wake, tips, and how they affect others.
import { useMemo, useState } from 'react';
import { CHARACTERS, CHARACTER_BY_ID, EDITION_NAMES, FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER, NIGHT_PSEUDO } from '../../../shared/characters';
import { ALMANAC, TYPE_TIPS } from '../../../shared/almanac';
import { Modal, CharacterToken, TYPE_LABEL } from './Overlays';
import { tr, tip } from '../i18n';

const EDITION_LABEL: Record<string, string> = EDITION_NAMES;
const realOrder = (order: string[]) => order.filter(id => !NIGHT_PSEUDO[id]);
const FIRST = realOrder(FIRST_NIGHT_ORDER), OTHER = realOrder(OTHER_NIGHT_ORDER);

export function Almanac({ onClose, initial, inPlay }: { onClose: () => void; initial?: string | null; inPlay?: string[] }) {
  const [sel, setSel] = useState<string | null>(initial ?? null);
  const [q, setQ] = useState('');
  const [ed, setEd] = useState<string>(inPlay?.length ? 'play' : 'tb');
  const list = useMemo(() => CHARACTERS.filter(c =>
    (ed === 'all' || (ed === 'play' ? inPlay?.includes(c.id) : c.edition === ed))
    && (!q.trim() || `${c.name} ${c.ability}`.toLowerCase().includes(q.trim().toLowerCase()))), [q, ed, inPlay]);
  const ch = sel ? CHARACTER_BY_ID[sel] : null;
  return (
    <Modal title={tr("📚 Almanac")} onClose={onClose} wide>
      <div className="almanac">
        <div className="alm-list">
          <div className="row">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={tr("Search characters or abilities…")} aria-label={tr("Search the almanac")} />
            <select value={ed} onChange={e => setEd(e.target.value)} aria-label={tr("Edition")}>
              {inPlay?.length ? <option value="play">{tr("On this game's list")}</option> : null}
              {Object.entries(EDITION_LABEL).map(([id, n]) => <option key={id} value={id}>{tr(n)}</option>)}
              <option value="all">{tr("All characters")}</option>
            </select>
          </div>
          <ul>
            {list.map(c => (
              <li key={c.id}><button className={`alm-item ${c.type} ${sel === c.id ? 'on' : ''}`} onClick={() => setSel(c.id)}>
                <b>{c.name}</b> <span className="muted small">{tr(TYPE_LABEL[c.type])}</span>
              </button></li>
            ))}
            {list.length === 0 && <li className="muted small">{tr("Nothing matches.")}</li>}
          </ul>
        </div>
        <div className="alm-detail">
          {!ch ? <p className="muted">{tr("Choose a character to read about it.")}</p> : <>
            <CharacterToken ch={ch} />
            <p className="muted small">{tr(EDITION_LABEL[ch.edition])} · {tr(TYPE_LABEL[ch.type])}
              {FIRST.includes(ch.id) && <> {tr("· wakes on the first night (#")}{FIRST.indexOf(ch.id) + 1})</>}
              {OTHER.includes(ch.id) && <> {tr("· wakes on other nights (#")}{OTHER.indexOf(ch.id) + 1})</>}
              {!FIRST.includes(ch.id) && !OTHER.includes(ch.id) && ch.type !== 'fabled' && ch.type !== 'loric' && <> {tr("· does not wake at night")}</>}
            </p>
            {ch.setup && <p><b>{tr("Setup:")}</b> {ch.setup}</p>}
            <h3>{tr("Tips")}</h3>
            <ul>{(ALMANAC[ch.id]?.tips ?? TYPE_TIPS[ch.type]).map((t, i) => <li key={i}>{tip(t)}</li>)}</ul>
            {ALMANAC[ch.id]?.with && <>
              <h3>{tr("Works with and against")}</h3>
              <ul>{Object.entries(ALMANAC[ch.id].with!).map(([id, t]) => <li key={id}><button className="linkish" onClick={() => setSel(id)}>{CHARACTER_BY_ID[id]?.name ?? id}</button>: {tip(t)}</li>)}</ul>
            </>}
            {!ALMANAC[ch.id] && <p className="muted small">{tr("General advice for")}{' '}{tr(TYPE_LABEL[ch.type])} {tr("characters.")}</p>}
          </>}
        </div>
      </div>
    </Modal>
  );
}
