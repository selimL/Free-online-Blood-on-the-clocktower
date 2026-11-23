// /admin: running games (close abandoned or misused ones) and accounts (reset passwords).
import { useEffect, useState } from 'react';

type Game = { id: string; code: string; name: string; visibility: string; phase: string; day: number; players: number; bots: number; online: number; storyteller: string; storytellerOnline: boolean; spectators: number; createdAt: number; lastActivity: number; scheduledFor: number | null; practice: boolean; paused: boolean };
type Acct = { id: string; username: string | null; email: string | null; google: boolean; displayName: string; createdAt: number; games: number };

export function AdminPage() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('botc:admin'));
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [accts, setAccts] = useState<Acct[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [chat, setChat] = useState<{ id: string; name: string; text: string; ts: number }[]>([]);
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({ ok: false, error: 'Server error' }));
    if (r.status === 401) { sessionStorage.removeItem('botc:admin'); setToken(null); }
    return j;
  };
  const load = async () => {
    const g = await call('/api/admin/games'); if (g.ok) setGames(g.games);
    const a = await call('/api/admin/accounts'); if (a.ok) setAccts(a.accounts);
    const c = await call('/api/admin/lobby-chat'); if (c.ok) setChat(c.chat);
  };
  useEffect(() => { void fetch('/api/admin/enabled').then(r => r.json()).then(j => setEnabled(j.enabled)); }, []);
  useEffect(() => { if (!token) return; void load(); const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

  if (enabled === false) return <div className="center-card parchment"><h2>Admin page is off</h2><p>Set <code>ADMIN_PASSWORD</code> in the server's environment (Render → Environment) to turn it on.</p><a className="btn" href="/">Back</a></div>;
  if (!token) return (
    <div className="center-card parchment">
      <h2>🛠 Admin</h2>
      <form onSubmit={async e => { e.preventDefault(); const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) }).then(x => x.json()); if (r.ok) { sessionStorage.setItem('botc:admin', r.token); setToken(r.token); } else setErr(r.error); }}>
        <label className="field">Admin password<input type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus /></label>
        <button className="btn primary">Sign in</button>
      </form>
      {err && <p className="warn small">{err}</p>}
    </div>
  );
  return (
    <div className="admin parchment">
      <div className="row"><h2>🛠 Admin</h2><a className="btn small ghost" href="/">Back to the lobby</a><button className="btn small ghost" onClick={() => { sessionStorage.removeItem('botc:admin'); setToken(null); }}>Sign out</button></div>
      <h3>Games ({games.length})</h3>
      <table className="games admin-table"><thead><tr><th>Game</th><th>Status</th><th>People</th><th>Storyteller</th><th>Activity</th><th /></tr></thead><tbody>
        {games.sort((a, b) => b.lastActivity - a.lastActivity).map(g => (
          <tr key={g.id}>
            <td><b>{g.name}</b> <span className="muted small">{g.code} · {g.visibility}{g.practice ? ' · practice' : ''}</span></td>
            <td>{g.phase}{g.phase === 'day' || g.phase === 'night' ? ` ${g.day}` : ''}{g.paused ? ' ⏸' : ''}{g.scheduledFor ? ` · 🕰 ${new Date(g.scheduledFor).toLocaleString()}` : ''}</td>
            <td>{g.players} seats{g.bots ? ` (${g.bots} bots)` : ''} · {g.online} online{g.spectators ? ` · ${g.spectators} watching` : ''}</td>
            <td>{g.storyteller} {g.storytellerOnline ? '🟢' : '⚪'}</td>
            <td className="small">{ago(g.lastActivity)}</td>
            <td><button className="btn small danger" onClick={async () => { const reason = prompt(`Close “${g.name}”? Everyone in it is sent back to the lobby. Reason shown to them:`, 'This game was closed by the site admin.'); if (reason !== null) { await call(`/api/admin/games/${g.id}/close`, 'POST', { reason }); void load(); } }}>Close</button></td>
          </tr>
        ))}
        {games.length === 0 && <tr><td colSpan={6} className="muted">No games running.</td></tr>}
      </tbody></table>
      <h3>Lobby chat ({chat.length}) {chat.length > 0 && <button className="btn small danger ghost" onClick={async () => { if (confirm('Clear the whole lobby chat?')) { await call('/api/admin/lobby-chat/clear', 'POST', {}); void load(); } }}>Clear all</button>}</h3>
      <ul className="small admin-chat">{chat.map(m => <li key={m.id}><span className="muted">{new Date(m.ts).toLocaleTimeString()}</span> <b>{m.name}</b>: {m.text} <button className="btn small ghost" onClick={async () => { await call('/api/admin/lobby-chat/clear', 'POST', { id: m.id }); void load(); }}>Remove</button></li>)}
        {chat.length === 0 && <li className="muted">No messages.</li>}</ul>
      <h3>Accounts ({accts.length})</h3>
      <table className="games admin-table"><thead><tr><th>Name</th><th>Sign-in</th><th>Created</th><th>Games</th><th /></tr></thead><tbody>
        {accts.map(a => (
          <tr key={a.id}>
            <td>{a.displayName}</td>
            <td className="small">{a.username ? `name: ${a.username}` : ''}{a.google ? ' Google' : ''}{a.email ? ` ${a.email}` : ''}</td>
            <td className="small">{new Date(a.createdAt).toLocaleDateString()}</td>
            <td>{a.games}</td>
            <td className="row">
              {a.username && <button className="btn small" onClick={async () => { const p = prompt(`New password for ${a.username} (at least 8 characters):`); if (p) { const r = await call(`/api/admin/accounts/${a.id}/password`, 'POST', { password: p }); alert(r.ok ? 'Password changed. Tell them the new one privately.' : r.error); } }}>Reset password</button>}
              <button className="btn small danger ghost" onClick={async () => { if (confirm(`Delete the account of ${a.displayName}? Their saved games and scripts on the server are removed.`)) { await call(`/api/admin/accounts/${a.id}`, 'DELETE'); void load(); } }}>Delete</button>
            </td>
          </tr>
        ))}
        {accts.length === 0 && <tr><td colSpan={5} className="muted">No accounts yet.</td></tr>}
      </tbody></table>
    </div>
  );
}
