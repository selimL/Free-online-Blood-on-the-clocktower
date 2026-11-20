import { useEffect, useMemo, useState } from 'react';
import type { GameView, StorytellerSelf, Settings, HouseRules, Timers } from '../../../shared/types';
import { HOUSE_RULE_INFO, MIN_PLAYERS, NUMERIC_HOUSE_RULES } from '../../../shared/types';
import {
  CHARACTERS, CHARACTER_BY_ID, SETUP_COUNTS, EDITIONS, GENERIC_REMINDERS, parseScript, type CharacterType,
} from '../../../shared/characters';
import { act } from '../net';
import { Modal, TYPE_LABEL } from './Overlays';
import { Chat, Announcements } from './GameScreen';

const st = (v: GameView) => v.self as StorytellerSelf;
const TYPES: CharacterType[] = ['townsfolk', 'outsider', 'minion', 'demon'];

export function StorytellerControls({ view }: { view: GameView }) {
  const self = st(view);
  const residents = view.players.filter(p => !p.traveller).length;
  const bag = self.settings.characters.length;
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';
  const timerBtns = view.timer && <>
    <button className="btn small ghost" onClick={() => act('st:skipTimer')}>⏭ End timer</button>
    <button className="btn small ghost" onClick={() => act('st:addTime', { seconds: 30 })}>+30s</button>
  </>;
  const pause = view.phase !== 'lobby' && view.phase !== 'ended' &&
    <button className="btn small ghost" onClick={() => act('st:pause', { paused: !view.paused })}>{view.paused ? '▶ Resume' : '⏸ Pause'}</button>;
  switch (view.phase) {
    case 'lobby': {
      const problem = residents < MIN_PLAYERS ? `Need ${MIN_PLAYERS - residents} more player(s)` : bag !== residents ? `Select ${residents} characters (have ${bag})` : null;
      return <div className="st-controls"><button className="btn primary" disabled={!!problem} onClick={() => act('st:deal')}>Deal characters</button>{problem && <span className="muted small">{problem}</span>}</div>;
    }
    case 'dealt':
      return <div className="st-controls">
        <span className="muted small">Review the Grimoire, then:</span>
        <button className="btn ghost" onClick={() => act('st:deal')}>Re-deal</button>
        <button className="btn primary" onClick={() => act('st:reveal')}>Reveal characters &amp; take questions</button>
      </div>;
    case 'questions':
      return <div className="st-controls">
        <button className="btn" onClick={() => act('st:nextQuestion')}>{view.questions.currentId ? 'Next player' : `Start questions (${view.questions.queue.length} waiting)`}</button>
        {timerBtns}
        <button className="btn primary" onClick={() => act('st:night')}>Begin first night 🌙</button>
      </div>;
    case 'night':
      return <div className="st-controls">{pause}<button className="btn primary" onClick={() => act('st:day')}>Dawn — begin day ☀</button></div>;
    case 'day': {
      const s = view.stage;
      const busy = s === 'accusation' || s === 'defense' || s === 'voting';
      return <div className="st-controls">
        {!busy && <>
          <button className={`btn small ${s === 'discussion' ? 'primary' : ''}`} onClick={() => act('st:stage', { stage: 'discussion' })}>Gather</button>
          <button className={`btn small ${s === 'private' ? 'primary' : ''}`} onClick={() => act('st:stage', { stage: 'private' })}>Open side rooms</button>
          {view.houseRules.speedRound && <button className={`btn small ${s === 'speedround' ? 'primary' : ''}`} onClick={() => act('st:stage', { stage: 'speedround' })}>Speed round</button>}
          <button className={`btn small ${s === 'nominations' ? 'primary' : ''}`} onClick={() => act('st:stage', { stage: 'nominations' })}>Open nominations</button>
          <button className={`btn small ${s === 'closed' ? 'primary' : ''}`} onClick={() => act('st:stage', { stage: 'closed' })}>Close nominations</button>
        </>}
        {s === 'accusation' && <button className="btn small" onClick={() => act('st:startDefense')}>Defence →</button>}
        {(s === 'accusation' || s === 'defense') && <button className="btn small" onClick={() => act('st:startVote')}>Start vote →</button>}
        {timerBtns}{pause}
        <button className="btn primary" disabled={busy} onClick={() => act('st:endDay')}>End day{view.aboutToDie ? ` (execute ${name(view.aboutToDie.playerId)})` : ''} 🌙</button>
      </div>;
    }
    default: return null;
  }
}

export function StorytellerPanel({ view }: { view: GameView }) {
  const self = st(view);
  const [tab, setTab] = useState<'grim' | 'setup' | 'night' | 'chat' | 'notes'>(view.phase === 'lobby' ? 'setup' : 'grim');
  useEffect(() => { if (view.phase === 'night') setTab('night'); else if (tab === 'night') setTab('grim'); }, [view.phase]);
  return (
    <div className="side-panel st">
      {self.winHint && <div className="request win-hint">⚖ {self.winHint} <span className="muted small">End the game from the Grimoire if so.</span></div>}
      <PendingAbility view={view} />
      <PrivateRequests view={view} />
      <div className="tabs" role="tablist">
        {([['grim', 'Grimoire'], ['setup', 'Setup'], ['night', 'Night order'], ['chat', 'Chat'], ['notes', 'Notes & log']] as const).map(([t, l]) =>
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{l}</button>)}
      </div>
      {tab === 'grim' && <Grimoire view={view} />}
      {tab === 'setup' && <Setup view={view} settings={self.settings} />}
      {tab === 'night' && <NightOrder view={view} />}
      {tab === 'chat' && <Chat view={view} />}
      {tab === 'notes' && <NotesLog view={view} />}
    </div>
  );
}

function PendingAbility({ view }: { view: GameView }) {
  const p = st(view).pendingAbility;
  if (!p) return null;
  const name = (id: string | null) => view.players.find(x => x.id === id)?.name ?? '?';
  const ch = CHARACTER_BY_ID[p.characterId];
  return (
    <div className={`pending-ability ${p.real ? 'real' : 'bluff'}`}>
      <h3>{name(p.playerId)} — {ch?.name} {p.isPrivate ? '(private)' : ''}</h3>
      <p><b>{p.real ? 'REAL USE' : 'BLUFF'}</b>{p.impaired.length > 0 && <> · impaired: {p.impaired.join(', ')}</>}</p>
      <p>{p.suggestionText}</p>
      {p.isPrivate
        ? <button className="btn" onClick={() => act('st:closeStudy')}>Finish & return them to the Square</button>
        : <div className="row">
          {p.resolution === 'kill' && <button className={`btn ${p.suggestion === 'kill' ? 'primary' : ''}`} onClick={() => act('st:resolveAbility', { outcome: 'kill' })}>Target dies</button>}
          <button className={`btn ${p.suggestion !== 'kill' ? 'primary' : ''}`} onClick={() => act('st:resolveAbility', { outcome: 'nothing' })}>{p.resolution === 'kill' ? 'Nothing happens' : 'Acknowledge'}</button>
        </div>}
    </div>
  );
}

function PrivateRequests({ view }: { view: GameView }) {
  const self = st(view);
  const name = (id: string) => view.players.find(x => x.id === id)?.name ?? '?';
  const inStudy = view.questions.currentId;
  return <>
    {self.privateRequests.map(r => (
      <div key={r.eventId} className="request">
        {name(r.playerId)} wants to use <b>{CHARACTER_BY_ID[r.characterId]?.name}</b> privately.
        <button className="btn small" onClick={() => act('st:takeRequest', { eventId: r.eventId })}>Take to Study</button>
      </div>
    ))}
    {inStudy && view.phase !== 'questions' && !self.pendingAbility && <div className="request">With {name(inStudy)} in the Study. <button className="btn small" onClick={() => act('st:closeStudy')}>Return to Square</button></div>}
  </>;
}

function CharSelect({ value, onChange, filter, label }: { value: string | null; onChange: (v: string | null) => void; filter?: (t: CharacterType) => boolean; label: string }) {
  return (
    <select aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
      <option value="">—</option>
      {(['townsfolk', 'outsider', 'minion', 'demon', 'traveller'] as CharacterType[]).filter(t => !filter || filter(t)).map(t => (
        <optgroup key={t} label={TYPE_LABEL[t]}>{CHARACTERS.filter(c => c.type === t).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
      ))}
    </select>
  );
}

function Grimoire({ view }: { view: GameView }) {
  const self = st(view);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const pub = (id: string) => view.players.find(p => p.id === id)!;
  return (
    <div className="grimoire">
      {self.grimoire.map((g, i) => {
        const p = pub(g.id);
        const ch = CHARACTER_BY_ID[g.characterId ?? ''];
        const expanded = open === g.id;
        return (
          <div key={g.id} className={`grim-row ${g.alignment} ${p.alive ? '' : 'dead'} ${expanded ? 'open' : ''}`}>
            <button className="grim-head" onClick={() => setOpen(expanded ? null : g.id)} aria-expanded={expanded}>
              <span className="seatno">{i + 1}</span>
              <span className="pname">{p.name}{p.traveller ? ' (Traveller)' : ''}{!p.connected ? ' ⚠' : ''}</span>
              <span className={`pchar ${ch?.type ?? ''}`}>{ch?.name ?? '—'}{g.shownCharacterId && g.shownCharacterId !== g.characterId ? ` → thinks ${CHARACTER_BY_ID[g.shownCharacterId]?.name}` : ''}</span>
              <span className={`palign ${g.alignment}`}>{g.alignment}</span>
              {!p.alive && <span>☠{p.ghostVoteUsed ? '' : ' 🗳'}</span>}
              {self.pendingDawnDeaths.includes(g.id) && <span title="dies at dawn">🌅☠</span>}
              {g.reminders.map(r => <span key={r} className="reminder">{r}</span>)}
              {g.wantsQuestion && view.phase === 'questions' && <span title="wants to ask a question">❓</span>}
            </button>
            {expanded && (
              <div className="grim-body">
                <div className="row wrap">
                  <label>True character <CharSelect label="True character" value={g.characterId} onChange={v => act('st:setCharacter', { playerId: g.id, characterId: v })} /></label>
                  <label>Shown as <CharSelect label="Shown character" value={g.shownCharacterId} onChange={v => act('st:setShown', { playerId: g.id, characterId: v })} /></label>
                  <label>Alignment <select value={g.alignment} onChange={e => act('st:setAlignment', { playerId: g.id, alignment: e.target.value })}><option value="good">Good</option><option value="evil">Evil</option></select></label>
                </div>
                <div className="row wrap">
                  {p.alive && !self.pendingDawnDeaths.includes(g.id) && <button className="btn small danger" onClick={() => act('st:kill', { playerId: g.id })}>{view.phase === 'night' ? 'Kill (at dawn)' : 'Kill'}</button>}
                  {(!p.alive || self.pendingDawnDeaths.includes(g.id)) && <button className="btn small" onClick={() => act('st:revive', { playerId: g.id })}>Revive</button>}
                  {view.phase === 'day' && <button className="btn small danger" onClick={() => act('st:execute', { playerId: g.id })}>Execute now</button>}
                  {!p.alive && <button className="btn small" onClick={() => act('st:ghostVote', { playerId: g.id, used: !p.ghostVoteUsed })}>{p.ghostVoteUsed ? 'Restore ghost vote' : 'Mark ghost vote used'}</button>}
                  <button className="btn small" onClick={() => act('st:mute', { playerId: g.id })}>{p.muted ? 'Unmute' : 'Mute'}</button>
                  {view.phase === 'night' && <button className="btn small" onClick={() => act('st:wake', { playerId: g.id })}>{g.awake ? 'Put to sleep' : 'Wake'}</button>}
                  {view.phase !== 'night' && view.phase !== 'lobby' && <button className="btn small" onClick={() => act('st:invite', { playerId: g.id })}>Invite to Study</button>}
                  <button className="btn small" onClick={() => setInfoFor(g.id)}>Send info card</button>
                  {view.phase === 'lobby' && <>
                    <button className="btn small ghost" disabled={i === 0} onClick={() => act('st:seat', { playerId: g.id, seat: i - 1 })}>↑ seat</button>
                    <button className="btn small ghost" disabled={i === self.grimoire.length - 1} onClick={() => act('st:seat', { playerId: g.id, seat: i + 1 })}>↓ seat</button>
                  </>}
                  <button className="btn small danger ghost" onClick={() => { if (confirm(`Kick ${p.name}?`)) void act('st:kick', { playerId: g.id }); }}>Kick</button>
                </div>
                <Reminders id={g.id} reminders={g.reminders} charId={g.characterId} />
                {g.characterId === 'lunatic' && (
                  <div className="lunatic-box">
                    <b>Lunatic's fake evil team</b> (shown exactly like a real team):
                    <div className="chips">{view.players.filter(o => o.id !== g.id).map(o => (
                      <label key={o.id} className="chip"><input type="checkbox" checked={g.fakeEvilTeam.includes(o.id)} onChange={e => act('st:fakeEvil', { playerId: g.id, ids: e.target.checked ? [...g.fakeEvilTeam, o.id] : g.fakeEvilTeam.filter(x => x !== o.id) })} />{o.name}</label>
                    ))}</div>
                  </div>
                )}
                {g.nightChoice.length > 0 && <p>Night choice: <b>{g.nightChoice.map(id => pub(id)?.name).join(', ')}</b></p>}
                {g.notes.length > 0 && <details><summary>Info given ({g.notes.length})</summary><ul>{g.notes.map(n => <li key={n.id}>{n.when}: {n.text} {n.playerIds.map(id => pub(id)?.name).join('/')} {n.characterIds.map(c => CHARACTER_BY_ID[c]?.name).join('/')} {n.alignment ?? ''}</li>)}</ul></details>}
              </div>
            )}
          </div>
        );
      })}
      {view.phase !== 'lobby' && <Bluffs view={view} />}
      {view.phase !== 'lobby' && view.phase !== 'ended' && (
        <div className="end-game">
          <b>End the game:</b>
          <button className="btn small" onClick={() => { if (confirm('Declare GOOD the winner and reveal all characters?')) void act('st:end', { winner: 'good' }); }}>Good wins</button>
          <button className="btn small danger" onClick={() => { if (confirm('Declare EVIL the winner and reveal all characters?')) void act('st:end', { winner: 'evil' }); }}>Evil wins</button>
        </div>
      )}
      {infoFor && <InfoComposer view={view} playerId={infoFor} onClose={() => setInfoFor(null)} />}
    </div>
  );
}

function Reminders({ id, reminders, charId }: { id: string; reminders: string[]; charId: string | null }) {
  const [custom, setCustom] = useState('');
  const options = [...new Set([...(CHARACTER_BY_ID[charId ?? '']?.reminders ?? []), ...GENERIC_REMINDERS])];
  const set = (r: string[]) => act('st:reminders', { playerId: id, reminders: r });
  return (
    <div className="reminders">
      <b>Reminders:</b> {reminders.map(r => <button key={r} className="reminder" onClick={() => set(reminders.filter(x => x !== r))} title="Remove">{r} ✕</button>)}
      <select aria-label="Add reminder" value="" onChange={e => e.target.value && set([...reminders, e.target.value])}>
        <option value="">+ add</option>{options.filter(o => !reminders.includes(o)).map(o => <option key={o}>{o}</option>)}
      </select>
      <form className="inline" onSubmit={e => { e.preventDefault(); if (custom.trim()) { void set([...reminders, custom.trim()]); setCustom(''); } }}>
        <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="custom…" maxLength={30} aria-label="Custom reminder" />
      </form>
    </div>
  );
}

function Bluffs({ view }: { view: GameView }) {
  const self = st(view);
  const hasLunatic = self.grimoire.some(g => g.characterId === 'lunatic');
  const edit = (kind: 'demon' | 'lunatic', list: string[], i: number, v: string | null) => {
    const next = [...list]; next[i] = v ?? ''; void act('st:bluffs', { kind, ids: next.filter(Boolean) });
  };
  const row = (kind: 'demon' | 'lunatic', list: string[]) => (
    <div className="row wrap">{[0, 1, 2].map(i => <CharSelect key={i} label={`${kind} bluff ${i + 1}`} value={list[i] ?? null} filter={t => t === 'townsfolk' || t === 'outsider'} onChange={v => edit(kind, list, i, v)} />)}</div>
  );
  return (
    <div className="bluffs">
      <b>Demon bluffs</b> {view.players.filter(p => !p.traveller).length < 7 && !view.houseRules.evilInfoSmallGames && <span className="muted small">(not shown — fewer than 7 players)</span>}
      {row('demon', self.demonBluffs)}
      {hasLunatic && <><b>Lunatic's fake bluffs</b>{row('lunatic', self.lunaticBluffs)}</>}
    </div>
  );
}

function InfoComposer({ view, playerId, onClose }: { view: GameView; playerId: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const [players, setPlayers] = useState<string[]>([]);
  const [chars, setChars] = useState<string[]>([]);
  const [alignment, setAlignment] = useState<'' | 'good' | 'evil'>('');
  const name = view.players.find(p => p.id === playerId)?.name;
  const presets = ['These 2 players: one of them is the character shown.', 'You learn this number:', 'This player is:', 'This is the Demon:', 'These are your Minions:', 'You are now:'];
  return (
    <Modal title={`Info card for ${name}`} onClose={onClose} wide>
      <div className="chips">{presets.map(p => <button key={p} className="chip" onClick={() => setText(p)}>{p}</button>)}</div>
      <label className="field">Text<textarea value={text} onChange={e => setText(e.target.value)} maxLength={500} /></label>
      <b>Players</b>
      <div className="chips">{view.players.map(p => <label key={p.id} className="chip"><input type="checkbox" checked={players.includes(p.id)} onChange={e => setPlayers(e.target.checked ? [...players, p.id] : players.filter(x => x !== p.id))} />{p.name}</label>)}</div>
      <b>Character tokens</b>
      <div className="row wrap">
        <CharSelect label="Add character token" value={null} onChange={v => v && setChars([...chars, v])} />
        {chars.map((c, i) => <button key={i} className="chip" onClick={() => setChars(chars.filter((_, j) => j !== i))}>{CHARACTER_BY_ID[c].name} ✕</button>)}
      </div>
      <label>Alignment <select value={alignment} onChange={e => setAlignment(e.target.value as '' | 'good' | 'evil')}><option value="">—</option><option value="good">Good</option><option value="evil">Evil</option></select></label>
      <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={async () => { const r = await act('st:info', { playerId, card: { text, playerIds: players, characterIds: chars, alignment: alignment || undefined } }); if (r.ok) onClose(); }}>Show to {name}</button></div>
    </Modal>
  );
}

function NightOrder({ view }: { view: GameView }) {
  const self = st(view);
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';
  const grim = Object.fromEntries(self.grimoire.map(g => [g.id, g]));
  const awake = self.grimoire.filter(g => g.awake);
  return (
    <div className="night-order">
      <p className="muted small">{view.night <= 1 ? 'First night' : `Night ${view.night}`}. Click a player to wake / sleep them (or click their avatar). Their choices appear in the Grimoire.</p>
      {awake.length > 0 && <div className="awake-list">Awake: {awake.map(g => (
        <button key={g.id} className={`chip ${self.focusId === g.id ? 'active' : ''}`} onClick={() => act('st:focus', { playerId: g.id })} title="Talk to this player">{name(g.id)}{self.focusId === g.id ? ' 🎙' : ''}{g.nightChoice.length ? ` → ${g.nightChoice.map(name).join(', ')}` : ''}</button>
      ))}</div>}
      <ol>
        {self.nightOrder.map(step => (
          <li key={step.id} className="step">
            <b>{step.name}</b> <span className="muted small">{step.text}</span>
            <div className="row wrap">{step.players.map(pid => (
              <button key={pid} className={`btn small ${grim[pid]?.awake ? 'primary' : ''}`} onClick={() => act('st:wake', { playerId: pid })}>
                {grim[pid]?.awake ? '💤 Sleep' : '👁 Wake'} {name(pid)}{grim[pid]?.characterId !== step.id ? ` (${CHARACTER_BY_ID[grim[pid]?.characterId ?? '']?.name})` : ''}
              </button>
            ))}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NotesLog({ view }: { view: GameView }) {
  const self = st(view);
  const [notes, setNotes] = useState(self.notes);
  useEffect(() => { const t = setTimeout(() => { if (notes !== self.notes) void act('st:notes', { notes }); }, 600); return () => clearTimeout(t); }, [notes]);
  return (
    <div>
      <textarea className="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Private Storyteller notes…" />
      <h3>Public announcements</h3><Announcements view={view} />
      <h3>Storyteller log</h3>
      <ul className="log">{[...self.log].reverse().map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}

// ------------------------------------------------------------ Setup
function Setup({ view, settings }: { view: GameView; settings: Settings }) {
  const self = st(view);
  const locked = view.phase !== 'lobby';
  const residents = view.players.filter(p => !p.traveller).length;
  const rec = SETUP_COUNTS[Math.min(15, Math.max(5, residents))];
  const [allEditions, setAllEditions] = useState(settings.edition === 'custom');
  const save = (patch: Partial<Settings>) => act('st:settings', { settings: patch });
  const bag = settings.characters;
  const pool = useMemo(() => CHARACTERS.filter(c => TYPES.includes(c.type) && (
    settings.script.length && !allEditions ? settings.script.includes(c.id)
      : allEditions || settings.edition === 'custom' || c.edition === settings.edition)), [allEditions, settings.edition, settings.script]);
  const toggle = (id: string) => save({ characters: bag.includes(id) ? bag.filter(x => x !== id) : [...bag, id] });
  const counts = TYPES.map(t => bag.filter(id => CHARACTER_BY_ID[id]?.type === t).length);
  const modifiers = bag.map(id => CHARACTER_BY_ID[id]).filter(c => c?.setup);
  const randomFill = () => {
    const pick = (t: CharacterType, n: number) => pool.filter(c => c.type === t).sort(() => Math.random() - 0.5).slice(0, n).map(c => c.id);
    save({ characters: TYPES.flatMap((t, i) => pick(t, rec[i])) });
  };
  return (
    <div className="setup">
      <section>
        <h3>Script &amp; characters</h3>
        <div className="row wrap">
          <label>Edition <select disabled={locked} value={settings.edition} onChange={e => save({ edition: e.target.value as Settings['edition'] })}>
            {Object.entries(EDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="custom">Custom (any edition)</option></select></label>
          <label className="chip"><input type="checkbox" checked={allEditions} onChange={e => setAllEditions(e.target.checked)} /> Show all editions</label>
          {!locked && <button className="btn small" onClick={randomFill}>🎲 Random recommended bag</button>}
        </div>
        <p className="muted small">Players: <b>{residents}</b> (+ {view.players.length - residents} Travellers). Official recommendation: {rec.map((n, i) => `${n} ${TYPE_LABEL[TYPES[i]]}`).join(', ')} — a guide only. Selected: <b>{bag.length}</b>/{residents}.</p>
        {residents < 7 && bag.some(id => CHARACTER_BY_ID[id]?.edition !== 'tb') && <p className="warn small">Bad Moon Rising and Sects &amp; Violets are recommended for 7 or more players (Trouble Brewing works from 5).</p>}
        {residents <= 6 && <p className="muted small">Teensyville rules apply at {residents} players: no Minion or Demon info on the first night (unless the house rule says otherwise).</p>}
        {!locked && <ScriptImport settings={settings} />}
        {modifiers.length > 0 && <p className="warn small">Setup modifiers: {modifiers.map(c => `${c!.name} (${c!.setup})`).join('; ')}</p>}
        {TYPES.map((t, ti) => {
          const chars = pool.filter(c => c.type === t);
          return (
            <div key={t} className="type-group">
              <div className="type-head">
                <b>{TYPE_LABEL[t]}</b> <span className={counts[ti] === rec[ti] ? 'ok' : 'off'}>{counts[ti]} / rec. {rec[ti]}</span>
                {!locked && <button className="btn small ghost" onClick={() => save({ characters: bag.filter(id => CHARACTER_BY_ID[id].type !== t) })}>None</button>}
              </div>
              <div className="char-grid">
                {chars.map(c => (
                  <div key={c.id} className={`char-pick ${bag.includes(c.id) ? 'on' : ''}`}>
                    <label title={c.ability}><input type="checkbox" disabled={locked} checked={bag.includes(c.id)} onChange={() => toggle(c.id)} /> {c.name}</label>
                    {bag.includes(c.id) && settings.publicList.visible && (
                      <label className="hide-toggle" title="Hide from the public character list"><input type="checkbox" checked={settings.publicList.hidden.includes(c.id)} onChange={e => save({ publicList: { ...settings.publicList, hidden: e.target.checked ? [...settings.publicList.hidden, c.id] : settings.publicList.hidden.filter(x => x !== c.id) } })} />hide</label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
      <section>
        <h3>Public character list</h3>
        <label className="toggle"><input type="checkbox" checked={settings.publicList.visible} onChange={e => save({ publicList: { ...settings.publicList, visible: e.target.checked } })} /> Players can see the characters in play</label>
        {settings.publicList.visible && <label className="toggle"><input type="checkbox" checked={settings.publicList.showHiddenCount} onChange={e => save({ publicList: { ...settings.publicList, showHiddenCount: e.target.checked } })} /> Show the exact number of hidden characters (“+ 2 hidden” vs “+ some hidden”)</label>}
      </section>
      <section>
        <h3>Timers</h3>
        <TimersEditor timers={settings.timers} onChange={t => save({ timers: { ...settings.timers, ...t } })} />
      </section>
      <section>
        <h3>House rules</h3>
        <HouseRulesEditor rules={settings.houseRules} onChange={r => save({ houseRules: { ...settings.houseRules, ...r } })} />
      </section>
      <section>
        <h3>Fabled</h3>
        <div className="char-grid">{CHARACTERS.filter(c => c.type === 'fabled').map(c => (
          <label key={c.id} className={`char-pick ${settings.fabled.includes(c.id) ? 'on' : ''}`} title={c.ability}>
            <input type="checkbox" checked={settings.fabled.includes(c.id)} onChange={() => save({ fabled: settings.fabled.includes(c.id) ? settings.fabled.filter(x => x !== c.id) : [...settings.fabled, c.id] })} /> {c.name}
          </label>
        ))}</div>
        {settings.fabled.includes('bootlegger') && <label className="field">Bootlegger rules (shown to all players)
          <BootleggerText value={settings.bootleggerRules} onSave={v => save({ bootleggerRules: v })} /></label>}
        {settings.fabled.includes('djinn') && <label className="field">Djinn: jinx rules in effect (shown to all players)
          <BootleggerText value={settings.djinnRules} onSave={v => save({ djinnRules: v })} /></label>}
      </section>
      {self.availableRegions.length > 1 && <section>
        <h3>Voice region</h3>
        <select value={settings.region ?? ''} onChange={e => save({ region: e.target.value || null })}>
          <option value="">Automatic (closest to the group)</option>
          {self.availableRegions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <p className="muted small">Currently: {view.voice.region ?? 'decided at start'}.</p>
      </section>}
    </div>
  );
}

function ScriptImport({ settings }: { settings: Settings }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => {
    try {
      const { ids, unknown, name } = parseScript(text);
      if (!ids.length) { setMsg('No known characters found in that script.'); return; }
      void act('st:settings', { settings: { script: ids, scriptName: name, characters: settings.characters.filter(id => ids.includes(id)) } });
      setMsg(`Loaded ${ids.length} characters${unknown.length ? `; ${unknown.length} not supported (e.g. Experimental): ${unknown.slice(0, 6).join(', ')}` : ''}.`);
      setOpen(false);
    } catch (e) { setMsg(`Could not read the script: ${(e as Error).message}`); }
  };
  return (
    <div className="script-import">
      {settings.script.length > 0
        ? <p className="small">Custom script{settings.scriptName ? ` “${settings.scriptName}”` : ''}: {settings.script.length} characters. <button className="btn small ghost" onClick={() => act('st:settings', { settings: { script: [], scriptName: null } })}>Clear script</button></p>
        : <button className="btn small" onClick={() => setOpen(!open)}>Import custom script (JSON)</button>}
      {open && <>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder='Paste a Script Tool JSON, e.g. [{"id":"_meta","name":"My script"},"washerwoman","imp"]' aria-label="Script JSON" />
        <button className="btn small primary" onClick={load}>Load script</button>
      </>}
      {msg && <p className="muted small">{msg}</p>}
    </div>
  );
}

function BootleggerText({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return <textarea value={v} onChange={e => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} maxLength={2000} />;
}

const TIMER_LABELS: Record<keyof Timers, string> = {
  discussion: 'Opening discussion', privateRooms: 'Private-room time', nominations: 'Nomination window',
  accusation: 'Accuser speaks', defense: 'Accused speaks', question: 'Private question (each)', voteSeconds: 'Seconds per voter', speedRound: 'Speed round (each player)',
};
function TimersEditor({ timers, onChange }: { timers: Timers; onChange: (t: Partial<Timers>) => void }) {
  return (
    <div className="timers">
      {(Object.keys(TIMER_LABELS) as (keyof Timers)[]).map(k => {
        const v = timers[k];
        const manual = v === null;
        return (
          <div key={k} className="timer-row">
            <span>{TIMER_LABELS[k]}</span>
            <input type="number" min={k === 'voteSeconds' ? 1 : 5} max={3600} disabled={manual} value={manual ? '' : v as number}
              onChange={e => onChange({ [k]: Number(e.target.value) } as Partial<Timers>)} aria-label={`${TIMER_LABELS[k]} seconds`} />
            <span className="muted small">sec</span>
            {k !== 'voteSeconds' && k !== 'speedRound' && <label className="chip"><input type="checkbox" checked={manual} onChange={e => onChange({ [k]: e.target.checked ? null : 60 } as Partial<Timers>)} /> no limit (I end it)</label>}
          </div>
        );
      })}
    </div>
  );
}

function HouseRulesEditor({ rules, onChange }: { rules: HouseRules; onChange: (r: Partial<HouseRules>) => void }) {
  return (
    <div className="house-rules">
      {(Object.keys(HOUSE_RULE_INFO) as (keyof HouseRules)[]).map(k => {
        const info = HOUSE_RULE_INFO[k];
        const num = NUMERIC_HOUSE_RULES[k];
        if (num) {
          const v = rules[k] as number | null;
          return (
            <div key={k} className="rule">
              <label className="toggle"><input type="checkbox" checked={v !== null} onChange={e => onChange({ [k]: e.target.checked ? num.default : null })} /> {info.label}</label>
              {v !== null && <><input type="number" min={num.min} max={num.max} value={v} onChange={e => onChange({ [k]: Number(e.target.value) })} aria-label={info.label} /> <span className="muted small">{num.unit}</span></>}
              <p className="muted small">{info.help} <i>Source: {info.source}</i></p>
            </div>
          );
        }
        return (
          <div key={k} className="rule">
            <label className="toggle"><input type="checkbox" checked={!!rules[k]} onChange={e => onChange({ [k]: e.target.checked })} /> {info.label}</label>
            <p className="muted small">{info.help} <i>Source: {info.source}</i></p>
          </div>
        );
      })}
    </div>
  );
}
