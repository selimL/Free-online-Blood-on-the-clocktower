// The script gallery: scripts that signed-in players publish for everyone to browse, save and
// upvote. Stored in the same key-value store as accounts (Upstash in production).
import type { Express, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import type { KV } from './persist';
import type { Accounts } from './accounts';
import { CHARACTER_BY_ID } from '../../shared/characters';
import { cleanText } from './game';

export interface GalleryScript {
  id: string; name: string; author: string; ids: string[];
  ownerId: string; ownerName: string; createdAt: number; votes: string[]; // account ids that upvoted
}
const MAX_SCRIPTS = 500, MAX_PER_ACCOUNT = 20;

export class Gallery {
  constructor(private kv: KV, private accounts: Accounts) {}

  private async index(): Promise<string[]> { return JSON.parse((await this.kv.get('gallery:index')) ?? '[]'); }
  private async setIndex(ids: string[]) { await this.kv.set('gallery:index', JSON.stringify(ids)); }
  async get(id: string): Promise<GalleryScript | null> {
    if (!/^[\w-]{6,20}$/.test(id)) return null;
    const v = await this.kv.get(`gallery:${id}`);
    return v ? JSON.parse(v) as GalleryScript : null;
  }
  private save(s: GalleryScript) { return this.kv.set(`gallery:${s.id}`, JSON.stringify(s)); }
  async list(): Promise<GalleryScript[]> {
    return (await Promise.all((await this.index()).map(id => this.get(id)))).filter((s): s is GalleryScript => !!s);
  }

  /** Check and publish a script. Only known, non-homebrew characters are kept. */
  async publish(ownerId: string, ownerName: string, body: { name?: unknown; author?: unknown; ids?: unknown }): Promise<GalleryScript> {
    const ids = [...new Set(Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && !!CHARACTER_BY_ID[x] && CHARACTER_BY_ID[x].edition !== 'homebrew') : [])];
    const name = cleanText(body.name, 60);
    if (!name) throw new Error('Give the script a name.');
    if (ids.length < 5 || ids.length > 60) throw new Error('A script needs between 5 and 60 characters.');
    if (!ids.some(id => CHARACTER_BY_ID[id].type === 'demon')) throw new Error('A script needs at least one Demon.');
    const all = await this.list();
    if (all.filter(s => s.ownerId === ownerId).length >= MAX_PER_ACCOUNT) throw new Error(`You can publish at most ${MAX_PER_ACCOUNT} scripts. Remove an old one first.`);
    if (all.some(s => s.ownerId === ownerId && s.name.toLowerCase() === name.toLowerCase())) throw new Error('You already published a script with that name.');
    if (all.length >= MAX_SCRIPTS) throw new Error('The gallery is full right now.');
    const s: GalleryScript = { id: randomBytes(6).toString('base64url'), name, author: cleanText(body.author, 40) || ownerName, ids, ownerId, ownerName, createdAt: Date.now(), votes: [] };
    await this.save(s);
    await this.setIndex([...(await this.index()), s.id]);
    return s;
  }
  async vote(id: string, accountId: string, up: boolean) {
    const s = await this.get(id);
    if (!s) throw new Error('That script is gone.');
    s.votes = s.votes.filter(v => v !== accountId);
    if (up) s.votes.push(accountId);
    await this.save(s);
    return s;
  }
  async remove(id: string) {
    await this.kv.del(`gallery:${id}`);
    await this.setIndex((await this.index()).filter(x => x !== id));
  }

  routes(app: Express) {
    const view = (s: GalleryScript, me: string | null) => ({
      id: s.id, name: s.name, author: s.author, ids: s.ids, createdAt: s.createdAt,
      votes: s.votes.length, voted: !!me && s.votes.includes(me), mine: !!me && s.ownerId === me,
    });
    const bad = (res: Response, status: number, error: string) => res.status(status).json({ ok: false, error });
    const posts = new Map<string, number[]>(); // account → recent publish times
    app.get('/api/gallery', async (req: Request, res: Response) => {
      const me = await this.accounts.fromRequest(req).catch(() => null);
      const list = (await this.list()).sort((a, b) => b.votes.length - a.votes.length || b.createdAt - a.createdAt);
      res.json({ ok: true, scripts: list.map(s => view(s, me?.id ?? null)) });
    });
    app.post('/api/gallery', async (req: Request, res: Response) => {
      const me = await this.accounts.fromRequest(req);
      if (!me) return bad(res, 401, 'Sign in to publish scripts.');
      const recent = (posts.get(me.id) ?? []).filter(t => Date.now() - t < 3600_000);
      if (recent.length >= 5) return bad(res, 429, 'You have published a lot this hour. Try again later.');
      try {
        const s = await this.publish(me.id, me.displayName, req.body ?? {});
        posts.set(me.id, [...recent, Date.now()]);
        res.json({ ok: true, script: view(s, me.id) });
      } catch (e) { bad(res, 400, (e as Error).message); }
    });
    app.post('/api/gallery/:id/vote', async (req: Request, res: Response) => {
      const me = await this.accounts.fromRequest(req);
      if (!me) return bad(res, 401, 'Sign in to vote.');
      try { res.json({ ok: true, script: view(await this.vote(String(req.params.id), me.id, !!req.body?.up), me.id) }); }
      catch (e) { bad(res, 400, (e as Error).message); }
    });
    app.delete('/api/gallery/:id', async (req: Request, res: Response) => {
      const me = await this.accounts.fromRequest(req);
      if (!me) return bad(res, 401, 'Sign in first.');
      const s = await this.get(String(req.params.id));
      if (!s) return bad(res, 404, 'That script is gone.');
      if (s.ownerId !== me.id && !me.isAdmin) return bad(res, 403, 'Only its author or an admin can remove it.');
      await this.remove(s.id);
      res.json({ ok: true });
    });
  }
}
