import { useEffect, useRef, useState } from 'react';
import { rpc, saveSession, set, pushAlert } from '../net';
import type { LobbyEntry, LobbyChatMsg, Avatar } from '../../../shared/types';
import { useAccount, fetchLeaderboard, setHideFromFriends, type FriendRow } from '../account';
import { defaultAvatar } from '../../../shared/types';
import { AvatarCreator } from './Avatar';
import { AccountButton } from './AccountDialog';
import { LegalLinks } from './Legal';
import { useInstall, installNow } from '../install';
import { ScriptBuilder } from './ScriptBuilder';
import { loadScripts, fromShareParam, saveScript, newScriptId, type SavedScript } from '../scripts';
import { act } from '../net';
import { Countdown, fromLocalInput } from './Schedule';
import { loadHistory, stats } from '../history';
import { CHARACTER_BY_ID } from '../../../shared/characters';

export function Lobby() {
  const { account } = useAccount();
  const [games, setGames] = useState<LobbyEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [practice, setPractice] = useState(false);
  const [builder, setBuilder] = useState<Partial<SavedScript> | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // a shared script link (/?script=…): offer to save it
  useEffect(() => {
    const v = new URLSearchParams(location.search).get('script');
    if (!v) return;
    history.replaceState(null, '', '/');
    const sc = fromShareParam(v);
    if (!sc) return pushAlert('That script link could not be read.', 'error');
    const saved = { id: newScriptId(), ...sc, updated: Date.now() };
    saveScript(saved);
    pushAlert(`“${sc.name}” was added to My scripts.`, 'info');
    setBuilder(saved);
  }, []);
  const [code, setCode] = useState('');
  const [chat, setChat] = useState<LobbyChatMsg[]>([]);
  useEffect(() => {
    const load = () => rpc('lobby:list').then(r => { if (r.ok) { setGames(r.games); setChat(r.chat ?? []); } });
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);
  const go = (c: string) => { history.pushState(null, '', `/g/${c.toUpperCase()}`); dispatchEvent(new PopStateEvent('popstate')); };

  return (
    <div className="lobby-page">
    <div className="lobby">
      <header className="lobby-hero">
        <div className="account-corner">{account?.isAdmin && <a className="btn small ghost" href="/admin" title="Admin page: games, lobby chat and accounts">🛠 Admin</a>}<AccountButton /></div>
        <div>
          <h1>Clocktower Nights</h1>
          <p className="subtitle">An unofficial, voice-first fan table for <i>Blood on the Clocktower</i>, for private play among friends.</p>
        </div>
      </header>
      <div className="lobby-grid">
        <section className="panel glass">
          <h2>Open games</h2>
          {games.length === 0 && <p className="muted">No public games right now. Create one!</p>}
          <table className="games open-games">
            <thead><tr><th>Name</th><th>Players</th><th>Script</th><th>Status</th><th /></tr></thead>
            <tbody>
              {[...games].sort((a, b) => Number(!!b.lookingFor) - Number(!!a.lookingFor)).map(g => (
                <tr key={g.id}>
                  <td>{g.name}{g.lookingFor && <div className="looking-for small">🔎 Looking for {g.lookingFor.count} more{g.lookingFor.note ? `: ${g.lookingFor.note}` : ''}</div>}</td><td className="og-players">{g.players}/{g.max}</td><td className="og-script">{g.edition}</td>
                  <td><span className={`status ${g.status.replace(' ', '-')}`}>{g.status}</span>{g.scheduledFor && g.status === 'waiting' && <div className="small"><Countdown at={g.scheduledFor} /></div>}</td>
                  <td className="row"><button className="btn small" onClick={() => go(g.code)}>{g.status === 'waiting' ? 'Join' : 'Join / Watch'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <LobbyChat chat={chat} onChat={setChat} />
        </section>
        <section className="panel glass">
          <h2>Private game</h2>
          <form className="row" onSubmit={e => { e.preventDefault(); if (code.trim()) go(code.trim()); }}>
            <input aria-label="Invite code" placeholder="Invite code" value={code} maxLength={8} onChange={e => setCode(e.target.value.toUpperCase())} />
            <button className="btn">Join</button>
          </form>
          <hr />
          <h2>Host a game</h2>
          <p className="muted">Whoever creates the game is its Storyteller.</p>
          <div className="row"><button className="btn primary" onClick={() => setCreating(true)}>Create game</button>
            <button className="btn ghost" onClick={() => setBuilder({})}>📜 Script builder</button>
            <RestoreButton /></div>
          <hr />
          <h2>New to the game?</h2>
          <p className="muted">Play a short guided practice game with six computer players. The Guide explains each step.</p>
          <InstallApp />
          <div className="row"><button className="btn" onClick={() => setPractice(true)}>🎓 Learn to play</button>
            <button className="btn ghost" onClick={() => setShowHistory(true)}>📊 My games</button></div>
        </section>
      </div>
      {creating && <CreateDialog onClose={() => setCreating(false)} />}
      {practice && <PracticeDialog onClose={() => setPractice(false)} />}
      {builder && <ScriptBuilder initial={builder} onClose={() => setBuilder(null)} />}
      {showHistory && <HistoryDialog onClose={() => setShowHistory(false)} />}
      <footer className="legal">Blood on the Clocktower is © The Pandemonium Institute. This is a non-commercial fan project for private play. <LegalLinks /></footer>
    </div>
    </div>
  );
}

/** "Install the app" (Add to Home Screen), with steps for iPhone/iPad where browsers can't prompt. */
function InstallApp() {
  const how = useInstall();
  const [steps, setSteps] = useState(false);
  if (!how) return null;
  return (
    <div className="install-app">
      <button className="btn small" onClick={() => (how === 'prompt' ? void installNow() : setSteps(s => !s))}>📲 Install the app</button>
      {steps && (how === 'ios'
        ? <p className="small">On iPhone or iPad (in Safari): tap the <b>Share</b> button <span aria-hidden>⬆</span> at the bottom, then <b>Add to Home Screen</b>, then <b>Add</b>.</p>
        : <p className="small">Open your browser's menu (<b>⋮</b> or <b>⋯</b>) and choose <b>Install app</b> or <b>Add to Home screen</b>. In Chrome or Edge on a computer, there is also an install icon at the right end of the address bar.</p>)}
    </div>
  );
}

/** Friends' leaderboard: accounts that finished games with you. */
function FriendsBoard() {
  const { account } = useAccount();
  const [rows, setRows] = useState<FriendRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (account) void fetchLeaderboard().then(r => r.ok ? setRows(r.rows ?? []) : setErr(r.error ?? 'Could not load.')); }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!account) return <p className="muted">Sign in (top right of the lobby) to see a leaderboard of the people you have played with. Only signed-in players who finished a game with you appear.</p>;
  if (err) return <p className="warn">{err}</p>;
  if (!rows) return <p className="muted">Loading…</p>;
  const pct = (w: number, g: number) => (g ? `${Math.round((w / g) * 100)}%` : '—');
  return <>
    {rows.length <= 1 && <p className="muted">Nobody yet: friends appear here once they sign in and finish a game with you.</p>}
    <table className="games history">
      <thead><tr><th>#</th><th>Name</th><th>Wins</th><th>Games</th><th>Win rate</th><th>Evil wins</th><th>MVP</th><th>Storyteller</th><th>With you</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={r.id} className={r.you ? 'me' : ''}>
          <td>{i + 1}</td><td>{r.name}{r.you ? ' (you)' : ''}</td><td><b>{r.wins}</b></td><td>{r.games}</td><td>{pct(r.wins, r.games)}</td>
          <td>{r.evilWins}</td><td>{r.mvps}</td><td>{r.storytold}</td><td>{r.you ? '—' : r.together}</td>
        </tr>
      ))}</tbody>
    </table>
    <label className="small"><input type="checkbox" checked={!!account.hideFromFriends} onChange={e => void setHideFromFriends(e.target.checked)} /> Hide me from other people's leaderboards</label>
  </>;
}

function HistoryDialog({ onClose }: { onClose: () => void }) {
  const [list] = useState(loadHistory);
  const [tab, setTab] = useState<'mine' | 'friends'>('mine');
  const s = stats(list);
  const pct = (w: number, g: number) => (g ? `${Math.round((w / g) * 100)}%` : '—');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal parchment wide" role="dialog" aria-label="My games" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h2>📊 My games</h2><button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>My games</button>
          <button role="tab" aria-selected={tab === 'friends'} className={tab === 'friends' ? 'active' : ''} onClick={() => setTab('friends')}>🏅 Friends</button>
        </div>
        {tab === 'friends' ? <FriendsBoard /> : list.length === 0 ? <p className="muted">No finished games yet. Games you finish in this browser appear here.</p> : <>
          <div className="stat-cards">
            <div><b>{s.games}</b><span>games played</span></div>
            <div><b>{pct(s.wins, s.games)}</b><span>won</span></div>
            <div className="good"><b>{pct(s.good.wins, s.good.games)}</b><span>won as good ({s.good.games})</span></div>
            <div className="evil"><b>{pct(s.evil.wins, s.evil.games)}</b><span>won as evil ({s.evil.games})</span></div>
            <div><b>{s.mvps}</b><span>MVP awards</span></div>
            <div><b>{s.storytold}</b><span>games as Storyteller</span></div>
          </div>
          {s.topCharacters.length > 0 && <p className="small">Most played: {s.topCharacters.map(([id, n]) => `${CHARACTER_BY_ID[id]?.name ?? id} (${n})`).join(', ')}</p>}
          <table className="games history">
            <thead><tr><th>Date</th><th>Game</th><th>You</th><th>Result</th><th>MVP</th></tr></thead>
            <tbody>{list.map(h => (
              <tr key={h.gameId}>
                <td className="small">{new Date(h.endedAt).toLocaleDateString()}</td>
                <td>{h.name} <span className="muted small">· {h.players} players</span></td>
                <td>{h.role === 'storyteller' ? 'Storyteller' : <><span className={`align ${h.alignment}`}>{CHARACTER_BY_ID[h.character ?? '']?.name ?? '—'}</span>{h.survived === false ? ' 👻' : ''}</>}</td>
                <td>{h.winner ? `${h.winner === 'good' ? 'Good' : 'Evil'} won` : '—'}{h.won === true ? ' ✓' : h.won === false ? ' ✗' : ''}</td>
                <td>{h.mvpMe ? '🏆 you' : h.mvp.join(', ') || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </>}
        {tab === 'mine' && <p className="muted small">Kept in this browser (and in your account, if you are signed in).</p>}
      </div>
    </div>
  );
}

/** A small public chat for finding players. Kept in server memory only (the last 50 messages). */
function LobbyChat({ chat, onChat }: { chat: LobbyChatMsg[]; onChat: (c: LobbyChatMsg[]) => void }) {
  const [text, setText] = useState('');
  const [name, setName] = useState(() => localStorage.getItem('botc:name') ?? '');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [chat.length]);
  const send = async () => {
    if (!text.trim()) return;
    try { localStorage.setItem('botc:name', name); } catch { /* ignore */ }
    const r = await rpc('lobby:chat', { name, text });
    if (!r.ok) return pushAlert(r.error ?? 'Not sent', 'error');
    setText('');
    if (r.chat) onChat(r.chat);
  };
  return (
    <div className="lobby-chat">
      <h3>💬 Lobby chat <span className="muted small">(looking for a game? say hi)</span></h3>
      <div className="lobby-chat-log" ref={box} aria-live="polite">
        {chat.length === 0 && <p className="muted small">No messages yet.</p>}
        {chat.map(m => <p key={m.id} className="small"><span className="muted">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> <b>{m.name}</b>: {m.text}</p>)}
      </div>
      <form className="row" onSubmit={e => { e.preventDefault(); void send(); }}>
        <input aria-label="Your name" placeholder="Name" value={name} maxLength={24} onChange={e => setName(e.target.value)} style={{ maxWidth: '7rem' }} />
        <input aria-label="Message" placeholder="Message everyone in the lobby" value={text} maxLength={200} onChange={e => setText(e.target.value)} />
        <button className="btn small" disabled={!name.trim() || !text.trim()}>Send</button>
      </form>
      <p className="muted small">Public and not saved: it disappears after 50 messages or a server restart. Be kind (<a href="/terms">Terms</a>).</p>
    </div>
  );
}

/** Upload a backup file the Storyteller downloaded earlier and carry on that game. */
function RestoreButton() {
  const ref = useRef<HTMLInputElement>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) return pushAlert('That file is too big to be a backup.', 'error');
    const r = await rpc('game:restore', { file: await f.text() });
    if (ref.current) ref.current.value = '';
    if (!r.ok) return pushAlert(r.error ?? 'Could not restore the game.', 'error');
    const s = { gameId: r.gameId, code: r.code, token: r.token, id: 'st' };
    saveSession(s);
    set({ session: s });
    pushAlert('Game restored. Players can rejoin with their usual link; it is paused until you resume.', 'info');
  };
  return <>
    <button className="btn ghost" onClick={() => ref.current?.click()} title="Carry on a game from a backup file you downloaded as its Storyteller">📂 Restore backup</button>
    <input ref={ref} type="file" accept=".json,application/json" hidden onChange={e => void pick(e.target.files?.[0])} />
  </>;
}

function PracticeDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState(() => localStorage.getItem('botc:name') ?? '');
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    let avatar: unknown;
    try { localStorage.setItem('botc:name', name); avatar = JSON.parse(localStorage.getItem('botc:avatar') ?? 'null'); } catch { /* ignore */ }
    const r = await rpc('game:tutorial', { name, avatar: avatar ?? undefined });
    setBusy(false);
    if (!r.ok) return pushAlert(r.error ?? 'Failed', 'error');
    const s = { gameId: r.gameId, code: r.code, token: r.token, id: r.id };
    saveSession(s);
    set({ session: s });
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal parchment" role="dialog" aria-label="Practice game" onClick={e => e.stopPropagation()}>
        <h2>🎓 Practice game</h2>
        <p>You will play one short game of <i>Trouble Brewing</i> as the <b>Empath</b>, with six computer players. The Guide (an automatic Storyteller) explains every step: your character, the night, discussion, private rooms, nominations and voting. It takes about 5 minutes.</p>
        <label className="field">Your name<input value={name} maxLength={24} onChange={e => setName(e.target.value)} placeholder="e.g. Mortimer" autoFocus /></label>
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!name.trim() || busy} onClick={start}>Start practice</button></div>
      </div>
    </div>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [stName, setStName] = useState(() => localStorage.getItem('botc:name') ?? '');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [edition, setEdition] = useState('tb');
  const [avatar, setAvatar] = useState<Avatar>(defaultAvatar);
  const [mine] = useState(loadScripts);
  const [when, setWhen] = useState('');
  const create = async () => {
    const custom = mine.find(x => `my:${x.id}` === edition);
    const r = await rpc('game:create', { name, visibility, stName, stAvatar: avatar, edition: custom ? 'custom' : edition, scheduledFor: fromLocalInput(when) });
    if (!r.ok) return pushAlert(r.error ?? 'Failed', 'error');
    const s = { gameId: r.gameId, code: r.code, token: r.token, id: 'st' };
    saveSession(s);
    set({ session: s });
    if (custom) void act('st:settings', { settings: { script: custom.ids, scriptName: custom.name } });
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal parchment wide" role="dialog" aria-label="Create game" onClick={e => e.stopPropagation()}>
        <h2>Create a game</h2>
        <label className="field">Game name<input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Friday Night in Ravenswood" autoFocus /></label>
        <label className="field">Your name (Storyteller)<input value={stName} maxLength={24} onChange={e => setStName(e.target.value)} /></label>
        <div className="row">
          <label className="field">Visibility
            <select value={visibility} onChange={e => setVisibility(e.target.value as 'public' | 'private')}>
              <option value="public">Public — listed in the lobby</option>
              <option value="private">Private — invite code only</option>
            </select>
          </label>
          <label className="field">Edition
            <select value={edition} onChange={e => setEdition(e.target.value)}>
              <option value="tb">Trouble Brewing</option><option value="bmr">Bad Moon Rising</option>
              <option value="snv">Sects &amp; Violets</option><option value="custom">Custom (mix editions)</option>
              {mine.length > 0 && <optgroup label="My scripts">{mine.map(x => <option key={x.id} value={`my:${x.id}`}>{x.name}</option>)}</optgroup>}
            </select>
          </label>
        </div>
        <label className="field">Start time (optional: players see a countdown and can add it to their calendar)<input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></label>
        <AvatarCreator value={avatar} onChange={setAvatar} />
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!name.trim() || !stName.trim()} onClick={create}>Create</button></div>
      </div>
    </div>
  );
}
