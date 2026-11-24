// /status: is the site up? Only aggregate numbers (no game names or codes).
import { useEffect, useState } from 'react';

type Status = { ok: boolean; uptimeMinutes: number; gamesRunning: number; gamesInProgress: number; peopleInGames: number; storage: string; voice: boolean; accountStorage: string; version: string | null; time: number };

export function StatusPage() {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState(false);
  const [checked, setChecked] = useState(0);
  useEffect(() => {
    const load = () => fetch('/api/status', { cache: 'no-store' }).then(r => r.json()).then(j => { setS(j); setErr(false); }).catch(() => setErr(true)).finally(() => setChecked(Date.now()));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  const up = (m: number) => (m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`);
  const row = (label: string, value: React.ReactNode, good = true) => <tr><td>{label}</td><td className={good ? 'ok' : 'bad'}>{value}</td></tr>;
  return (
    <div className="legal-page">
      <article className="legal-card parchment status-card">
        <a className="btn small ghost legal-back" href="/">← Back to the lobby</a>
        <h1>Status</h1>
        {err ? <p className="status-big bad">🔴 The game server is not answering right now.</p>
          : !s ? <p className="muted">Checking…</p>
            : <>
              <p className="status-big ok">🟢 Everything is running.</p>
              <table className="status-table"><tbody>
                {row('Game server', `up for ${up(s.uptimeMinutes)}`)}
                {row('Games open', `${s.gamesRunning} (${s.gamesInProgress} in progress)`)}
                {row('People in games right now', String(s.peopleInGames))}
                {row('Voice chat', s.voice ? 'available' : 'off (text chat only)', s.voice)}
                {row('Saved games', s.storage === 'Upstash Redis' ? 'saved, they survive restarts' : `stored in ${s.storage}`, s.storage === 'Upstash Redis')}
                {row('Accounts', s.accountStorage === 'Upstash Redis' ? 'saved' : `stored in ${s.accountStorage}`, s.accountStorage === 'Upstash Redis')}
                {s.version && row('Version', s.version)}
              </tbody></table>
              <p className="muted small">On the free hosting plan the server sleeps after a while with nobody on it; the first visit then takes up to a minute to wake it.</p>
            </>}
        {checked > 0 && <p className="muted small">Last checked {new Date(checked).toLocaleTimeString()} · refreshes every 15 seconds.</p>}
      </article>
    </div>
  );
}
