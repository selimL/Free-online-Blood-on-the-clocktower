// /admin: running games (close abandoned or misused ones) and accounts (reset passwords).
import { useEffect, useState } from 'react';
import { useAccount } from '../account';

type Game = { id: string; code: string; name: string; visibility: string; phase: string; day: number; players: number; bots: number; online: number; storyteller: string; storytellerOnline: boolean; spectators: number; createdAt: number; lastActivity: number; scheduledFor: number | null; practice: boolean; paused: boolean };
type Acct = { id: string; username: string | null; email: string | null; google: boolean; displayName: string; createdAt: number; games: number; isAdmin: boolean };

export function AdminPage() {
  const acct = useAccount();
  // the owner signs in with the admin password; an account made an admin just uses its own sign-in
  const [ownerToken, setToken] = useState<string | null>(() => sessionStorage.getItem('botc:admin'));
  const token = ownerToken ?? (acct.account?.isAdmin ? acct.token : null);
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => { if (token) void call('/api/admin/me').then(r => setMeId(r.ok ? r.id : null)); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [accts, setAccts] = useState<Acct[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [chat, setChat] = useState<{ id: string; name: string; text: string; ts: number }[]>([]);
  const [reports, setReports] = useState<{ id: string; ts: number; kind: string; where: string; author: string; text: string; reason: string; reporter: string; verified: boolean }[]>([]);
  const [gallery, setGallery] = useState<{ id: string; name: string; author: string; owner: string; votes: number; count: number; createdAt: number }[]>([]);
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({ ok: false, error: 'Server error' }));
    if (r.status === 401 && ownerToken) { sessionStorage.removeItem('botc:admin'); setToken(null); }
    return j;
  };
  const load = async () => {
    const g = await call('/api/admin/games'); if (g.ok) setGames(g.games);
    const a = await call('/api/admin/accounts'); if (a.ok) setAccts(a.accounts);
    const c = await call('/api/admin/lobby-chat'); if (c.ok) setChat(c.chat);
    const gl = await call('/api/admin/gallery'); if (gl.ok) setGallery(gl.scripts);
    const rp = await call('/api/admin/reports'); if (rp.ok) setReports(rp.reports);
  };
  useEffect(() => { void fetch('/api/admin/enabled').then(r => r.json()).then(j => setEnabled(j.enabled)); }, []);
  useEffect(() => { if (!token) return; void load(); const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

  if (enabled === false && !token) return <div className="center-card parchment"><h2>Admin page is off</h2><p>Set <code>ADMIN_PASSWORD</code> in the server's environment (Render → Environment) to turn it on.</p><a className="btn" href="/">Back</a></div>;
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
      <div className="row"><h2>🛠 Admin</h2><a className="btn small ghost" href="/">Back to the lobby</a>{ownerToken ? <button className="btn small ghost" onClick={() => { sessionStorage.removeItem('botc:admin'); setToken(null); }}>Sign out</button>
        : <span className="muted small">Signed in as admin account {acct.account?.displayName}</span>}</div>
      <h3>👑 Admins ({accts.filter(a => a.isAdmin).length})</h3>
      <p className="muted small">{ownerToken ? 'Accounts that can open this page from the lobby. Make someone an admin from the Accounts table below.' : 'Only the site owner (admin password) can remove other admins. You can step down yourself.'}</p>
      <ul className="small admin-chat">{accts.filter(a => a.isAdmin).map(a => <li key={a.id}>👑 <b>{a.displayName}</b> <span className="muted">{a.username ? `(${a.username})` : a.email ? `(${a.email})` : a.google ? '(Google)' : ''}</span>
        {(ownerToken || a.id === meId) && <> <button className="btn small danger" onClick={async () => {
          const self = a.id === meId;
          if (!confirm(self ? 'Step down as admin? You will no longer be able to open this page.' : `Un-admin ${a.displayName}? They will no longer be able to open this page.`)) return;
          const r = await call(`/api/admin/accounts/${a.id}/admin`, 'POST', { admin: false });
          if (!r.ok) return alert(r.error);
          if (self) { location.href = '/'; return; }
          void load();
        }}>{a.id === meId ? 'Step down' : 'Un-admin'}</button></>}
      </li>)}{accts.every(a => !a.isAdmin) && <li className="muted">No admin accounts. Only the admin password opens this page.</li>}</ul>
      <h3>⚑ Reports ({reports.length})</h3>
      <ul className="small admin-chat">{reports.map(r => <li key={r.id}>
        <span className="muted">{new Date(r.ts).toLocaleString()} · {r.where}</span> — <b>{r.author}</b>: “{r.text}” <span className="muted">(reported by {r.reporter}{r.reason ? `: ${r.reason}` : ''}{r.verified ? '' : ' · room chat is not stored, so this is the reporter\'s copy'})</span>
        {' '}<button className="btn small ghost" onClick={async () => { await call(`/api/admin/reports/${r.id}/dismiss`, 'POST', {}); void load(); }}>Dismiss</button>
      </li>)}{reports.length === 0 && <li className="muted">No reports.</li>}</ul>
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
      <h3>Script gallery ({gallery.length})</h3>
      <ul className="small admin-chat">{gallery.map(s => <li key={s.id}><b>{s.name}</b> by {s.author} <span className="muted">(account: {s.owner} · {s.count} characters · ▲ {s.votes} · {new Date(s.createdAt).toLocaleDateString()})</span> <button className="btn small ghost" onClick={async () => { if (confirm(`Remove “${s.name}” from the gallery?`)) { await call(`/api/admin/gallery/${s.id}`, 'DELETE'); void load(); } }}>Remove</button></li>)}
        {gallery.length === 0 && <li className="muted">No published scripts.</li>}</ul>
      <h3>Accounts ({accts.length})</h3>
      <table className="games admin-table"><thead><tr><th>Name</th><th>Sign-in</th><th>Created</th><th>Games</th><th /></tr></thead><tbody>
        {accts.map(a => (
          <tr key={a.id}>
            <td>{a.displayName}{a.isAdmin && <span className="admin-badge" title="Can open the admin page"> 👑 admin</span>}</td>
            <td className="small">{a.username ? `name: ${a.username}` : ''}{a.google ? ' Google' : ''}{a.email ? ` ${a.email}` : ''}</td>
            <td className="small">{new Date(a.createdAt).toLocaleDateString()}</td>
            <td>{a.games}</td>
            <td className="row">
              {a.id !== meId && !(a.isAdmin && !ownerToken) && <button className="btn small ghost" onClick={async () => {
                if (!confirm(a.isAdmin ? `Remove admin rights from ${a.displayName}?` : `Make ${a.displayName} an admin? They can then open this page from the lobby: close games, moderate the lobby chat, and manage accounts (but not other admins).`)) return;
                const r = await call(`/api/admin/accounts/${a.id}/admin`, 'POST', { admin: !a.isAdmin }); if (!r.ok) alert(r.error); void load();
              }}>{a.isAdmin ? 'Remove admin' : '👑 Make admin'}</button>}
              {a.username && <button className="btn small" onClick={async () => { const p = prompt(`New password for ${a.username} (at least 8 characters):`); if (p) { const r = await call(`/api/admin/accounts/${a.id}/password`, 'POST', { password: p }); alert(r.ok ? 'Password changed. Tell them the new one privately.' : r.error); } }}>Reset password</button>}
              <button className="btn small danger ghost" onClick={async () => { if (confirm(`Delete the account of ${a.displayName}? Their saved games and scripts on the server are removed.`)) { const r = await call(`/api/admin/accounts/${a.id}`, 'DELETE'); if (!r.ok) alert(r.error); void load(); } }}>Delete</button>
            </td>
          </tr>
        ))}
        {accts.length === 0 && <tr><td colSpan={5} className="muted">No accounts yet.</td></tr>}
      </tbody></table>
    </div>
  );
}
