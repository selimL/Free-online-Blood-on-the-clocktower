// Group actions (Al-Hadikhia, rock-paper-scissors, Boomdandy pointing) for players, and the
// Storyteller's panel for those plus secret words, the Ug hat and special win rules.
import { useEffect, useState } from 'react';
import type { GameView, PromptView, StorytellerSelf } from '../../../shared/types';
import { CHARACTER_BY_ID } from '../../../shared/characters';
import { act } from '../net';
import { Modal } from './Overlays';
import { tr } from '../i18n';

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [active]);
  return now;
}

/** For players: answer a group question; public pointing shows everyone's choices and a countdown. */
export function PromptForPlayer({ view }: { view: GameView }) {
  const me = view.self.isStoryteller ? null : view.self.id;
  const mine = view.prompts.find(p => !p.result && me && p.playerIds.includes(me) && (p.kind === 'point' || !p.answers[me]));
  const pub = view.prompts.find(p => p.public && !p.result && (!me || !p.playerIds.includes(me)));
  const now = useNow(!!(mine?.endsAt || pub?.endsAt));
  if (view.self.isStoryteller) return null;
  if (mine) return (
    <Modal title={mine.title}>
      {mine.endsAt && <p className="countdown-big">{Math.max(0, Math.ceil((mine.endsAt - now) / 1000))}</p>}
      <div className="row wrap">{mine.options.map(o => (
        <button key={o} className={`btn ${mine.answers[me!] === o ? 'primary' : ''}`} onClick={() => act('prompt', { promptId: mine.id, answer: o })}>
          {o === 'Rock' ? '✊ ' : o === 'Paper' ? '✋ ' : o === 'Scissors' ? '✌ ' : o === 'Live' ? '🕯 ' : o === 'Die' ? '💀 ' : '👉 '}{tr(o)}</button>
      ))}</div>
      <p className="muted small">{mine.kind === 'point' ? tr("Everyone can see who you point at. You can change your mind until the time runs out.") : tr("Only the Storyteller sees your choice.")}</p>
    </Modal>
  );
  if (pub) return <PointingBoard pr={pub} now={now} />;
  return null;
}

function PointingBoard({ pr, now }: { pr: PromptView; now: number }) {
  const counts: Record<string, number> = {};
  for (const a of Object.values(pr.answers)) counts[a] = (counts[a] ?? 0) + 1;
  return (
    <div className="pointing parchment" role="status">
      <b>👉 {pr.title}</b> {pr.endsAt && <span className="countdown-big small">{Math.max(0, Math.ceil((pr.endsAt - now) / 1000))}</span>}
      <div className="chips">{pr.options.map(o => <span key={o} className="chip">{tr(o)}: {counts[o] ?? 0}</span>)}</div>
    </div>
  );
}

/** The Storyteller's special-rules panel (Grimoire tab). */
export function SpecialRules({ view }: { view: GameView }) {
  const self = view.self as StorytellerSelf;
  const grim = self.grimoire;
  const has = (id: string) => grim.some(g => g.characterId === id);
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';
  const alive = view.players.filter(p => p.alive);
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<'rps' | 'livedie' | 'boom' | null>(null);
  const [words, setWords] = useState(self.secretWords);
  useEffect(() => setWords(self.secretWords), [self.secretWords.mezepheles, self.secretWords.yaggababble]);
  const togglePick = (id: string) => setPicked(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]));
  const need = mode === 'rps' ? 2 : 3;
  const ugOn = self.settings.fabled.includes('godofug');
  const nothing = !self.winRules.length && !self.wordHits.length && !view.prompts.length && !has('psychopath') && !has('alhadikhia') && !has('boomdandy') && !has('mezepheles') && !has('yaggababble') && !ugOn;
  if (nothing || view.phase === 'lobby') return null;
  const start = () => {
    if (mode === 'boom') void act('st:boomdandy', { survivors: picked });
    else void act('st:prompt', { kind: mode, playerIds: picked });
    setMode(null); setPicked([]);
  };
  const open = (m: 'rps' | 'livedie' | 'boom', pre: string[] = []) => { setMode(m); setPicked(pre); };
  const psycho = grim.find(g => g.characterId === 'psychopath');
  const alHad = grim.find(g => g.characterId === 'alhadikhia');
  const nominator = view.nomination?.nominatorId;
  return (
    <section className="special-rules">
      <h3>{tr("⚖ Special rules")}</h3>
      {self.winRules.length > 0 && <ul className="small">{self.winRules.map(r => <li key={r}>{r}</li>)}</ul>}
      <div className="row wrap">
        {has('psychopath') && <button className="btn small" onClick={() => open('rps', [psycho!.id, ...(nominator && nominator !== psycho!.id ? [nominator] : [])])}>{tr("✊ Rock-paper-scissors")}</button>}
        {has('alhadikhia') && <button className="btn small" onClick={() => open('livedie', alHad?.nightChoice.slice(0, 3) ?? [])}>{tr("🕯 Al-Hadikhia: live or die")}</button>}
        {has('boomdandy') && <button className="btn small danger" onClick={() => open('boom')}>{tr("💥 Boomdandy explodes")}</button>}
      </div>
      {ugOn && <label className="field">{tr("🎩 Ug hat (vote counts twice)")}
        <select value={view.ugHat ?? ''} onChange={e => act('st:ugHat', { playerId: e.target.value || null })}>
          <option value="">{tr("— nobody —")}</option>{view.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>}
      {(['mezepheles', 'yaggababble'] as const).filter(has).map(k => {
        const holder = grim.find(g => g.characterId === k)!;
        return (
          <div key={k} className="secret-word">
            <b>{CHARACTER_BY_ID[k].name}</b> ({name(holder.id)}{tr("): secret")}{' '}{k === 'mezepheles' ? tr("word") : tr("phrase")}
            <div className="row">
              <input value={words[k]} onChange={e => setWords({ ...words, [k]: e.target.value })} onBlur={() => act('st:word', { kind: k, word: words[k] })} placeholder={tr("choose one…")} maxLength={60} />
              <button className="btn small" disabled={!words[k]} onClick={() => act('st:info', { playerId: holder.id, card: { text: tr("Your secret {x} is: “{x2}”", { x: k === 'mezepheles' ? 'word' : 'phrase', x2: words[k] }) } })}>{tr("Tell them")}</button>
            </div>
            {k === 'mezepheles' ? (
              <select value="" onChange={e => { if (e.target.value) void act('st:mezephelesSaid', { playerId: e.target.value }); }} aria-label={tr("Who said the word")}>
                <option value="">{tr("🗣 Someone said it… choose who")}</option>{view.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <div className="row"><button className="btn small" onClick={() => act('st:yagga', { delta: 1 })}>{tr("🗣 Said it +1")}</button>
                <button className="btn small ghost" onClick={() => act('st:yagga', { delta: -1 })}>−1</button>
                <span className="small">{tr("Today:")}{' '}<b>{self.yaggababbleCount}</b> {tr("→ up to")}{' '}{self.yaggababbleCount} {self.yaggababbleCount === 1 ? tr("player") : tr("players")} {tr("might die tonight")}</span></div>
            )}
          </div>
        );
      })}
      {self.wordHits.map(h => (
        <div key={h.id} className="prompt-status word-hit">
          <b>{h.kind === 'mezepheles' ? tr("🗣 Mezepheles word?") : tr("🎩 Ug-hat slip?")}</b> {name(h.playerId)}: “{h.text}”
          <div className="row">
            {h.kind === 'mezepheles' && <button className="btn small danger" onClick={() => { void act('st:mezephelesSaid', { playerId: h.playerId }); void act('st:dismissWordHit', { id: h.id }); }}>{tr("Confirm:")}{' '}{name(h.playerId)} {tr("said it")}</button>}
            {h.kind === 'ug' && <select value="" onChange={e => { if (e.target.value) { void act('st:ugHat', { playerId: e.target.value }); void act('st:dismissWordHit', { id: h.id }); } }} aria-label={tr("Pass the hat")}><option value="">{tr("Pass the hat to…")}</option>{view.players.filter(p => p.id !== h.playerId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
            <button className="btn small ghost" onClick={() => act('st:dismissWordHit', { id: h.id })}>{tr("Not really")}</button>
          </div>
        </div>
      ))}
      {view.prompts.map(pr => (
        <div key={pr.id} className={`prompt-status ${pr.result ? 'done' : ''}`}>
          <b>{pr.kind === 'rps' ? tr("✊ Rock-paper-scissors") : pr.kind === 'livedie' ? tr("🕯 Live or die") : tr("👉 Pointing")}</b>: {pr.playerIds.map(id => `${name(id)}${pr.answers[id] ? ` → ${pr.answers[id]}` : ' …'}`).join(' · ')}
          {pr.result && <div className="small">{pr.result}</div>}
          <div className="row">
            {pr.kind === 'livedie' && pr.result && !pr.applied && <button className="btn small danger" onClick={() => act('st:applyPrompt', { promptId: pr.id })}>{tr("Apply deaths")}</button>}
            <button className="btn small ghost" onClick={() => act('st:dismissPrompt', { promptId: pr.id })}>{pr.result ? tr("Clear") : tr("Cancel")}</button>
          </div>
        </div>
      ))}
      {mode && (
        <div className="pick-players">
          <p className="small">{mode === 'rps' ? tr("Choose the two players (the Psychopath and their nominator).") : mode === 'livedie' ? tr("Choose the three players (they each choose, secretly, to live or die).") : tr("Choose the THREE players who survive. Everyone else dies, then the three point.")}</p>
          <div className="chips">{(mode === 'boom' ? alive : view.players).map(p => <button key={p.id} className={`chip ${picked.includes(p.id) ? 'active' : ''}`} onClick={() => togglePick(p.id)}>{p.name}</button>)}</div>
          <div className="row"><button className="btn small primary" disabled={picked.length !== need} onClick={start}>{tr("Start")}</button><button className="btn small ghost" onClick={() => setMode(null)}>{tr("Cancel")}</button></div>
        </div>
      )}
    </section>
  );
}
