import { useEffect, useState, type ReactNode } from 'react';
import { useStore, set, act } from '../net';
import type { GameView, InfoCard } from '../../../shared/types';
import { CHARACTER_BY_ID, DAY_ABILITIES, type Character } from '../../../shared/characters';

export function Alerts() {
  const alerts = useStore(s => s.alerts);
  return (
    <div className="alerts" role="status" aria-live="polite">
      {alerts.map(a => <div key={a.id} className={`alert ${a.kind}`}>{a.text}</div>)}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal parchment ${wide ? 'wide' : ''}`} role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h2>{title}</h2>{onClose && <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>}</div>
        {children}
      </div>
    </div>
  );
}

export const TYPE_LABEL: Record<string, string> = { townsfolk: 'Townsfolk', outsider: 'Outsider', minion: 'Minion', demon: 'Demon', traveller: 'Traveller', fabled: 'Fabled' };

export function CharacterToken({ ch, small }: { ch: Character; small?: boolean }) {
  return (
    <div className={`token ${ch.type} ${small ? 'small' : ''}`}>
      <div className="token-disc"><span>{ch.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span></div>
      <div className="token-text">
        <b>{ch.name}</b> <span className="type">{TYPE_LABEL[ch.type]}</span>
        {!small && <p>{ch.ability}</p>}
      </div>
    </div>
  );
}

export function CharacterModal({ view, onClose }: { view: GameView; onClose: () => void }) {
  if (view.self.isStoryteller) return null;
  const self = view.self;
  const ch = self.characterId ? CHARACTER_BY_ID[self.characterId] : null;
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';
  return (
    <Modal title="Your character" onClose={onClose}>
      {!ch && <p>You have not been given a character yet.</p>}
      {ch && <>
        <CharacterToken ch={ch} />
        <p className={`alignment ${self.alignment}`}>You are <b>{self.alignment === 'evil' ? 'Evil' : 'Good'}</b>.</p>
        {DAY_ABILITIES[ch.id] && <p className="muted">This character has a daytime ability: use the <b>Use Ability</b> button.</p>}
      </>}
      {self.evilTeam && self.evilTeam.members.length > 1 && (
        <div className="evil-box">
          <h3>Your evil team</h3>
          <ul>{self.evilTeam.members.map(m => <li key={m.id}>{name(m.id)}{m.id === self.id ? ' (you)' : ''} — <span className="evil-mark">{m.role === 'evil' ? 'evil' : m.role === 'demon' ? 'Demon' : 'Minion'}</span></li>)}</ul>
          {self.evilTeam.bluffs.length > 0 && <>
            <h3>Not in play (safe bluffs)</h3>
            <div className="token-row">{self.evilTeam.bluffs.map(id => <CharacterToken key={id} ch={CHARACTER_BY_ID[id]} small />)}</div>
          </>}
        </div>
      )}
      <h3>Notes from the Storyteller</h3>
      {self.notes.length === 0 ? <p className="muted">None yet.</p> : self.notes.map(n => <InfoCardView key={n.id} card={n} view={view} />)}
      {self.revealedTo.length > 0 && <>
        <h3>Characters shown to you</h3>
        <ul>{self.revealedTo.map((r, i) => <li key={i}>{name(r.fromId)} showed: <b>{CHARACTER_BY_ID[r.characterId]?.name}</b></li>)}</ul>
      </>}
      <p className="muted small">Shortcut: press <kbd>P</kbd> to open this at any time.</p>
    </Modal>
  );
}

export function InfoCardView({ card, view }: { card: InfoCard; view: GameView }) {
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';
  return (
    <div className="info-card">
      <div className="when">{card.when}</div>
      {card.text && <p>{card.text}</p>}
      {card.playerIds.length > 0 && <div className="chips">{card.playerIds.map(id => <span key={id} className="chip">{name(id)}</span>)}</div>}
      {card.characterIds.length > 0 && <div className="token-row">{card.characterIds.map(id => <CharacterToken key={id} ch={CHARACTER_BY_ID[id]} small />)}</div>}
      {card.alignment && <p className={`alignment ${card.alignment}`}>{card.alignment === 'evil' ? 'Evil' : 'Good'}</p>}
    </div>
  );
}

export function InfoPopup({ view }: { view: GameView }) {
  const card = useStore(s => s.infoPopup);
  if (!card) return null;
  return <Modal title="The Storyteller shows you…" onClose={() => set({ infoPopup: null })}><InfoCardView card={card} view={view} /><p className="muted small">Saved in your notes (Character → Notes).</p></Modal>;
}

export function CharactersInPlay({ view, onClose }: { view: GameView; onClose: () => void }) {
  const list = view.characterList;
  if (!list) return null;
  const groups = ['townsfolk', 'outsider', 'minion', 'demon'];
  return (
    <Modal title="Characters in play" onClose={onClose} wide>
      {groups.map(t => {
        const chars = list.characters.map(id => CHARACTER_BY_ID[id]).filter(c => c.type === t);
        if (!chars.length) return null;
        return <div key={t}><h3>{TYPE_LABEL[t]}</h3>{chars.map(c => <CharacterToken key={c.id} ch={c} />)}</div>;
      })}
      {list.hiddenExists && <p className="hidden-note">+ {list.hiddenCount ?? 'some'} hidden character{list.hiddenCount === 1 ? '' : 's'}</p>}
      {list.fabled.length > 0 && <><h3>Fabled</h3>{list.fabled.map(id => <CharacterToken key={id} ch={CHARACTER_BY_ID[id]} />)}</>}
      {list.bootleggerRules && <><h3>House rules (Bootlegger)</h3><p className="bootlegger">{list.bootleggerRules}</p></>}
    </Modal>
  );
}

export function Confirm({ title, text, confirm, onYes, onNo }: { title: string; text: ReactNode; confirm: string; onYes: () => void; onNo: () => void }) {
  return (
    <Modal title={title} onClose={onNo}>
      <div>{text}</div>
      <div className="row end"><button className="btn ghost" onClick={onNo}>Cancel</button><button className="btn primary" autoFocus onClick={onYes}>{confirm}</button></div>
    </Modal>
  );
}

export function QuestionPrompt({ view }: { view: GameView }) {
  if (view.self.isStoryteller || view.phase !== 'questions' || view.self.questionAnswered) return null;
  return (
    <Modal title="A word with the Storyteller?">
      <p>Do you want to privately ask the Storyteller about your character or a rule?</p>
      <div className="row end">
        <button className="btn ghost" onClick={() => act('question', { yes: false })}>No thanks</button>
        <button className="btn primary" onClick={() => act('question', { yes: true })}>Yes</button>
      </div>
    </Modal>
  );
}

export function useCountdown(endsAt: number | null | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function TimerBadge({ view }: { view: GameView }) {
  const secs = useCountdown(view.timer?.endsAt);
  if (!view.timer) return null;
  const txt = secs === null ? 'no limit' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return <div className={`timer ${secs !== null && secs <= 10 ? 'urgent' : ''}`} aria-live="off"><span>{view.timer.label}</span> <b>{view.paused ? '⏸' : txt}</b></div>;
}

export function VoteBar({ view }: { view: GameView }) {
  const nom = view.nomination;
  const deadlineSecs = useCountdown(null);
  void deadlineSecs;
  if (!nom || (nom.done && view.stage !== 'nominations')) return null;
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';
  const me = !view.self.isStoryteller ? view.players.find(p => p.id === view.self.id) : null;
  const myIdx = me ? nom.order.indexOf(me.id) : -1;
  const canStillVote = me && !nom.done && (view.stage !== 'voting' || myIdx >= nom.voteIndex) && (nom.exile || me.alive || !me.ghostVoteUsed);
  const raised = me ? !!nom.hands[me.id] : false;
  const current = !nom.done && view.stage === 'voting' ? nom.order[nom.voteIndex] : null;
  return (
    <div className={`vote-bar ${nom.done ? 'done' : ''}`} role="region" aria-label="Vote">
      <div className="vote-title">
        {nom.exile ? 'Exile' : 'Nomination'}: <b>{name(nom.nominatorId)}</b> → <b>{name(nom.nomineeId)}</b>
        <span className="tally">{nom.tally} / {nom.needed} needed</span>
        {view.aboutToDie && <span className="block">On the block: {name(view.aboutToDie.playerId)} ({view.aboutToDie.votes})</span>}
      </div>
      {view.stage === 'accusation' && <div className="speech">🗣 {name(nom.nominatorId)} makes the accusation</div>}
      {view.stage === 'defense' && <div className="speech">🛡 {name(nom.nomineeId)} defends</div>}
      {current && <div className="speech">The clock hand points at <b>{name(current)}</b>{me?.id === current ? ' — that is YOU!' : ''}</div>}
      {nom.done && nom.result && <div className="speech">{nom.result}</div>}
      {canStillVote && (
        <div className="vote-buttons">
          <button className={`btn ${raised ? 'primary' : ''}`} onClick={() => act('vote', { raised: true })} aria-pressed={raised}>✋ Yes</button>
          <button className={`btn ${!raised ? 'primary' : ''}`} onClick={() => act('vote', { raised: false })} aria-pressed={!raised}>No</button>
          {me && !me.alive && !nom.exile && <span className="muted small">Voting yes spends your ghost vote.</span>}
        </div>
      )}
    </div>
  );
}

export function TransitionOverlay() {
  const t = useStore(s => s.transition);
  if (!t) return null;
  const text = t === 'night' ? 'Dusk falls…' : t === 'day' ? 'Dawn breaks…' : 'The game is over';
  return <div className={`transition ${t}`} aria-live="assertive"><span>{text}</span></div>;
}

export function NightSleep({ view }: { view: GameView }) {
  return (
    <div className="night-sleep">
      <div className="moon" aria-hidden />
      <h2>You are asleep</h2>
      <p>Night {view.night}. You cannot see or hear anything until the Storyteller wakes you.</p>
    </div>
  );
}
