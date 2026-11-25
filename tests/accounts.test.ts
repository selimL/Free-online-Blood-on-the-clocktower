// Accounts (name + password; Google and email links are off without keys) and the admin API.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { FileKV } from '../server/src/persist';
import { Accounts } from '../server/src/accounts';
import { adminRoutes } from '../server/src/admin';
import { Game } from '../server/src/game';

let base = '';
let server: ReturnType<express.Express['listen']>;
const closed: string[] = [];
const g = new Game({ name: 'Running', visibility: 'public', stName: 'ST' });
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  const accounts = new Accounts(new FileKV(fs.mkdtempSync(path.join(os.tmpdir(), 'botc-acct-'))), {});
  accounts.routes(app);
  const lobby = { games: new Map([[g.id, g]]), onlineCount: () => 2, closeGame: (id: string) => { closed.push(id); return true; } };
  adminRoutes(app, lobby as never, accounts, { ADMIN_PASSWORD: 'letmein-admin' });
  await new Promise<void>(r => { server = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());
const call = async (p: string, method = 'GET', body?: unknown, token?: string) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json()) };
};

describe('accounts', () => {
  it('register, sign in, keep data, sign out', async () => {
    expect(await call('/api/auth/config')).toMatchObject({ google: false, email: false });
    expect((await call('/api/auth/register', 'POST', { username: 'ab', password: 'longenough' })).error).toMatch(/3–20/);
    expect((await call('/api/auth/register', 'POST', { username: 'mortimer', password: 'short' })).error).toMatch(/8 characters/);
    const reg = await call('/api/auth/register', 'POST', { username: 'Mortimer', password: 'correct horse', displayName: 'Mort' });
    expect(reg.ok).toBe(true);
    expect((await call('/api/auth/register', 'POST', { username: 'mortimer', password: 'another one' })).status).toBe(409);
    expect((await call('/api/auth/login', 'POST', { username: 'mortimer', password: 'wrong password' })).status).toBe(401);
    const log = await call('/api/auth/login', 'POST', { username: 'mortimer', password: 'correct horse' });
    expect(log.ok).toBe(true);
    const put = await call('/api/account', 'PUT', { history: [{ gameId: 'g1', endedAt: 1 }], scripts: [{ id: 's1', updated: 1 }], displayName: 'Mortimer' }, log.token);
    expect(put.account).toMatchObject({ displayName: 'Mortimer', history: [{ gameId: 'g1' }], scripts: [{ id: 's1' }] });
    expect(JSON.stringify(put)).not.toContain('scrypt'); // the password hash never leaves the server
    await call('/api/auth/logout', 'POST', undefined, log.token);
    expect((await call('/api/account', 'GET', undefined, log.token)).status).toBe(401);
  });
  it('Google and email logins are off until their keys are set', async () => {
    expect((await call('/api/auth/email', 'POST', { email: 'a@b.cd' })).status).toBe(404);
    const r = await fetch(base + '/api/auth/google', { redirect: 'manual' });
    expect(r.status).toBe(404);
  });
});

describe('admin', () => {
  it('needs the password; lists games and accounts; closes games; resets passwords', async () => {
    expect((await call('/api/admin/games')).status).toBe(401);
    expect((await call('/api/admin/login', 'POST', { password: 'nope' })).status).toBe(401);
    const { token } = await call('/api/admin/login', 'POST', { password: 'letmein-admin' });
    const games = await call('/api/admin/games', 'GET', undefined, token);
    expect(games.games[0]).toMatchObject({ name: 'Running', online: 2 });
    await call(`/api/admin/games/${g.id}/close`, 'POST', { reason: 'bye' }, token);
    expect(closed).toEqual([g.id]);
    const accts = await call('/api/admin/accounts', 'GET', undefined, token);
    const m = accts.accounts.find((a: { username: string }) => a.username === 'mortimer');
    expect(m).toBeTruthy();
    expect((await call(`/api/admin/accounts/${m.id}/password`, 'POST', { password: 'brand new pw' }, token)).ok).toBe(true);
    expect((await call('/api/auth/login', 'POST', { username: 'mortimer', password: 'brand new pw' })).ok).toBe(true);
  });
});

describe('admin accounts', () => {
  it('the owner can make an account an admin, who can then use the admin page but not take over other admins', async () => {
    const { token: owner } = await call('/api/admin/login', 'POST', { password: 'letmein-admin' });
    const a = await call('/api/auth/register', 'POST', { username: 'helper1', password: 'helper password' });
    const b = await call('/api/auth/register', 'POST', { username: 'helper2', password: 'helper password' });
    expect((await call('/api/admin/games', 'GET', undefined, a.token)).status).toBe(401);
    expect((await call(`/api/admin/accounts/${a.account.id}/admin`, 'POST', { admin: true }, b.token)).status).toBe(401);
    expect((await call(`/api/admin/accounts/${a.account.id}/admin`, 'POST', { admin: true }, owner)).ok).toBe(true);
    expect((await call('/api/account', 'GET', undefined, a.token)).account.isAdmin).toBe(true);
    expect((await call('/api/admin/games', 'GET', undefined, a.token)).ok).toBe(true);
    expect((await call('/api/admin/me', 'GET', undefined, a.token))).toMatchObject({ kind: 'account', id: a.account.id });
    // the admin account can promote someone else, but not demote itself
    expect((await call(`/api/admin/accounts/${b.account.id}/admin`, 'POST', { admin: true }, a.token)).ok).toBe(true);
    // …but an admin account may step down itself
    expect((await call(`/api/admin/accounts/${b.account.id}/admin`, 'POST', { admin: false }, b.token)).ok).toBe(true);
    expect((await call('/api/admin/games', 'GET', undefined, b.token)).status).toBe(401);
    await call(`/api/admin/accounts/${b.account.id}/admin`, 'POST', { admin: true }, owner);
    // …and can't reset another admin's password or delete them
    expect((await call(`/api/admin/accounts/${b.account.id}/password`, 'POST', { password: 'stolen password' }, a.token)).error).toMatch(/site owner/);
    expect((await call(`/api/admin/accounts/${b.account.id}`, 'DELETE', undefined, a.token)).error).toMatch(/site owner/);
    // the owner can remove admin rights
    expect((await call(`/api/admin/accounts/${a.account.id}/admin`, 'POST', { admin: false }, owner)).ok).toBe(true);
    expect((await call('/api/admin/games', 'GET', undefined, a.token)).status).toBe(401);
  });
});

import { Gallery } from '../server/src/gallery';
describe('script gallery', () => {
  it('publishes valid scripts, counts votes once per account, and lets only the author or an admin remove', async () => {
    const kv = new FileKV(fs.mkdtempSync(path.join(os.tmpdir(), 'botc-gal-')));
    const accounts = new Accounts(kv, {});
    const g = new Gallery(kv, accounts);
    const ids = ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'poisoner', 'imp', 'nonsense'];
    await expect(g.publish('a1', 'Ann', { name: 'No demon', ids: ['washerwoman', 'librarian', 'chef', 'empath', 'monk'] })).rejects.toThrow(/Demon/);
    const s = await g.publish('a1', 'Ann', { name: 'Tiny TB', ids });
    expect(s.ids).not.toContain('nonsense');
    await expect(g.publish('a1', 'Ann', { name: 'tiny tb', ids })).rejects.toThrow(/already/);
    await g.vote(s.id, 'b2', true); await g.vote(s.id, 'b2', true); await g.vote(s.id, 'c3', true);
    expect((await g.get(s.id))!.votes.length).toBe(2);
    await g.vote(s.id, 'b2', false);
    expect((await g.get(s.id))!.votes).toEqual(['c3']);
    await g.remove(s.id);
    expect(await g.list()).toEqual([]);
  });
});
