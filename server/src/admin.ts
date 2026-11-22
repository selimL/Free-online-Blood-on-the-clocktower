// The admin page's API: see running games, close abandoned or misused ones, manage accounts.
// Turned on by setting ADMIN_PASSWORD (in Render: Environment). Without it, the admin page is off.
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { Lobby } from './lobby';
import { Accounts } from './accounts';

export function adminRoutes(app: Express, lobby: Lobby, accounts: Accounts, env: NodeJS.ProcessEnv = process.env) {
  const sessions = new Map<string, number>(); // admin token → expiry
  const fails = new Map<string, { n: number; at: number }>();
  const same = (a: string, b: string) => { const x = createHash('sha256').update(a).digest(), y = createHash('sha256').update(b).digest(); return timingSafeEqual(x, y); };
  const authed = (req: Request) => {
    const t = (req.get('authorization') ?? '').replace(/^Bearer /, '');
    const exp = sessions.get(t);
    return !!exp && exp > Date.now();
  };
  const guard = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
    if (!env.ADMIN_PASSWORD) return res.status(404).json({ ok: false, error: 'The admin page is off. Set ADMIN_PASSWORD to turn it on.' });
    if (!authed(req)) return res.status(401).json({ ok: false, error: 'Please sign in again.' });
    try { await fn(req, res); } catch (e) { res.status(400).json({ ok: false, error: (e as Error).message }); }
  };

  app.get('/api/admin/enabled', (_req, res) => res.json({ enabled: !!env.ADMIN_PASSWORD }));
  app.post('/api/admin/login', (req, res) => {
    if (!env.ADMIN_PASSWORD) return res.status(404).json({ ok: false, error: 'The admin page is off. Set ADMIN_PASSWORD to turn it on.' });
    const f = fails.get(req.ip ?? '') ?? { n: 0, at: Date.now() };
    if (f.n >= 5 && Date.now() - f.at < 15 * 60_000) return res.status(429).json({ ok: false, error: 'Too many tries. Wait 15 minutes.' });
    if (!same(String(req.body?.password ?? ''), env.ADMIN_PASSWORD)) {
      fails.set(req.ip ?? '', { n: f.n + 1, at: Date.now() });
      return res.status(401).json({ ok: false, error: 'Wrong password.' });
    }
    fails.delete(req.ip ?? '');
    const t = randomBytes(24).toString('base64url');
    sessions.set(t, Date.now() + 8 * 3600_000);
    res.json({ ok: true, token: t });
  });

  app.get('/api/admin/games', guard((_req, res) => {
    res.json({ ok: true, games: [...lobby.games.values()].map(g => ({
      id: g.id, code: g.code, name: g.name, visibility: g.visibility, phase: g.phase, day: g.day,
      players: g.players.length, bots: g.players.filter(p => p.bot).length, online: lobby.onlineCount(g.id),
      storyteller: g.storyteller.name, storytellerOnline: g.storyteller.connected, spectators: g.spectators.length,
      createdAt: g.createdAt, lastActivity: g.lastActivity, scheduledFor: g.scheduledFor, practice: !!g.tutorial, paused: g.paused,
    })) });
  }));
  app.post('/api/admin/games/:id/close', guard((req, res) => {
    const ok = lobby.closeGame(String(req.params.id), String(req.body?.reason ?? '') || 'This game was closed by the site admin.');
    res.json({ ok });
  }));
  app.get('/api/admin/accounts', guard(async (_req, res) => {
    res.json({ ok: true, accounts: (await accounts.list()).map(a => ({
      id: a.id, username: a.username, email: a.email, google: !!a.googleSub, displayName: a.displayName,
      createdAt: a.createdAt, games: a.history.length,
    })) });
  }));
  app.post('/api/admin/accounts/:id/password', guard(async (req, res) => {
    const pw = String(req.body?.password ?? '');
    if (pw.length < 8) throw new Error('Use at least 8 characters.');
    await accounts.setPassword(String(req.params.id), pw);
    res.json({ ok: true });
  }));
  app.delete('/api/admin/accounts/:id', guard(async (req, res) => { await accounts.remove(String(req.params.id)); res.json({ ok: true }); }));
}
