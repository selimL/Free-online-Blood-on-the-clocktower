import { useEffect, useState } from 'react';
import { rpc, saveSession, set, pushAlert } from '../net';
import type { LobbyEntry, Avatar } from '../../../shared/types';
import { defaultAvatar } from '../../../shared/types';
import { AvatarCreator } from './Avatar';
import { ScriptBuilder } from './ScriptBuilder';
import { loadScripts, fromShareParam, saveScript, newScriptId, type SavedScript } from '../scripts';
import { act } from '../net';

export function Lobby() {
  const [games, setGames] = useState<LobbyEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [practice, setPractice] = useState(false);
  const [builder, setBuilder] = useState<Partial<SavedScript> | null>(null);
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
  useEffect(() => {
    const load = () => rpc('lobby:list').then(r => r.ok && setGames(r.games));
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);
  const go = (c: string) => { history.pushState(null, '', `/g/${c.toUpperCase()}`); dispatchEvent(new PopStateEvent('popstate')); };

  return (
    <div className="lobby-page">
    <div className="lobby">
      <header className="lobby-hero">
        <div>
          <h1>Clocktower Nights</h1>
          <p className="subtitle">An unofficial, voice-first fan table for <i>Blood on the Clocktower</i>, for private play among friends.</p>
        </div>
      </header>
      <div className="lobby-grid">
        <section className="panel glass">
          <h2>Open games</h2>
          {games.length === 0 && <p className="muted">No public games right now. Create one!</p>}
          <table className="games">
            <thead><tr><th>Name</th><th>Players</th><th>Script</th><th>Status</th><th /></tr></thead>
            <tbody>
              {games.map(g => (
                <tr key={g.id}>
                  <td>{g.name}</td><td>{g.players}/{g.max}</td><td>{g.edition}</td>
                  <td><span className={`status ${g.status.replace(' ', '-')}`}>{g.status}</span></td>
                  <td className="row"><button className="btn small" onClick={() => go(g.code)}>{g.status === 'waiting' ? 'Join' : 'Join / Watch'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
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
            <button className="btn ghost" onClick={() => setBuilder({})}>📜 Script builder</button></div>
          <hr />
          <h2>New to the game?</h2>
          <p className="muted">Play a short guided practice game with six computer players. The Guide explains each step.</p>
          <button className="btn" onClick={() => setPractice(true)}>🎓 Learn to play</button>
        </section>
      </div>
      {creating && <CreateDialog onClose={() => setCreating(false)} />}
      {practice && <PracticeDialog onClose={() => setPractice(false)} />}
      {builder && <ScriptBuilder initial={builder} onClose={() => setBuilder(null)} />}
      <footer className="legal">Blood on the Clocktower is © The Pandemonium Institute. This is a non-commercial fan project for private play.</footer>
    </div>
    </div>
  );
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
  const create = async () => {
    const custom = mine.find(x => `my:${x.id}` === edition);
    const r = await rpc('game:create', { name, visibility, stName, stAvatar: avatar, edition: custom ? 'custom' : edition });
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
        <AvatarCreator value={avatar} onChange={setAvatar} />
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!name.trim() || !stName.trim()} onClick={create}>Create</button></div>
      </div>
    </div>
  );
}
