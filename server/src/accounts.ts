// Optional player accounts: name + password, Google sign-in, or an emailed login link.
// An account keeps a player's name, figure, finished-game history and saved scripts so they follow
// them to any device. Playing never requires an account.
//
// Settings (environment variables):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  → "Sign in with Google"
//   RESEND_API_KEY, MAIL_FROM               → "Email me a login link" (via resend.com)
//   PUBLIC_URL (optional)                   → the site's address, e.g. https://clocktower-nights.onrender.com
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Express, Request, Response } from 'express';
import type { KV } from './persist';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const token = (n = 24) => randomBytes(n).toString('base64url');
const SESSION_DAYS = 90;

export interface Account {
  id: string;
  username: string | null;       // name + password login
  passwordHash: string | null;   // scrypt$salt$hash
  googleSub: string | null;
  email: string | null;
  displayName: string;
  avatar: unknown;
  history: unknown[];
  scripts: unknown[];
  createdAt: number;
  /** Leave me off other people's friends' leaderboards. */
  hideFromFriends?: boolean;
}

export class Accounts {
  constructor(private kv: KV, private env: NodeJS.ProcessEnv = process.env) {}

  /**
   * The friends' leaderboard: me plus every account that finished at least one of the same games
   * (matched by game id, which only people in that game know). Stats come from each account's history.
   */
  async leaderboard(me: Account) {
    const mine = new Set(gameIds(me));
    const rows = [];
    for (const a of await this.list()) {
      const together = a.id === me.id ? mine.size : gameIds(a).filter(id => mine.has(id)).length;
      if (!together || (a.id !== me.id && a.hideFromFriends)) continue;
      const played = (a.history as { role?: string; won?: boolean | null; mvpMe?: boolean; alignment?: string }[]).filter(h => h && h.role === 'player');
      rows.push({
        id: a.id, name: a.displayName, you: a.id === me.id, together,
        games: played.length, wins: played.filter(h => h.won === true).length,
        evilWins: played.filter(h => h.won === true && h.alignment === 'evil').length,
        mvps: played.filter(h => h.mvpMe).length,
        storytold: (a.history as { role?: string }[]).filter(h => h && h.role === 'storyteller').length,
      });
    }
    return rows.sort((x, y) => y.wins - x.wins || y.games - x.games).slice(0, 50);
  }

  // ---------------------------------------------------------------- storage
  async get(id: string): Promise<Account | null> {
    const v = await this.kv.get(`acct:${id}`);
    return v ? JSON.parse(v) as Account : null;
  }
  async save(a: Account) { await this.kv.set(`acct:${a.id}`, JSON.stringify(a)); }
  private async index(): Promise<string[]> { return JSON.parse((await this.kv.get('acct:index')) ?? '[]'); }
  private async addToIndex(id: string) { const ids = await this.index(); if (!ids.includes(id)) { ids.push(id); await this.kv.set('acct:index', JSON.stringify(ids)); } }
  async list(): Promise<Account[]> { return (await Promise.all((await this.index()).map(id => this.get(id)))).filter((a): a is Account => !!a); }
  async remove(id: string) {
    const a = await this.get(id);
    if (!a) return;
    if (a.username) await this.kv.del(`user:${a.username}`);
    if (a.googleSub) await this.kv.del(`google:${a.googleSub}`);
    if (a.email) await this.kv.del(`email:${a.email}`);
    await this.kv.del(`acct:${id}`);
    await this.kv.set('acct:index', JSON.stringify((await this.index()).filter(x => x !== id)));
  }
  private async create(p: Partial<Account>): Promise<Account> {
    const a: Account = { id: token(9), username: null, passwordHash: null, googleSub: null, email: null, displayName: 'Player', avatar: null, history: [], scripts: [], createdAt: Date.now(), ...p };
    await this.save(a);
    await this.addToIndex(a.id);
    return a;
  }
  async newSession(accountId: string) {
    const t = token(32);
    await this.kv.set(`sess:${t}`, accountId, SESSION_DAYS * 86400);
    return t;
  }
  async fromRequest(req: Request): Promise<Account | null> {
    const h = req.get('authorization') ?? '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!/^[\w-]{20,80}$/.test(t)) return null;
    const id = await this.kv.get(`sess:${t}`);
    return id ? this.get(id) : null;
  }

  // ---------------------------------------------------------------- passwords
  static async hash(pw: string) { const salt = randomBytes(16); return `scrypt$${salt.toString('base64url')}$${(await scrypt(pw, salt, 32)).toString('base64url')}`; }
  static async verify(pw: string, stored: string | null) {
    if (!stored) return false;
    const [, salt, hash] = stored.split('$');
    const got = await scrypt(pw, Buffer.from(salt, 'base64url'), 32);
    const want = Buffer.from(hash, 'base64url');
    return got.length === want.length && timingSafeEqual(got, want);
  }
  async setPassword(id: string, pw: string) {
    const a = await this.get(id);
    if (!a) throw new Error('No such account.');
    a.passwordHash = await Accounts.hash(pw);
    await this.save(a);
  }

  // ---------------------------------------------------------------- the API
  config() { return { google: !!(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET), email: !!(this.env.RESEND_API_KEY && this.env.MAIL_FROM) }; }

  routes(app: Express) {
    const tries = new Map<string, { n: number; at: number }>();
    const limited = (key: string, max = 8) => {
      const now = Date.now(), t = tries.get(key);
      if (!t || now - t.at > 15 * 60_000) { tries.set(key, { n: 1, at: now }); return false; }
      t.n++;
      return t.n > max;
    };
    const bad = (res: Response, status: number, error: string) => res.status(status).json({ ok: false, error });
    const publicUrl = (req: Request) => (this.env.PUBLIC_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`);
    const me = (a: Account) => ({ id: a.id, username: a.username, email: a.email, google: !!a.googleSub, displayName: a.displayName, avatar: a.avatar, history: a.history, scripts: a.scripts, hideFromFriends: !!a.hideFromFriends });

    app.get('/api/auth/config', (_req, res) => res.json(this.config()));

    app.post('/api/auth/register', async (req, res) => {
      const username = String(req.body?.username ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      if (!/^[a-z0-9_]{3,20}$/.test(username)) return bad(res, 400, 'Names are 3–20 letters, numbers or _.');
      if (password.length < 8) return bad(res, 400, 'Use a password of at least 8 characters.');
      if (limited(`reg:${req.ip}`, 5)) return bad(res, 429, 'Too many tries. Wait a few minutes.');
      if (await this.kv.get(`user:${username}`)) return bad(res, 409, 'That name is taken.');
      const a = await this.create({ username, passwordHash: await Accounts.hash(password), displayName: String(req.body?.displayName ?? username).slice(0, 24) || username });
      await this.kv.set(`user:${username}`, a.id);
      res.json({ ok: true, token: await this.newSession(a.id), account: me(a) });
    });

    app.post('/api/auth/login', async (req, res) => {
      const username = String(req.body?.username ?? '').trim().toLowerCase();
      if (limited(`login:${req.ip}`) || limited(`login:${username}`)) return bad(res, 429, 'Too many tries. Wait a few minutes.');
      const id = await this.kv.get(`user:${username}`);
      const a = id ? await this.get(id) : null;
      if (!a || !(await Accounts.verify(String(req.body?.password ?? ''), a.passwordHash))) return bad(res, 401, 'Wrong name or password.');
      res.json({ ok: true, token: await this.newSession(a.id), account: me(a) });
    });

    app.post('/api/auth/logout', async (req, res) => {
      const h = req.get('authorization') ?? '';
      if (h.startsWith('Bearer ')) await this.kv.del(`sess:${h.slice(7)}`);
      res.json({ ok: true });
    });

    app.get('/api/leaderboard', async (req, res) => {
      const a = await this.fromRequest(req);
      if (!a) return bad(res, 401, 'Sign in to see your friends\' leaderboard.');
      res.json({ ok: true, rows: await this.leaderboard(a) });
    });

    app.get('/api/account', async (req, res) => {
      const a = await this.fromRequest(req);
      if (!a) return bad(res, 401, 'Not signed in.');
      res.json({ ok: true, account: me(a) });
    });

    /** Save the player's name, figure, history and scripts (the client merges before sending). */
    app.put('/api/account', async (req, res) => {
      const a = await this.fromRequest(req);
      if (!a) return bad(res, 401, 'Not signed in.');
      const b = req.body ?? {};
      if (typeof b.displayName === 'string') a.displayName = b.displayName.slice(0, 24) || a.displayName;
      if (b.avatar && typeof b.avatar === 'object') a.avatar = b.avatar;
      if (Array.isArray(b.history)) a.history = b.history.slice(0, 200);
      if (Array.isArray(b.scripts)) a.scripts = b.scripts.slice(0, 50);
      if (typeof b.hideFromFriends === 'boolean') a.hideFromFriends = b.hideFromFriends;
      await this.save(a);
      res.json({ ok: true, account: me(a) });
    });

    // ---- Google (OpenID Connect, server-side code flow)
    const states = new Map<string, number>();
    app.get('/api/auth/google', (req, res) => {
      if (!this.config().google) return bad(res, 404, 'Google sign-in is not set up on this server.');
      const state = token(16);
      states.set(state, Date.now());
      for (const [k, t] of states) if (Date.now() - t > 10 * 60_000) states.delete(k);
      const q = new URLSearchParams({
        client_id: this.env.GOOGLE_CLIENT_ID!, redirect_uri: `${publicUrl(req)}/api/auth/google/callback`,
        response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account',
      });
      res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
    });
    app.get('/api/auth/google/callback', async (req, res) => {
      try {
        const state = String(req.query.state ?? '');
        if (!states.has(state)) return res.redirect('/?login_error=expired');
        states.delete(state);
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: String(req.query.code ?? ''), client_id: this.env.GOOGLE_CLIENT_ID!, client_secret: this.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri: `${publicUrl(req)}/api/auth/google/callback`, grant_type: 'authorization_code',
          }),
        });
        if (!r.ok) return res.redirect('/?login_error=google');
        // the ID token comes straight from Google over HTTPS (server-to-server), so its claims can be read directly
        const { id_token } = await r.json() as { id_token: string };
        const claims = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64url').toString()) as { sub: string; email?: string; name?: string; aud: string };
        if (claims.aud !== this.env.GOOGLE_CLIENT_ID) return res.redirect('/?login_error=google');
        let id = await this.kv.get(`google:${claims.sub}`);
        if (!id) {
          const a = await this.create({ googleSub: claims.sub, displayName: (claims.name ?? 'Player').slice(0, 24) });
          await this.kv.set(`google:${claims.sub}`, a.id);
          id = a.id;
        }
        res.redirect(`/?login=${await this.newSession(id)}`);
      } catch (e) {
        console.warn('[accounts] Google sign-in failed:', (e as Error).message);
        res.redirect('/?login_error=google');
      }
    });

    // ---- emailed login link (via resend.com)
    app.post('/api/auth/email', async (req, res) => {
      if (!this.config().email) return bad(res, 404, 'Email login is not set up on this server.');
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      if (!/^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,}$/.test(email)) return bad(res, 400, 'That does not look like an email address.');
      if (limited(`mail:${req.ip}`, 5) || limited(`mail:${email}`, 3)) return bad(res, 429, 'Too many emails. Wait a few minutes.');
      const t = token(32);
      await this.kv.set(`mail:${t}`, email, 15 * 60);
      const link = `${publicUrl(req)}/api/auth/email/verify?t=${t}`;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${this.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: this.env.MAIL_FROM, to: email, subject: 'Your Clocktower Nights login link',
          html: `<p>Click to sign in to Clocktower Nights (the link works once, for 15 minutes):</p><p><a href="${link}">Sign in</a></p><p>If you did not ask for this, ignore this email.</p>`,
        }),
      });
      if (!r.ok) { console.warn('[accounts] email failed:', r.status, await r.text()); return bad(res, 502, 'The email could not be sent.'); }
      res.json({ ok: true });
    });
    app.get('/api/auth/email/verify', async (req, res) => {
      const t = String(req.query.t ?? '');
      const email = /^[\w-]{20,80}$/.test(t) ? await this.kv.get(`mail:${t}`) : null;
      if (!email) return res.redirect('/?login_error=link');
      await this.kv.del(`mail:${t}`);
      let id = await this.kv.get(`email:${email}`);
      if (!id) {
        const a = await this.create({ email, displayName: email.split('@')[0].slice(0, 24) });
        await this.kv.set(`email:${email}`, a.id);
        id = a.id;
      }
      res.redirect(`/?login=${await this.newSession(id)}`);
    });
  }
}

function gameIds(a: Account): string[] {
  return (a.history as { gameId?: unknown }[]).map(h => (h && typeof h.gameId === 'string' ? h.gameId : '')).filter(Boolean);
}
