// Sign in (optional): name + password, Google, or an emailed login link.
import { useState } from 'react';
import { useAccount, login, register, emailLink, googleLogin, signOut, syncNow } from '../account';

export function AccountButton() {
  const { account, token } = useAccount();
  const [open, setOpen] = useState(false);
  return <>
    <button className="btn small ghost account-btn" onClick={() => setOpen(true)}>{token ? `👤 ${account?.displayName ?? '…'}` : '👤 Sign in'}</button>
    {open && <AccountDialog onClose={() => setOpen(false)} />}
  </>;
}

function AccountDialog({ onClose }: { onClose: () => void }) {
  const { account, token, config } = useAccount();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [display, setDisplay] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    setMsg(r.ok ? okMsg ?? null : r.error ?? 'Something went wrong.');
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal parchment" role="dialog" aria-label="Account" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h2>👤 Account</h2><button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button></div>
        {token ? <>
          <p>Signed in as <b>{account?.displayName ?? '…'}</b>{account?.username ? ` (${account.username})` : account?.email ? ` (${account.email})` : account?.google ? ' (Google)' : ''}.</p>
          <p className="muted small">Your name, figure, finished games and saved scripts are kept with your account, so they follow you to any device. {account ? `${account.history.length} games, ${account.scripts.length} scripts saved.` : ''}</p>
          <div className="row end"><button className="btn ghost" onClick={() => void syncNow()}>Sync now</button><button className="btn" onClick={() => { void signOut(); onClose(); }}>Sign out</button></div>
        </> : <>
          <p className="muted small">Optional: you can always play without an account. Signing in keeps your games, scripts and figure on every device.</p>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button>
            <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>New account</button>
          </div>
          <form onSubmit={e => { e.preventDefault(); void run(() => (mode === 'login' ? login(username, password) : register(username, password, display || username))); }}>
            <label className="field">Account name<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="letters, numbers, _" maxLength={20} /></label>
            {mode === 'register' && <label className="field">Name shown in games<input value={display} onChange={e => setDisplay(e.target.value)} maxLength={24} placeholder="e.g. Mortimer" /></label>}
            <label className="field">Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'register' ? 'at least 8 characters' : ''} /></label>
            <button className="btn primary" disabled={busy || !username || !password}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
          {(config.google || config.email) && <hr />}
          {config.google && <button className="btn" onClick={googleLogin}>Sign in with Google</button>}
          {config.email && <form className="row" onSubmit={e => { e.preventDefault(); void run(() => emailLink(email), 'Check your email for a login link (it works for 15 minutes).'); }}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" aria-label="Email" />
            <button className="btn" disabled={busy || !email}>Email me a login link</button>
          </form>}
          {mode === 'login' && <p className="muted small">Forgot your password? Ask whoever runs this site: they can reset it on the admin page.</p>}
        </>}
        {msg && <p className={`small ${/Check/.test(msg) ? '' : 'warn'}`}>{msg}</p>}
        <p className="small muted legal-note">By signing in you agree to the <a href="/terms">Terms</a>. See what is stored in the <a href="/privacy">Privacy Policy</a>.</p>
      </div>
    </div>
  );
}
