import { jinxesFor } from '../../../shared/jinxes';
import { TranscriptReader } from './Transcript';
import { SpecialRules } from './GroupActions';
import { WEATHERS } from '../../../shared/types';
import { suggestInfo, impairment, killWarnings, CHOICE_REMINDER, NIGHTLY_REMINDERS, type Suggestion } from '../nightInfo';
import { ScriptBuilder } from './ScriptBuilder';
import { loadScripts } from '../scripts';
import { WhisperInbox, useUnread } from './Whispers';
import { useEffect, useMemo, useState } from 'react';
import type { GameView, StorytellerSelf, Settings, HouseRules, Timers } from '../../../shared/types';
import { HOUSE_RULE_INFO, MIN_PLAYERS, NUMERIC_HOUSE_RULES } from '../../../shared/types';
import {
  CHARACTERS, CHARACTER_BY_ID, SETUP_COUNTS, EDITIONS, GENERIC_REMINDERS, parseScript, ROOM_NAMES, ROOM_ICONS, type CharacterType,
  NIGHT_SLOTS, HOMEBREW_TYPES, type Homebrew, type NightSlot,
} from '../../../shared/characters';
import { act } from '../net';
import { Modal, TYPE_LABEL } from './Overlays';
import { Chat, Announcements } from './GameScreen';
import { tr, ability } from '../i18n';
import { LANGUAGES, type Lang } from '../../../shared/i18n';

const st = (v: GameView) => v.self as StorytellerSelf;
const TYPES: CharacterType[] = ['townsfolk', 'outsider', 'minion', 'demon'];

export function StorytellerControls({ view }: { view: GameView }) {
  const self = st(view);
  const residents = view.players.filter(p => !p.traveller).length;
  const bag = self.settings.characters.length;
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';
  const timerBtns = view.timer && <>
    <button className="btn small ghost" onClick={() => act('st:skipTimer')}>{tr("⏭ End timer")}</button>
    <button className="btn small ghost" onClick={() => act('st:addTime', { seconds: 30 })}>+30s</button>
  </>;
  const pause = view.phase !== 'lobby' && view.phase !== 'ended' &&
    <button className="btn small ghost" onClick={() => act('st:pause', { paused: !view.paused })}>{view.paused ? tr("▶ Resume") : tr("⏸ Pause")}</button>;
  switch (view.phase) {
    case 'lobby': {
      const waiting = self.awaitingConsent.map(name);
      const problem = residents < MIN_PLAYERS ? tr('Need {n} more player(s)', { n: MIN_PLAYERS - residents }) : bag !== residents ? tr("Select {n} characters (have {bag})", { n: residents, bag })
        : waiting.length ? tr('🗣 A word character is in play: waiting for {names} to allow listening', { names: waiting.join(', ') }) : null;
      return <div className="st-controls">
        <button className="btn ghost" disabled={view.players.length >= 10} onClick={() => act('st:addBot')} title={tr("Add a computer player to try a setup on your own. Bots decline questions and vote at random. Remove them with Kick.")}>{tr("🤖 Add bot")}</button>
        <button className="btn primary" disabled={!!problem} onClick={() => act('st:deal')}>{tr("Deal characters")}</button>{problem && <span className="muted small">{problem}</span>}
      </div>;
    }
    case 'dealt':
      return <div className="st-controls">
        <span className="muted small">{tr("Review the Grimoire, then:")}</span>
        <button className="btn ghost" onClick={() => act('st:deal')}>{tr("Re-deal")}</button>
        <button className="btn primary" disabled={self.awaitingConsent.length > 0} onClick={() => act('st:reveal')}>{tr("Reveal characters & take questions")}</button>
        {self.awaitingConsent.length > 0 && <span className="muted small">{tr("🗣 Waiting for")}{' '}{self.awaitingConsent.map(name).join(', ')} {tr("to allow listening")}</span>}
      </div>;
    case 'questions':
      return <div className="st-controls">
        <button className="btn" onClick={() => act('st:nextQuestion')}>{view.questions.currentId ? tr("Next player") : tr("Start questions ({length} waiting)", { length: view.questions.queue.length })}</button>
        {timerBtns}
        <button className="btn primary" onClick={() => act('st:night')}>{tr("Begin first night 🌙")}</button>
      </div>;
    case 'night':
      return <div className="st-controls">{pause}<button className="btn primary" onClick={() => act('st:day')}>{tr("Dawn — begin day ☀")}</button></div>;
    case 'day': {
      const s = view.stage;
      const busy = s === 'accusation' || s === 'defense' || s === 'voting';
      return <div className="st-controls">
        {!busy && <>
          <button className={`btn small ${s === 'discussion' ? 'primary' : ''}`} onClick={() => act('st:stage', { stage: 'discussion' })}>{tr("Gather")}</button>
          <button className={`btn small ${s === 'private' ? 'primary' : ''}`} onClick={() => act('st:stage', { stage: 'private' })}>{tr("Open side rooms")}</button>
          {view.houseRules.speedRound && <button className={`btn small ${s === 'speedround' ? 'primary' : ''}`} onClick={() => act('st:stage', { stage: 'speedround' })}>{tr("Speed round")}</button>}
          <button className={`btn small ${s === 'nominations' ? 'primary' : ''}`} onClick={() => act('st:stage', { stage: 'nominations' })}>{tr("Open nominations")}</button>
          <button className={`btn small ${s === 'closed' ? 'primary' : ''}`} onClick={() => act('st:stage', { stage: 'closed' })}>{tr("Close nominations")}</button>
        </>}
        {s === 'accusation' && <button className="btn small" onClick={() => act('st:startDefense')}>{tr("Defence →")}</button>}
        {(s === 'accusation' || s === 'defense') && <button className="btn small" onClick={() => act('st:startVote')}>{tr("Start vote →")}</button>}
        {timerBtns}{pause}
        <button className="btn primary" disabled={busy} onClick={() => act('st:endDay')}>{tr("End day")}{view.aboutToDie ? tr(" (execute {x})", { x: name(view.aboutToDie.playerId) }) : ''} 🌙</button>
      </div>;
    }
    default: return null;
  }
}

export function StorytellerPanel({ view }: { view: GameView }) {
  const self = st(view);
  const [tab, setTab] = useState<'grim' | 'setup' | 'night' | 'chat' | 'whispers' | 'transcript' | 'notes'>(view.phase === 'lobby' ? 'setup' : 'grim');
  const unread = Object.values(useUnread()).reduce((a, b) => a + b, 0);
  useEffect(() => { if (view.phase === 'night') setTab('night'); else if (tab === 'night') setTab('grim'); }, [view.phase]);
  return (
    <div className="side-panel st">
      {self.undo && <UndoBar undo={self.undo} />}
      {self.winHint && <div className="request win-hint">⚖ {self.winHint} <span className="muted small">{tr("End the game from the Grimoire if so.")}</span></div>}
      <PendingAbility view={view} />
      <PrivateRequests view={view} />
      <div className="tabs" role="tablist">
        {([['grim', tr('Grimoire')], ['setup', tr('Setup')], ['night', tr('Night order')], ['chat', tr('Chat')], ['whispers', `✉ ${tr('Whispers')}${unread ? ` (${unread})` : ''}`], ...(view.houseRules.voiceTranscript ? [['transcript', `🗣 ${tr('Word log')}`] as const] : []), ['notes', tr('Notes & log')]] as const).map(([t, l]) =>
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{l}</button>)}
      </div>
      {tab === 'grim' && <Grimoire view={view} />}
      {tab === 'setup' && <Setup view={view} settings={self.settings} />}
      {tab === 'night' && <NightOrder view={view} />}
      {tab === 'chat' && <Chat view={view} />}
      {tab === 'whispers' && <WhisperInbox view={view} />}
      {tab === 'transcript' && <TranscriptReader view={view} />}
      {tab === 'notes' && <NotesLog view={view} />}
    </div>
  );
}

function UndoBar({ undo }: { undo: { label: string; at: number } }) {
  const mins = Math.floor((Date.now() - undo.at) / 60000);
  return (
    <div className="undo-bar">
      <button className="btn small" onClick={() => { if (confirm(tr("Undo “{label}”?\n\nThe game goes back to just before it. Anything players did since then (votes, nominations…) is undone too.", { label: undo.label }))) void act('st:undo'); }}>{tr("↶ Undo")}</button>
      <span className="small">{undo.label} <span className="muted">({mins < 1 ? tr("just now") : tr("{mins} min ago", { mins })})</span></span>
    </div>
  );
}

/** Kill with a warning if the rules would normally stop it. */
export function confirmKill(view: GameView, id: string) {
  const w = killWarnings(id, view);
  const name = view.players.find(p => p.id === id)?.name ?? '?';
  if (w.length && !confirm(tr("{name} {x}.\n\nKill them anyway?", { name, x: w.join('; ') }))) return;
  void act('st:kill', { playerId: id });
}

function PendingAbility({ view }: { view: GameView }) {
  const p = st(view).pendingAbility;
  if (!p) return null;
  const name = (id: string | null) => view.players.find(x => x.id === id)?.name ?? '?';
  const ch = CHARACTER_BY_ID[p.characterId];
  return (
    <div className={`pending-ability ${p.real ? 'real' : 'bluff'}`}>
      <h3>{name(p.playerId)} — {ch?.name} {p.isPrivate ? tr("(private)") : ''}</h3>
      <p><b>{p.real ? tr("REAL USE") : tr("BLUFF")}</b>{p.impaired.length > 0 && <> {tr("· impaired:")}{' '}{p.impaired.join(', ')}</>}</p>
      <p>{p.suggestionText}</p>
      {p.isPrivate
        ? <button className="btn" onClick={() => act('st:closeStudy')}>{tr("Finish & return them to the Square")}</button>
        : <div className="row">
          {p.resolution === 'kill' && <button className={`btn ${p.suggestion === 'kill' ? 'primary' : ''}`} onClick={() => act('st:resolveAbility', { outcome: 'kill' })}>{tr("Target dies")}</button>}
          <button className={`btn ${p.suggestion !== 'kill' ? 'primary' : ''}`} onClick={() => act('st:resolveAbility', { outcome: 'nothing' })}>{p.resolution === 'kill' ? tr("Nothing happens") : tr("Acknowledge")}</button>
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
        {name(r.playerId)} {tr("wants to use")}{' '}<b>{CHARACTER_BY_ID[r.characterId]?.name}</b> {tr("privately.")}
        <button className="btn small" onClick={() => act('st:takeRequest', { eventId: r.eventId })}>{tr("Take to Study")}</button>
      </div>
    ))}
    {inStudy && view.phase !== 'questions' && !self.pendingAbility && <div className="request">{tr("With")}{' '}{name(inStudy)} {tr("in the Study.")}{' '}<button className="btn small" onClick={() => act('st:closeStudy')}>{tr("Return to Square")}</button></div>}
  </>;
}

function CharSelect({ value, onChange, filter, label }: { value: string | null; onChange: (v: string | null) => void; filter?: (t: CharacterType) => boolean; label: string }) {
  return (
    <select aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
      <option value="">—</option>
      {(['townsfolk', 'outsider', 'minion', 'demon', 'traveller'] as CharacterType[]).filter(t => !filter || filter(t)).map(t => (
        <optgroup key={t} label={tr(TYPE_LABEL[t])}>{CHARACTERS.filter(c => c.type === t).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
      ))}
    </select>
  );
}

function Grimoire({ view }: { view: GameView }) {
  const self = st(view);
  const heretic = self.grimoire.some(g => g.characterId === 'heretic' && !g.reminders.some(r => /poison|drunk/i.test(r))) ? '\n\n' + tr('⚠ The Heretic is in play: whoever wins LOSES. Did you swap the winner?') : '';
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
              <span className="pname">{p.name}{p.traveller ? tr(" (Traveller)") : ''}{!p.connected ? ' ⚠' : ''}</span>
              <span className={`pchar ${ch?.type ?? ''}`}>{ch?.name ?? '—'}{g.shownCharacterId && g.shownCharacterId !== g.characterId ? tr(" → thinks {name}", { name: CHARACTER_BY_ID[g.shownCharacterId]?.name }) : ''}</span>
              <span className={`palign ${g.alignment}`}>{g.alignment}</span>
              {!p.alive && <span>☠{p.ghostVoteUsed ? '' : ' 🗳'}</span>}
              {self.pendingDawnDeaths.includes(g.id) && <span title={tr("dies at dawn")}>🌅☠</span>}
              {g.reminders.map(r => <span key={r} className="reminder">{tr(r)}</span>)}
              {g.wantsQuestion && view.phase === 'questions' && <span title={tr("wants to ask a question")}>❓</span>}
            </button>
            {expanded && (
              <div className="grim-body">
                <div className="row wrap">
                  <label>{tr("True character")}{' '}<CharSelect label={tr("True character")} value={g.characterId} onChange={v => act('st:setCharacter', { playerId: g.id, characterId: v })} /></label>
                  <label>{tr("Shown as")}{' '}<CharSelect label={tr("Shown character")} value={g.shownCharacterId} onChange={v => act('st:setShown', { playerId: g.id, characterId: v })} /></label>
                  <label>{tr("Alignment")}{' '}<select value={g.alignment} onChange={e => act('st:setAlignment', { playerId: g.id, alignment: e.target.value })}><option value="good">{tr("Good")}</option><option value="evil">{tr("Evil")}</option></select></label>
                </div>
                <div className="row wrap">
                  {p.alive && !self.pendingDawnDeaths.includes(g.id) && <button className="btn small danger" onClick={() => confirmKill(view, g.id)}>{view.phase === 'night' ? tr("Kill (at dawn)") : tr("Kill")}</button>}
                  {(!p.alive || self.pendingDawnDeaths.includes(g.id)) && <button className="btn small" onClick={() => act('st:revive', { playerId: g.id })}>{tr("Revive")}</button>}
                  {view.phase === 'day' && <button className="btn small danger" onClick={() => act('st:execute', { playerId: g.id })}>{tr("Execute now")}</button>}
                  {!p.alive && <button className="btn small" onClick={() => act('st:ghostVote', { playerId: g.id, used: !p.ghostVoteUsed })}>{p.ghostVoteUsed ? tr("Restore ghost vote") : tr("Mark ghost vote used")}</button>}
                  <button className="btn small" onClick={() => act('st:mute', { playerId: g.id })}>{p.muted ? tr("Unmute") : tr("Mute")}</button>
                  {view.phase === 'night' && <button className="btn small" onClick={() => act('st:wake', { playerId: g.id })}>{g.awake ? tr("Put to sleep") : tr("Wake")}</button>}
                  {view.phase !== 'night' && view.phase !== 'lobby' && <button className="btn small" onClick={() => act('st:invite', { playerId: g.id })}>{tr("Invite to Study")}</button>}
                  <button className="btn small" onClick={() => setInfoFor(g.id)}>{tr("Send info card")}</button>
                  {view.phase === 'lobby' && <>
                    <button className="btn small ghost" disabled={i === 0} onClick={() => act('st:seat', { playerId: g.id, seat: i - 1 })}>{tr("↑ seat")}</button>
                    <button className="btn small ghost" disabled={i === self.grimoire.length - 1} onClick={() => act('st:seat', { playerId: g.id, seat: i + 1 })}>{tr("↓ seat")}</button>
                  </>}
                  <button className="btn small danger ghost" onClick={() => { if (confirm(tr("Kick {p}?", { p: p.name }))) void act('st:kick', { playerId: g.id }); }}>{tr("Kick")}</button>
                </div>
                <Reminders id={g.id} reminders={g.reminders} charId={g.characterId} />
                {g.characterId === 'lunatic' && (
                  <div className="lunatic-box">
                    <b>{tr("Lunatic's fake evil team")}</b> {tr("(shown exactly like a real team):")}
                    <div className="chips">{view.players.filter(o => o.id !== g.id).map(o => (
                      <label key={o.id} className="chip"><input type="checkbox" checked={g.fakeEvilTeam.includes(o.id)} onChange={e => act('st:fakeEvil', { playerId: g.id, ids: e.target.checked ? [...g.fakeEvilTeam, o.id] : g.fakeEvilTeam.filter(x => x !== o.id) })} />{o.name}</label>
                    ))}</div>
                  </div>
                )}
                {g.nightChoice.length > 0 && <p>{tr("Night choice:")}{' '}<b>{g.nightChoice.map(id => pub(id)?.name).join(', ')}</b></p>}
                {g.notes.length > 0 && <details><summary>{tr("Info given (")}{g.notes.length})</summary><ul>{g.notes.map(n => <li key={n.id}>{n.when}: {n.text} {n.playerIds.map(id => pub(id)?.name).join('/')} {n.characterIds.map(c => CHARACTER_BY_ID[c]?.name).join('/')} {n.alignment ?? ''}</li>)}</ul></details>}
              </div>
            )}
          </div>
        );
      })}
      <SpecialRules view={view} />
      {view.phase !== 'lobby' && <Bluffs view={view} />}
      {view.phase !== 'lobby' && view.phase !== 'ended' && (
        <div className="end-game">
          <b>{tr("End the game:")}</b>
          <button className="btn small" onClick={() => { if (confirm(tr("Declare GOOD the winner and reveal all characters?{heretic}", { heretic }))) void act('st:end', { winner: 'good' }); }}>{tr("Good wins")}</button>
          <button className="btn small danger" onClick={() => { if (confirm(tr("Declare EVIL the winner and reveal all characters?{heretic}", { heretic }))) void act('st:end', { winner: 'evil' }); }}>{tr("Evil wins")}</button>
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
      <b>{tr("Reminders:")}</b> {reminders.map(r => <button key={r} className="reminder" onClick={() => set(reminders.filter(x => x !== r))} title={tr("Remove")}>{tr(r)} ✕</button>)}
      <select aria-label={tr("Add reminder")} value="" onChange={e => e.target.value && set([...reminders, e.target.value])}>
        <option value="">{tr("+ add")}</option>{options.filter(o => !reminders.includes(o)).map(o => <option key={o} value={o}>{tr(o)}</option>)}
      </select>
      <form className="inline" onSubmit={e => { e.preventDefault(); if (custom.trim()) { void set([...reminders, custom.trim()]); setCustom(''); } }}>
        <input value={custom} onChange={e => setCustom(e.target.value)} placeholder={tr("custom…")} maxLength={30} aria-label={tr("Custom reminder")} />
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
    <div className="row wrap">{[0, 1, 2].map(i => <CharSelect key={i} label={tr("{kind} bluff {x}", { kind, x: i + 1 })} value={list[i] ?? null} filter={t => t === 'townsfolk' || t === 'outsider'} onChange={v => edit(kind, list, i, v)} />)}</div>
  );
  return (
    <div className="bluffs">
      <b>{tr("Demon bluffs")}</b> {view.players.filter(p => !p.traveller).length < 7 && !view.houseRules.evilInfoSmallGames && <span className="muted small">{tr("(not shown — fewer than 7 players)")}</span>}
      {row('demon', self.demonBluffs)}
      {hasLunatic && <><b>{tr("Lunatic's fake bluffs")}</b>{row('lunatic', self.lunaticBluffs)}</>}
    </div>
  );
}

function InfoComposer({ view, playerId, onClose }: { view: GameView; playerId: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const [players, setPlayers] = useState<string[]>([]);
  const [chars, setChars] = useState<string[]>([]);
  const [alignment, setAlignment] = useState<'' | 'good' | 'evil'>('');
  const name = view.players.find(p => p.id === playerId)?.name;
  const presets = ['These 2 players: one of them is the character shown.', 'You learn this number:', 'This player is:', 'This is the Demon:', 'These are your Minions:', 'You are now:'].map(x => tr(x));
  return (
    <Modal title={tr("Info card for {name}", { name })} onClose={onClose} wide>
      <div className="chips">{presets.map(p => <button key={p} className="chip" onClick={() => setText(p)}>{p}</button>)}</div>
      <label className="field">{tr("Text")}<textarea value={text} onChange={e => setText(e.target.value)} maxLength={500} /></label>
      <b>{tr("Players")}</b>
      <div className="chips">{view.players.map(p => <label key={p.id} className="chip"><input type="checkbox" checked={players.includes(p.id)} onChange={e => setPlayers(e.target.checked ? [...players, p.id] : players.filter(x => x !== p.id))} />{p.name}</label>)}</div>
      <b>{tr("Character tokens")}</b>
      <div className="row wrap">
        <CharSelect label={tr("Add character token")} value={null} onChange={v => v && setChars([...chars, v])} />
        {chars.map((c, i) => <button key={i} className="chip" onClick={() => setChars(chars.filter((_, j) => j !== i))}>{CHARACTER_BY_ID[c].name} ✕</button>)}
      </div>
      <label>{tr("Alignment")}{' '}<select value={alignment} onChange={e => setAlignment(e.target.value as '' | 'good' | 'evil')}><option value="">—</option><option value="good">{tr("Good")}</option><option value="evil">{tr("Evil")}</option></select></label>
      <div className="row end"><button className="btn ghost" onClick={onClose}>{tr("Cancel")}</button>
        <button className="btn primary" onClick={async () => { const r = await act('st:info', { playerId, card: { text, playerIds: players, characterIds: chars, alignment: alignment || undefined } }); if (r.ok) onClose(); }}>{tr("Show to")}{' '}{name}</button></div>
    </Modal>
  );
}

// ---------------------------------------------------------------- night helper
type Template = 'number' | 'yesno' | 'pair' | 'character' | 'minions' | 'demon' | 'text';
const TEMPLATE: Record<string, Template> = {
  chef: 'number', empath: 'number', clockmaker: 'number', oracle: 'number', mathematician: 'number', chambermaid: 'number', juggler: 'number',
  fortuneteller: 'yesno', flowergirl: 'yesno', towncrier: 'yesno', seamstress: 'yesno',
  washerwoman: 'pair', librarian: 'pair', investigator: 'pair',
  undertaker: 'character', ravenkeeper: 'character', grandmother: 'character', dreamer: 'character',
  minioninfo: 'minions', demoninfo: 'demon',
};
const PAIR_TYPE: Record<string, CharacterType> = { washerwoman: 'townsfolk', librarian: 'outsider', investigator: 'minion' };

function NightHelper({ view }: { view: GameView }) {
  const self = st(view);
  const steps = self.nightOrder.filter(s => s.id !== 'dusk' && s.id !== 'dawn');
  const [index, setIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const step = index >= 0 ? steps[index] : null;
  const grim = Object.fromEntries(self.grimoire.map(g => [g.id, g]));
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';
  // which players this step wakes
  const evilOf = (role: 'minion' | 'demon') => self.grimoire.filter(g => CHARACTER_BY_ID[g.characterId ?? '']?.type === role && g.characterId !== 'lunatic').map(g => g.id);
  const targetsOf = (s: typeof step) => !s ? [] : s.id === 'minioninfo' ? evilOf('minion') : s.id === 'demoninfo' ? [...evilOf('demon'), ...self.grimoire.filter(g => g.characterId === 'lunatic').map(g => g.id)] : s.players;
  const go = async (to: number) => {
    setBusy(true);
    const next = to >= 0 && to < steps.length ? steps[to] : null;
    const want = new Set(targetsOf(next).filter(id => view.players.find(p => p.id === id)?.alive !== false || next?.id === 'ravenkeeper'));
    for (const g of self.grimoire) if (g.awake && !want.has(g.id)) await act('st:setAwake', { playerId: g.id, awake: false });
    for (const id of want) if (!grim[id]?.awake) await act('st:setAwake', { playerId: id, awake: true });
    setIndex(to >= steps.length ? -1 : to);
    setBusy(false);
  };
  const targets = targetsOf(step);
  const [who, setWho] = useState<string | null>(null);
  const recipient = who && targets.includes(who) ? who : targets[0] ?? null;
  const send = (card: { text?: string; playerIds?: string[]; characterIds?: string[] }, to: string | null = recipient) => (to ? act('st:info', { playerId: to, card }) : undefined);
  // worked out once per step and recipient (pair suggestions pick a random second player)
  const choiceKey = recipient ? grim[recipient]?.nightChoice.join(',') ?? '' : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sug = useMemo(() => (step && recipient ? suggestInfo(step.id, recipient, view) : null), [step?.id, recipient, choiceKey, self.lastExecutedId]);
  return (
    <div className="night-helper">
      <div className="nh-head">
        <b>{tr("🌙 Night helper")}</b>
        {index < 0
          ? <button className="btn small primary" disabled={!steps.length || busy} onClick={() => go(0)}>{tr("Start the night ▶")}</button>
          : <span className="row">
            <button className="btn small ghost" disabled={busy || index === 0} onClick={() => go(index - 1)}>{tr("◀ Back")}</button>
            <span className="muted small">{tr("Step")}{' '}{index + 1} {tr("of")}{' '}{steps.length}</span>
            <button className="btn small primary" disabled={busy} onClick={() => go(index + 1)}>{index + 1 >= steps.length ? tr("Finish (all asleep)") : tr("Next ▶")}</button>
          </span>}
      </div>
      {!steps.length && <p className="muted small">{tr("Nobody acts tonight.")}</p>}
      {index < 0 && <ClearNightly view={view} />}
      {step && (
        <div className="nh-step">
          <h3>{step.name}</h3>
          <p className="muted small">{step.text}</p>
          {targets.length === 0 && <p className="warn small">{tr("No living player to wake for this step.")}</p>}
          {targets.length > 1 && <div className="chips">{tr("Card goes to:")}{' '}{targets.map(id => <button key={id} className={`chip ${recipient === id ? 'active' : ''}`} onClick={() => setWho(id)}>{name(id)}</button>)}</div>}
          {targets.map(id => {
            const g = grim[id];
            return <p key={id} className="small">👁 <b>{name(id)}</b> — {CHARACTER_BY_ID[g?.characterId ?? '']?.name ?? '—'}
              {g?.shownCharacterId && g.shownCharacterId !== g.characterId ? <span className="warn"> {tr("(thinks:")}{' '}{CHARACTER_BY_ID[g.shownCharacterId]?.name})</span> : null}
              {g?.reminders.length ? <span className="muted"> · {g.reminders.join(', ')}</span> : null}
              {g?.nightChoice.length ? <> {tr("· chose")}{' '}<b>{g.nightChoice.map(name).join(', ')}</b></> : <span className="muted"> {tr("· no choice yet")}</span>}</p>;
          })}
          {recipient && <StepActions step={step.id} actor={recipient} view={view} />}
          {recipient && (() => {
            const why = impairment(grim[recipient]);
            return <>
              {sug && <div className={`nh-suggest ${why ? 'impaired' : ''}`}>
                <b>{tr("💡 Suggested:")}</b> {sug.why}
                {why && <div className="warn small">⚠ {name(recipient)} {why}{tr(": you may give false information instead.")}</div>}
                {sug.card && !sug.pair && sug.value === undefined && <div><button className="btn small primary" onClick={() => send(sug.card!)}>{tr("Send this")}</button></div>}
              </div>}
              <HelperCard key={`${step.id}:${recipient}:${sug?.pair ? `${sug.pair.a}${sug.pair.b}` : ''}`} step={step.id} view={view} send={send} suggestion={sug} />
            </>;
          })()}
        </div>
      )}
    </div>
  );
}

/** One-click reminders and kills implied by the acting player's choice. */
function StepActions({ step, actor, view }: { step: string; actor: string; view: GameView }) {
  const self = st(view);
  const seat = self.grimoire.find(g => g.id === actor);
  const target = seat?.nightChoice[0];
  if (!target) return null;
  const tName = view.players.find(p => p.id === target)?.name ?? '?';
  const reminder = CHOICE_REMINDER[step];
  const isDemon = CHARACTER_BY_ID[step]?.type === 'demon';
  const mark = () => {
    // move the token: it leaves whoever had it, and goes to the new target
    for (const g of self.grimoire) if (g.id !== target && g.reminders.includes(reminder)) void act('st:reminders', { playerId: g.id, reminders: g.reminders.filter(r => r !== reminder) });
    const t = self.grimoire.find(g => g.id === target)!;
    if (!t.reminders.includes(reminder)) void act('st:reminders', { playerId: target, reminders: [...t.reminders, reminder] });
  };
  const warnings = isDemon ? killWarnings(target, view) : [];
  const already = self.grimoire.find(g => g.id === target)?.reminders.includes(reminder ?? '');
  return (
    <div className="nh-actions">
      {reminder && <button className="btn small" disabled={already} onClick={mark}>{already ? tr("✓ {tName} is marked {reminder}", { tName, reminder }) : tr("🏷 Mark {tName} as {reminder}", { tName, reminder })}</button>}
      {isDemon && <>
        {warnings.length > 0 && <div className="warn small">⚠ {tName} {warnings.join('; ')}.</div>}
        {self.pendingDawnDeaths.includes(target)
          ? <span className="small">✓ {tName} {tr("will be found dead at dawn.")}</span>
          : <button className="btn small danger" onClick={() => confirmKill(view, target)}>{tr("☠ Kill")}{' '}{tName} {tr("(at dawn)")}</button>}
      </>}
    </div>
  );
}

/** At the start of a night: clear last night's one-night reminders. */
function ClearNightly({ view }: { view: GameView }) {
  const self = st(view);
  const stale = self.grimoire.filter(g => g.reminders.some(r => NIGHTLY_REMINDERS.includes(r)));
  if (!stale.length) return null;
  const clear = () => { for (const g of stale) void act('st:reminders', { playerId: g.id, reminders: g.reminders.filter(r => !NIGHTLY_REMINDERS.includes(r)) }); };
  return <p className="small">🧹 {stale.length} {tr("player")}{stale.length > 1 ? tr("s have") : tr(" has")} {tr("last night's markers (Poisoned, Protected…).")}{' '}<button className="btn small ghost" onClick={clear}>{tr("Clear them")}</button></p>;
}

function HelperCard({ step, view, send, suggestion }: { step: string; view: GameView; send: (c: { text?: string; playerIds?: string[]; characterIds?: string[] }, to?: string | null) => unknown; suggestion?: Suggestion | null }) {
  const self = st(view);
  const kind = TEMPLATE[step] ?? 'text';
  const [a, setA] = useState(suggestion?.pair?.a ?? '');
  const [b, setB] = useState(suggestion?.pair?.b ?? '');
  const [c, setC] = useState<string | null>(suggestion?.pair?.c ?? null);
  const [text, setText] = useState('');
  const others = view.players;
  const playerSel = (v: string, set: (x: string) => void, label: string) => (
    <select aria-label={label} value={v} onChange={e => set(e.target.value)}><option value="">{label}</option>{others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
  );
  switch (kind) {
    case 'number':
      return <div className="nh-card">{tr("Show a number:")}{' '}{[0, 1, 2, 3, 4, 5].map(n => <button key={n} className={`btn small ${suggestion?.value === n ? 'suggested' : ''}`} title={suggestion?.value === n ? tr("Suggested (the true number)") : undefined} onClick={() => send({ text: tr("You learn: {n}", { n }) })}>{n}</button>)}</div>;
    case 'yesno':
      return <div className="nh-card">{tr("Answer:")}{' '}<button className={`btn small ${suggestion?.value === 'yes' ? 'suggested' : ''}`} onClick={() => send({ text: tr("Yes") })}>{tr("👍 Yes")}</button> <button className={`btn small ${suggestion?.value === 'no' ? 'suggested' : ''}`} onClick={() => send({ text: tr("No") })}>{tr("👎 No")}</button></div>;
    case 'pair':
      return (
        <div className="nh-card">
          <div className="row wrap">{playerSel(a, setA, 'Player 1')}{playerSel(b, setB, 'Player 2')}
            <CharSelect label={tr("Character")} value={c} filter={t => t === PAIR_TYPE[step]} onChange={setC} /></div>
          <div className="row wrap">
            <button className="btn small primary" disabled={!a || !b || !c} onClick={() => send({ text: tr("One of these two players is this character:"), playerIds: [a, b], characterIds: [c!] })}>{tr("Show")}</button>
            {step === 'librarian' && <button className="btn small" onClick={() => send({ text: tr("There are no Outsiders in play.") })}>{tr("No Outsiders in play")}</button>}
          </div>
        </div>
      );
    case 'character':
      return (
        <div className="nh-card row wrap">
          {step === 'grandmother' && playerSel(a, setA, 'Grandchild')}
          <CharSelect label={tr("Character")} value={c} onChange={setC} />
          <button className="btn small primary" disabled={!c || (step === 'grandmother' && !a)} onClick={() => send({ text: tr(step === 'grandmother' ? 'Your grandchild is:' : 'You learn this character:'), playerIds: a ? [a] : [], characterIds: [c!] })}>{tr("Show")}</button>
        </div>
      );
    case 'minions': {
      const demons = self.grimoire.filter(g => CHARACTER_BY_ID[g.characterId ?? '']?.type === 'demon').map(g => g.id);
      const minions = self.grimoire.filter(g => CHARACTER_BY_ID[g.characterId ?? '']?.type === 'minion').map(g => g.id);
      return <div className="nh-card"><button className="btn small primary" onClick={() => minions.forEach(m => send({ text: tr("The Demon is:"), playerIds: demons }, m))}>{tr("Show each Minion their Demon")}</button>
        <p className="muted small">{tr("Their screens already mark the evil team; this card also stays in their notes.")}</p></div>;
    }
    case 'demon': {
      const minions = self.grimoire.filter(g => CHARACTER_BY_ID[g.characterId ?? '']?.type === 'minion').map(g => g.id);
      const demons = self.grimoire.filter(g => CHARACTER_BY_ID[g.characterId ?? '']?.type === 'demon').map(g => g.id);
      const lunatics = self.grimoire.filter(g => g.characterId === 'lunatic');
      return <div className="nh-card">
        <button className="btn small primary" onClick={() => demons.forEach(d => send({ text: tr("Your Minions, and three characters not in play:"), playerIds: minions, characterIds: self.demonBluffs }, d))}>{tr("Show the Demon their Minions & bluffs")}</button>
        {lunatics.map(l => <button key={l.id} className="btn small" onClick={() => send({ text: tr("Your Minions, and three characters not in play:"), playerIds: l.fakeEvilTeam, characterIds: self.lunaticBluffs }, l.id)}>{tr("Lunatic's fake version")}</button>)}
      </div>;
    }
    default:
      return <form className="nh-card row" onSubmit={e => { e.preventDefault(); if (text.trim()) { void send({ text }); setText(''); } }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder={tr("Quick info card text…")} aria-label={tr("Info card text")} /><button className="btn small">{tr("Send")}</button></form>;
  }
}

function NightOrder({ view }: { view: GameView }) {
  const self = st(view);
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';
  const grim = Object.fromEntries(self.grimoire.map(g => [g.id, g]));
  const awake = self.grimoire.filter(g => g.awake);
  return (
    <div className="night-order">
      <NightHelper view={view} />
      <p className="muted small">{view.night <= 1 ? tr("First night") : tr("Night {night}", { night: view.night })}{tr(". Click a player to wake / sleep them (or click their avatar). Their choices appear in the Grimoire.")}</p>
      {awake.length > 0 && <div className="awake-list">{tr("Awake:")}{' '}{awake.map(g => (
        <button key={g.id} className={`chip ${self.focusId === g.id ? 'active' : ''}`} onClick={() => act('st:focus', { playerId: g.id })} title={tr("Talk to this player")}>{name(g.id)}{self.focusId === g.id ? ' 🎙' : ''}{g.nightChoice.length ? ` → ${g.nightChoice.map(name).join(', ')}` : ''}</button>
      ))}</div>}
      <ol>
        {self.nightOrder.map(step => (
          <li key={step.id} className="step">
            <b>{step.name}</b> <span className="muted small">{step.text}</span>
            <div className="row wrap">{step.players.map(pid => (
              <button key={pid} className={`btn small ${grim[pid]?.awake ? 'primary' : ''}`} onClick={() => act('st:wake', { playerId: pid })}>
                {grim[pid]?.awake ? tr("💤 Sleep") : tr("👁 Wake")} {name(pid)}{grim[pid]?.characterId !== step.id ? ` (${CHARACTER_BY_ID[grim[pid]?.characterId ?? '']?.name})` : ''}
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
      <textarea className="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder={tr("Private Storyteller notes…")} />
      <h3>{tr("Public announcements")}</h3><Announcements view={view} />
      <h3>{tr("Storyteller log")}</h3>
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
  const pool = useMemo(() => [
    ...CHARACTERS.filter(c => TYPES.includes(c.type) && (
      settings.script.length && !allEditions ? settings.script.includes(c.id)
        : allEditions || settings.edition === 'custom' || c.edition === settings.edition)),
    // homebrew characters are always available
    ...(settings.homebrew ?? []).map(h => CHARACTER_BY_ID[h.id]).filter(Boolean),
  ], [allEditions, settings.edition, settings.script, settings.homebrew]);
  const toggle = (id: string) => save({ characters: bag.includes(id) ? bag.filter(x => x !== id) : [...bag, id] });
  const counts = TYPES.map(t => bag.filter(id => CHARACTER_BY_ID[id]?.type === t).length);
  const modifiers = bag.map(id => CHARACTER_BY_ID[id]).filter(c => c?.setup);
  const randomFill = () => {
    // Experimental characters only go into a random bag when they are on the script
    const pick = (t: CharacterType, n: number) => pool.filter(c => c.type === t && (c.edition !== 'exp' || settings.script.includes(c.id))).sort(() => Math.random() - 0.5).slice(0, n).map(c => c.id);
    save({ characters: TYPES.flatMap((t, i) => pick(t, rec[i])) });
  };
  return (
    <div className="setup">
      <section>
        <h3>🌐 {tr("Language")}</h3>
        <select value={settings.language ?? 'en'} disabled={locked} onChange={e => save({ language: e.target.value as Lang })} aria-label={tr("Language of this game")}>
          {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <p className="muted small">{tr("Everyone plays this game in this language: the game screens, announcements and character abilities. Character names stay in English. It can't be changed once the game starts.")}</p>
      </section>
      <section>
        <h3>{tr("Script & characters")}</h3>
        <div className="row wrap">
          <label>{tr("Edition")}{' '}<select disabled={locked} value={settings.edition} onChange={e => save({ edition: e.target.value as Settings['edition'] })}>
            {Object.entries(EDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="custom">{tr("Custom (any edition)")}</option></select></label>
          <label className="chip"><input type="checkbox" checked={allEditions} onChange={e => setAllEditions(e.target.checked)} /> {tr("Show all editions")}</label>
          {!locked && <button className="btn small" onClick={randomFill}>{tr("🎲 Random recommended bag")}</button>}
        </div>
        <p className="muted small">{tr("Players:")}{' '}<b>{residents}</b> (+ {view.players.length - residents} {tr("Travellers). Official recommendation:")}{' '}{rec.map((n, i) => `${n} ${TYPE_LABEL[TYPES[i]]}`).join(', ')} {tr("— a guide only. Selected:")}{' '}<b>{bag.length}</b>/{residents}.</p>
        {residents < 7 && bag.some(id => CHARACTER_BY_ID[id]?.edition !== 'tb') && <p className="warn small">{tr("Bad Moon Rising and Sects & Violets are recommended for 7 or more players (Trouble Brewing works from 5).")}</p>}
        {residents <= 6 && <p className="muted small">{tr("Teensyville rules apply at")}{' '}{residents} {tr("players: no Minion or Demon info on the first night (unless the house rule says otherwise).")}</p>}
        {!locked && <ScriptImport settings={settings} />}
        {modifiers.length > 0 && <p className="warn small">{tr("Setup modifiers:")}{' '}{modifiers.map(c => `${c!.name} (${c!.setup})`).join('; ')}</p>}
        {TYPES.map((t, ti) => {
          const chars = pool.filter(c => c.type === t);
          return (
            <div key={t} className="type-group">
              <div className="type-head">
                <b>{tr(TYPE_LABEL[t])}</b> <span className={counts[ti] === rec[ti] ? 'ok' : 'off'}>{counts[ti]} {tr("/ rec.")}{' '}{rec[ti]}</span>
                {!locked && <button className="btn small ghost" onClick={() => save({ characters: bag.filter(id => CHARACTER_BY_ID[id].type !== t) })}>{tr("None")}</button>}
              </div>
              <div className="char-grid">
                {chars.map(c => (
                  <div key={c.id} className={`char-pick ${bag.includes(c.id) ? 'on' : ''}`}>
                    <label title={ability(c.id)}><input type="checkbox" disabled={locked} checked={bag.includes(c.id)} onChange={() => toggle(c.id)} /> {c.name}</label>
                    {bag.includes(c.id) && settings.publicList.visible && (
                      <label className="hide-toggle" title={tr("Hide from the public character list")}><input type="checkbox" checked={settings.publicList.hidden.includes(c.id)} onChange={e => save({ publicList: { ...settings.publicList, hidden: e.target.checked ? [...settings.publicList.hidden, c.id] : settings.publicList.hidden.filter(x => x !== c.id) } })} />{tr("hide")}</label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
      <HomebrewEditor settings={settings} locked={locked} save={save} />
      <section>
        <h3>{tr("Buildings (side rooms)")}</h3>
        <OpenBuildings view={view} settings={settings} />
      </section>
      <section>
        <h3>{tr("Weather")}</h3>
        <div className="chips">{WEATHERS.map(w => <button key={w.id} className={`chip ${(settings.weather ?? 'clear') === w.id ? 'active' : ''}`} onClick={() => save({ weather: w.id })}>{tr(w.label)}</button>)}</div>
        <p className="muted small">{tr("Only changes how the 3D town looks and sounds. You can change it at any time")}{view.phase === 'day' ? tr(" (today: {weather})", { weather: view.weather }) : ''}.</p>
      </section>
      <section>
        <h3>{tr("Public character list")}</h3>
        <label className="toggle"><input type="checkbox" checked={settings.publicList.visible} onChange={e => save({ publicList: { ...settings.publicList, visible: e.target.checked } })} /> {tr("Players can see the characters in play")}</label>
        {settings.publicList.visible && <label className="toggle"><input type="checkbox" checked={settings.publicList.showHiddenCount} onChange={e => save({ publicList: { ...settings.publicList, showHiddenCount: e.target.checked } })} /> {tr("Show the exact number of hidden characters (“+ 2 hidden” vs “+ some hidden”)")}</label>}
      </section>
      <section>
        <h3>{tr("Timers")}</h3>
        <TimersEditor timers={settings.timers} onChange={t => save({ timers: { ...settings.timers, ...t } })} />
      </section>
      <section>
        <h3>{tr("House rules")}</h3>
        <HouseRulesEditor rules={settings.houseRules} onChange={r => save({ houseRules: { ...settings.houseRules, ...r } })} />
      </section>
      <section>
        <h3>{tr("Fabled & Loric")}</h3>
        <p className="muted small">{tr("Both are public and not held by a player. Loric change how the whole game works.")}</p>
        <div className="char-grid">{CHARACTERS.filter(c => c.type === 'fabled' || c.type === 'loric').map(c => (
          <label key={c.id} className={`char-pick ${settings.fabled.includes(c.id) ? 'on' : ''}`} title={c.ability}>
            <input type="checkbox" checked={settings.fabled.includes(c.id)} onChange={() => save({ fabled: settings.fabled.includes(c.id) ? settings.fabled.filter(x => x !== c.id) : [...settings.fabled, c.id] })} /> {c.name}{c.type === 'loric' ? <span className="muted small"> {tr("(Loric)")}</span> : null}
          </label>
        ))}</div>
        {settings.fabled.includes('bootlegger') && <label className="field">{tr("Bootlegger rules (shown to all players)")}
          <BootleggerText value={settings.bootleggerRules} onSave={v => save({ bootleggerRules: v })} /></label>}
        {settings.fabled.includes('djinn') && <label className="field">{tr("Djinn: jinx rules in effect (shown to all players)")}
          <BootleggerText value={settings.djinnRules} onSave={v => save({ djinnRules: v })} /></label>}
      </section>
      <JinxPanel settings={settings} save={save} />
      <CoStorytellers view={view} />
      <BackupPanel view={view} />
      {view.self.id === 'st' && view.phase === 'lobby' && <HandOverToPlayer view={view} />}
      {self.availableRegions.length > 1 && <section>
        <h3>{tr("Voice region")}</h3>
        <select value={settings.region ?? ''} onChange={e => save({ region: e.target.value || null })}>
          <option value="">{tr("Automatic (closest to the group)")}</option>
          {self.availableRegions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <p className="muted small">{tr("Currently:")}{' '}{view.voice.region ?? tr("decided at start")}.</p>
      </section>}
    </div>
  );
}

function CoStorytellers({ view }: { view: GameView }) {
  const [name, setName] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const invite = async () => {
    const r = await act('st:addCo', { name });
    if (r.ok) { setLink(`${location.origin}/g/${view.code}?co=${r.token}`); setName(''); }
  };
  return (
    <section>
      <h3>{tr("🎩 Co-Storytellers")}</h3>
      <p className="muted small">{tr("A co-Storyteller sees the whole Grimoire and can do everything you can (wake players, send info, run votes). They are always with you in your current room, and the game keeps running if one of you drops out.")}</p>
      {view.coStorytellers.length > 0 && <ul className="small">{view.coStorytellers.map(c => <li key={c.id}>{c.connected ? '🟢' : '⚪'} {c.name} {view.self.id === 'st' && <button className="btn small" onClick={() => { if (confirm(tr("Make {c} the lead Storyteller? You become a co-Storyteller.", { c: c.name }))) void act('st:handOver', { toId: c.id }); }}>{tr("👑 Hand over")}</button>} <button className="btn small ghost" onClick={() => { if (confirm(tr("Remove {c} as co-Storyteller?", { c: c.name }))) void act('st:removeCo', { id: c.id }); }}>{tr("Remove")}</button></li>)}</ul>}
      {view.coStorytellers.length < 2 && <div className="row"><input value={name} onChange={e => setName(e.target.value)} placeholder={tr("Their name")} maxLength={24} />
        <button className="btn small" disabled={!name.trim()} onClick={invite}>{tr("Invite")}</button></div>}
      {link && <p className="small">{tr("Send this private link to them (anyone with it becomes a Storyteller):")}{' '}<input readOnly value={link} onFocus={e => e.target.select()} aria-label={tr("Co-Storyteller link")} />
        <button className="btn small" onClick={() => navigator.clipboard?.writeText(link)}>{tr("Copy")}</button></p>}
    </section>
  );
}

/** Before the game starts, swap places with a player: they run the game and you take their seat. */
function HandOverToPlayer({ view }: { view: GameView }) {
  const [to, setTo] = useState('');
  const humans = view.players.filter(p => !p.bot);
  if (!humans.length) return null;
  const name = humans.find(p => p.id === to)?.name;
  return (
    <section>
      <h3>{tr("👑 Hand over the Storyteller role")}</h3>
      <p className="muted small">{tr("Want to play instead? Swap with a player: they become the Storyteller and you take their seat. Once the game has started you can only hand over to a co-Storyteller.")}</p>
      <div className="row">
        <select value={to} onChange={e => setTo(e.target.value)} aria-label={tr("New Storyteller")}>
          <option value="">{tr("Choose a player…")}</option>
          {humans.map(p => <option key={p.id} value={p.id}>{p.name}{p.connected ? '' : tr(" (offline)")}</option>)}
        </select>
        <button className="btn small" disabled={!to} onClick={() => { if (confirm(tr("Make {name} the Storyteller? You take their seat.", { name }))) void act('st:handOver', { toId: to }); }}>{tr("Hand over")}</button>
      </div>
    </section>
  );
}

/** The Storyteller's own characters. They join the bag like any other and the Bootlegger announces them. */
function HomebrewEditor({ settings, locked, save }: { settings: Settings; locked: boolean; save: (p: Partial<Settings>) => unknown }) {
  const list = settings.homebrew ?? [];
  const blank: Homebrew = { id: '', name: '', type: 'townsfolk', ability: '', firstNight: null, otherNights: null, reminders: [] };
  const [edit, setEdit] = useState<Homebrew | null>(null);
  const [rem, setRem] = useState('');
  const commit = () => {
    if (!edit || !edit.name.trim()) return;
    const next = edit.id ? list.map(h => (h.id === edit.id ? edit : h)) : [...list, edit];
    void save({ homebrew: next });
    setEdit(null);
  };
  const slotSel = (v: NightSlot, on: (s: NightSlot) => void, label: string) => (
    <label className="field">{label}
      <select value={v ?? ''} onChange={e => on((e.target.value || null) as NightSlot)}>
        {NIGHT_SLOTS.map(s => <option key={s.id ?? 'none'} value={s.id ?? ''}>{tr(s.label)}</option>)}
      </select></label>
  );
  return (
    <section>
      <h3>{tr("🧪 Homebrew characters")}</h3>
      <p className="muted small">{tr("Make your own characters. They appear in the bag above, on the night order and in everyone's character list; the")}{' '}<b>{tr("Bootlegger")}</b> {tr("is added automatically so players know the script has homebrew. You resolve their abilities yourself, like any Storyteller-run character.")}</p>
      {list.length > 0 && <ul className="homebrew-list">{list.map(h => (
        <li key={h.id}><b>{h.name}</b> <span className={`muted small`}>({h.type})</span> <span className="small">{h.ability}</span>
          {!locked && <> <button className="btn small ghost" onClick={() => setEdit({ ...h })}>{tr("Edit")}</button>
            <button className="btn small ghost" onClick={() => { if (confirm(tr("Delete {h}?", { h: h.name }))) void save({ homebrew: list.filter(x => x.id !== h.id) }); }}>{tr("Delete")}</button></>}
        </li>))}</ul>}
      {!locked && !edit && list.length < 20 && <button className="btn small" onClick={() => setEdit({ ...blank })}>{tr("+ New homebrew character")}</button>}
      {locked && <p className="muted small">{tr("Homebrew characters can be changed only before the game starts.")}</p>}
      {edit && <div className="homebrew-form">
        <div className="row">
          <label className="field">{tr("Name")}<input value={edit.name} maxLength={30} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder={tr("e.g. Lamplighter")} autoFocus /></label>
          <label className="field">{tr("Type")}<select value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value as Homebrew['type'] })}>
            {HOMEBREW_TYPES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}</select></label>
        </div>
        <label className="field">{tr("Ability (what players read)")}<textarea value={edit.ability} maxLength={300} rows={3} onChange={e => setEdit({ ...edit, ability: e.target.value })} placeholder={tr("Each night, choose a player: …")} /></label>
        <div className="row">
          {slotSel(edit.firstNight, s => setEdit({ ...edit, firstNight: s }), tr('First night'))}
          {slotSel(edit.otherNights, s => setEdit({ ...edit, otherNights: s }), tr('Other nights'))}
        </div>
        <div className="field">{tr("Reminder tokens")}
          <div className="chips">{edit.reminders.map(r => <button key={r} className="chip" title={tr("Remove")} onClick={() => setEdit({ ...edit, reminders: edit.reminders.filter(x => x !== r) })}>{r} ✕</button>)}</div>
          {edit.reminders.length < 6 && <form className="row" onSubmit={e => { e.preventDefault(); const t = rem.trim(); if (t && !edit.reminders.includes(t)) setEdit({ ...edit, reminders: [...edit.reminders, t] }); setRem(''); }}>
            <input value={rem} maxLength={20} onChange={e => setRem(e.target.value)} placeholder={tr("e.g. Lit")} aria-label={tr("New reminder")} /><button className="btn small">{tr("Add")}</button></form>}
        </div>
        <div className="row end"><button className="btn small ghost" onClick={() => setEdit(null)}>{tr("Cancel")}</button><button className="btn small primary" disabled={!edit.name.trim()} onClick={commit}>{edit.id ? tr("Save") : tr("Add character")}</button></div>
      </div>}
    </section>
  );
}

function BackupPanel({ view }: { view: GameView }) {
  const download = async () => {
    const r = await act('st:backup');
    if (!r.ok) return;
    const blob = new Blob([r.file as string], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const safe = String(r.name ?? view.name).replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-') || 'game';
    a.download = `clocktower-${safe}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <section>
      <h3>{tr("💾 Game backup")}</h3>
      <p className="muted small">{tr("Download the whole game (Grimoire, notes, log) as a file. If the server ever loses it, open the lobby and press")}{' '}<b>{tr("📂 Restore backup")}</b> {tr("to carry on; players rejoin with their usual links. Keep the file private: it contains everyone's characters and seat codes.")}</p>
      <button className="btn small" onClick={() => void download()}>{tr("⬇ Download backup")}</button>
    </section>
  );
}

function JinxPanel({ settings, save }: { settings: Settings; save: (p: Partial<Settings>) => unknown }) {
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [text, setText] = useState('');
  const custom = settings.customJinxes ?? [];
  const ids = [...settings.characters, ...settings.script, ...settings.fabled];
  const found = jinxesFor(ids, custom);
  const ch = (id: string) => CHARACTER_BY_ID[id]?.name ?? id;
  const toDjinn = () => save({
    fabled: settings.fabled.includes('djinn') ? settings.fabled : [...settings.fabled, 'djinn'],
    djinnRules: found.map(j => `${ch(j.a)} & ${ch(j.b)}: ${j.text}`).join('\n'),
  });
  return (
    <section>
      <h3>{tr("⚠ Jinxes")}</h3>
      <p className="muted small">{tr("Special rulings when two particular characters are in the same game. The built-in list is a starter list written from memory:")}{' '}<b>{tr("check the official wiki")}</b> {tr("for the current jinxes, and add your own below.")}</p>
      {found.length === 0 ? <p className="small">{tr("No jinxes between the characters in your bag, script or Fabled.")}</p> : <>
        <ul className="jinx-list">{found.map((j, i) => <li key={i}><b>{ch(j.a)} {tr("&")}{' '}{ch(j.b)}</b>{j.custom ? <span className="muted small"> {tr("(yours)")}</span> : null}: {j.text}</li>)}</ul>
        <button className="btn small" onClick={toDjinn}>{tr("Add the Djinn and announce these to everyone")}</button>
      </>}
      <details><summary className="small">{tr("Your own jinxes (")}{custom.length})</summary>
        <ul className="jinx-list">{custom.map((j, i) => <li key={i}><b>{ch(j.a)} {tr("&")}{' '}{ch(j.b)}</b>: {j.text} <button className="btn small ghost" onClick={() => save({ customJinxes: custom.filter((_, k) => k !== i) })}>{tr("Remove")}</button></li>)}</ul>
        <div className="row wrap">
          <CharSelect label={tr("First character")} value={a} onChange={setA} />
          <CharSelect label={tr("Second character")} value={b} onChange={setB} />
        </div>
        <div className="row"><input value={text} onChange={e => setText(e.target.value)} placeholder={tr("The ruling, e.g. Only one of them can be in play.")} maxLength={300} />
          <button className="btn small" disabled={!a || !b || a === b || !text.trim()} onClick={() => { void save({ customJinxes: [...custom, { a: a!, b: b!, text }] }); setA(null); setB(null); setText(''); }}>{tr("Add jinx")}</button></div>
      </details>
    </section>
  );
}

function ScriptImport({ settings }: { settings: Settings }) {
  const [open, setOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [mine] = useState(loadScripts);
  const use = (sc: { name: string; ids: string[] }) => act('st:settings', { settings: { script: sc.ids, scriptName: sc.name, characters: settings.characters.filter(id => sc.ids.includes(id)) } });
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => {
    try {
      const { ids, unknown, name } = parseScript(text);
      if (!ids.length) { setMsg(tr('No known characters found in that script.')); return; }
      void act('st:settings', { settings: { script: ids, scriptName: name, characters: settings.characters.filter(id => ids.includes(id)) } });
      setMsg(unknown.length ? tr('Loaded {n} characters; {u} not recognised (homebrew?): {names}.', { n: ids.length, u: unknown.length, names: unknown.slice(0, 6).join(', ') }) : tr('Loaded {n} characters.', { n: ids.length }));
      setOpen(false);
    } catch (e) { setMsg(tr('Could not read the script: {error}', { error: (e as Error).message })); }
  };
  return (
    <div className="script-import">
      {settings.script.length > 0
        ? <p className="small">{tr("Custom script")}{settings.scriptName ? ` “${settings.scriptName}”` : ''}: {settings.script.length} {tr("characters.")}{' '}<button className="btn small ghost" onClick={() => act('st:settings', { settings: { script: [], scriptName: null } })}>{tr("Clear script")}</button></p>
        : <button className="btn small" onClick={() => setOpen(!open)}>{tr("Import custom script (JSON)")}</button>}
      <div className="row">
        <button className="btn small" onClick={() => setBuilding(true)}>{tr("📜 Script builder")}</button>
        {mine.length > 0 && (
          <select aria-label={tr("My scripts")} value="" onChange={e => { const sc = mine.find(x => x.id === e.target.value); if (sc) void use(sc); }}>
            <option value="">{tr("My scripts…")}</option>
            {mine.map(sc => <option key={sc.id} value={sc.id}>{sc.name} ({sc.ids.length})</option>)}
          </select>
        )}
      </div>
      {building && <ScriptBuilder initial={settings.script.length ? { name: settings.scriptName ?? '', ids: settings.script } : undefined} onClose={() => setBuilding(false)} onUse={sc => void use(sc)} />}
      {open && <>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder={tr("Paste a Script Tool JSON, e.g. [{\"id\":\"_meta\",\"name\":\"My script\"},\"washerwoman\",\"imp\"]")} aria-label={tr("Script JSON")} />
        <button className="btn small primary" onClick={load}>{tr("Load script")}</button>
      </>}
      {msg && <p className="muted small">{msg}</p>}
    </div>
  );
}

function OpenBuildings({ view, settings }: { view: GameView; settings: Settings }) {
  const open = new Set(view.rooms.filter(r => r.kind === 'private').map(r => Number(r.id.slice(1))));
  const chosen = settings.openBuildings;
  const minimum = Math.max(3, Math.ceil(view.players.length / 2));
  const save = (list: number[]) => act('st:settings', { settings: { openBuildings: list } });
  const toggle = (i: number) => {
    const base = chosen.length ? chosen : [...open];
    void save(base.includes(i) ? base.filter(x => x !== i) : [...base, i]);
  };
  return (
    <div>
      <p className="muted small">
        {tr("Choose which buildings are open. The rules need at least")}{' '}<b>{minimum}</b> {tr("for")}{' '}{view.players.length} {tr("players; if you pick fewer, the first unchosen buildings are opened to make up the number.")}
        {chosen.length === 0 && tr(" Currently automatic.")} {tr("Players inside a building you close are sent back to the Town Square.")}
      </p>
      <div className="char-grid">
        {ROOM_NAMES.map((name, i) => (
          <label key={name} className={`char-pick ${open.has(i) ? 'on' : ''}`}>
            <span><input type="checkbox" checked={open.has(i)} onChange={() => toggle(i)} /> {ROOM_ICONS[i]} {name.replace(/^The /, '')}</span>
            {open.has(i) && chosen.length > 0 && !chosen.includes(i) && <span className="hide-toggle">{tr("auto")}</span>}
          </label>
        ))}
      </div>
      {chosen.length > 0 && <button className="btn small ghost" onClick={() => save([])}>{tr("Back to automatic")}</button>}
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
            <span>{tr(TIMER_LABELS[k])}</span>
            <input type="number" min={k === 'voteSeconds' ? 1 : 5} max={3600} disabled={manual} value={manual ? '' : v as number}
              onChange={e => onChange({ [k]: Number(e.target.value) } as Partial<Timers>)} aria-label={tr("{x} seconds", { x: tr(TIMER_LABELS[k]) })} />
            <span className="muted small">{tr("sec")}</span>
            {k !== 'voteSeconds' && k !== 'speedRound' && <label className="chip"><input type="checkbox" checked={manual} onChange={e => onChange({ [k]: e.target.checked ? null : 60 } as Partial<Timers>)} /> {tr("no limit (I end it)")}</label>}
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
              <label className="toggle"><input type="checkbox" checked={v !== null} onChange={e => onChange({ [k]: e.target.checked ? num.default : null })} /> {tr(info.label)}</label>
              {v !== null && <><input type="number" min={num.min} max={num.max} value={v} onChange={e => onChange({ [k]: Number(e.target.value) })} aria-label={tr(info.label)} /> <span className="muted small">{num.unit}</span></>}
              <p className="muted small">{tr(info.help)} <i>{tr("Source:")}{' '}{info.source}</i></p>
            </div>
          );
        }
        return (
          <div key={k} className="rule">
            <label className="toggle"><input type="checkbox" checked={!!rules[k]} onChange={e => onChange({ [k]: e.target.checked })} /> {tr(info.label)}</label>
            <p className="muted small">{tr(info.help)} <i>{tr("Source:")}{' '}{info.source}</i></p>
          </div>
        );
      })}
    </div>
  );
}
