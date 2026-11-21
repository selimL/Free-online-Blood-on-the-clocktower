import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore, rpc, rejoin, saveSession, sessionForCode, set, pushAlert } from './net';
import { Lobby } from './components/Lobby';
import { GameScreen } from './components/GameScreen';
import { AvatarCreator } from './components/Avatar';
import { defaultAvatar, type Avatar } from '../../shared/types';
import { Alerts } from './components/Overlays';
import { RoomPreview } from './components/RoomPreview';
import { Countdown, downloadIcs } from './components/Schedule';
import './styles.css';

const codeFromPath = () => {
  const m = location.pathname.match(/^\/(?:g|join)\/([A-Za-z0-9]{4,12})/);
  return m ? m[1].toUpperCase() : null;
};

function JoinForm({ code }: { code: string }) {
  const [info, setInfo] = useState<{ name: string; players: number; max: number; edition: string; status: string; scheduledFor: number | null } | null>(null);
  const [traveller, setTraveller] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(() => localStorage.getItem('botc:name') ?? '');
  const [avatar, setAvatar] = useState<Avatar>(() => { try { return JSON.parse(localStorage.getItem('botc:avatar') ?? '') } catch { return defaultAvatar(); } });
  useEffect(() => {
    rpc('game:lookup', { code }).then(r => { if (r.ok) { setInfo(r.game); setTraveller(r.travellersOnly); } else setErr(r.error ?? 'Not found'); });
  }, [code]);
  const join = async (watch = false) => {
    try { localStorage.setItem('botc:name', name); localStorage.setItem('botc:avatar', JSON.stringify(avatar)); } catch { /* ignore */ }
    const r = await rpc(watch ? 'game:spectate' : 'game:join', { code, name, avatar });
    if (!r.ok) return pushAlert(r.error ?? 'Could not join', 'error');
    const s = { gameId: r.gameId, code: r.code, token: r.token, id: r.id };
    saveSession(s);
    set({ session: s });
  };
  if (err) return <div className="center-card parchment"><h2>Game not found</h2><p>{err}</p><a className="btn" href="/">Back to the lobby</a></div>;
  if (!info) return <div className="center-card parchment"><p>Looking for the game…</p></div>;
  return (
    <div className="center-card parchment wide">
      <h2>Join “{info.name}”</h2>
      <p className="muted">{info.edition} · {info.players}/{info.max} players · {info.status}</p>
      {info.scheduledFor && info.status === 'waiting' && <p><Countdown at={info.scheduledFor} /> <button className="btn small ghost" onClick={() => downloadIcs(info.name, info.scheduledFor!, location.href)}>📅 Add to calendar</button></p>}
      {traveller && <p className="warn">This game is already in progress. You will join as a <b>Traveller</b> if the Storyteller allows it.</p>}
      <label className="field">Your name<input value={name} maxLength={24} onChange={e => setName(e.target.value)} placeholder="e.g. Mortimer" autoFocus /></label>
      <AvatarCreator value={avatar} onChange={setAvatar} />
      <div className="row end"><a className="btn ghost" href="/">Cancel</a><button className="btn" disabled={!name.trim()} onClick={() => join(true)} title="Watch without a seat: you see only public information and can listen to the Town Square">👁 Just watch</button><button className="btn primary" disabled={!name.trim()} onClick={() => join()}>Enter the town</button></div>
    </div>
  );
}

function App() {
  const session = useStore(s => s.session);
  const view = useStore(s => s.view);
  const kicked = useStore(s => s.kicked);
  const connected = useStore(s => s.connected);
  const [code, setCode] = useState(codeFromPath);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    const onPop = () => setCode(codeFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (!code || session || !connected) { setTried(true); return; }
    const s = sessionForCode(code);
    if (!s) { setTried(true); return; }
    void rejoin(s).then(() => setTried(true));
  }, [code, connected]);
  useEffect(() => {
    if (session && location.pathname !== `/g/${session.code}`) history.replaceState(null, '', `/g/${session.code}`);
  }, [session]);

  let body;
  const previewRoom = new URLSearchParams(location.search).get('preview-room');
  if (previewRoom) body = <RoomPreview art={previewRoom} />;
  else if (kicked) body = <div className="center-card parchment"><h2>Removed</h2><p>{kicked}</p><a className="btn" href="/">Back to the lobby</a></div>;
  else if (session && view) body = <GameScreen view={view} />;
  else if (session) body = <div className="center-card parchment"><p>Entering the town…</p></div>;
  else if (code && tried) body = <JoinForm code={code} />;
  else if (code) body = <div className="center-card parchment"><p>Reconnecting…</p></div>;
  else body = <Lobby />;

  return (
    <>
      {!connected && <div className="offline-banner" role="status">Connection lost — reconnecting…</div>}
      {body}
      <Alerts />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
