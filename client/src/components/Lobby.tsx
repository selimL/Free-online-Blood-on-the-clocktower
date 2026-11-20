import { useEffect, useState } from 'react';
import { rpc, saveSession, set, pushAlert } from '../net';
import type { LobbyEntry, Avatar } from '../../../shared/types';
import { defaultAvatar } from '../../../shared/types';
import { AvatarCreator } from './Avatar';

export function Lobby() {
  const [games, setGames] = useState<LobbyEntry[]>([]);
  const [creating, setCreating] = useState(false);
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
                  <td><button className="btn small" onClick={() => go(g.code)}>{g.status === 'waiting' ? 'Join' : 'Join as Traveller'}</button></td>
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
          <button className="btn primary" onClick={() => setCreating(true)}>Create game</button>
        </section>
      </div>
      {creating && <CreateDialog onClose={() => setCreating(false)} />}
      <footer className="legal">Blood on the Clocktower is © The Pandemonium Institute. This is a non-commercial fan project for private play.</footer>
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
  const create = async () => {
    const r = await rpc('game:create', { name, visibility, stName, stAvatar: avatar, edition });
    if (!r.ok) return pushAlert(r.error ?? 'Failed', 'error');
    const s = { gameId: r.gameId, code: r.code, token: r.token, id: 'st' };
    saveSession(s);
    set({ session: s });
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
            </select>
          </label>
        </div>
        <AvatarCreator value={avatar} onChange={setAvatar} />
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!name.trim() || !stName.trim()} onClick={create}>Create</button></div>
      </div>
    </div>
  );
}
