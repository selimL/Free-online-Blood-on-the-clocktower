// Saving games so a restart (an update, or the free host waking from sleep) doesn't lose them.
//  - Upstash Redis (free online database) when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set:
//    needed on hosts whose disk is wiped on restart, like Render's free plan.
//  - Otherwise a local folder (.data/), which is fine when the game runs on your own computer.
import fs from 'node:fs';
import path from 'node:path';

export interface GameStore {
  readonly kind: string;
  loadAll(): Promise<string[]>;
  /** `keepUntil`: never expire before this time (scheduled games). */
  save(id: string, json: string, keepUntil?: number | null): Promise<void>;
  remove(id: string): Promise<void>;
}

export const TTL_SECONDS = 12 * 3600; // saved games expire after 12 hours without changes
const ttlFor = (keepUntil?: number | null) => Math.max(TTL_SECONDS, keepUntil ? Math.ceil((keepUntil - Date.now()) / 1000) + TTL_SECONDS : 0);

/** JSON that survives Infinity (used for "no deadline"). */
export const encode = (v: unknown) => JSON.stringify(v, (_k, x) => (x === Infinity ? '__inf' : x));
export const decode = (s: string) => JSON.parse(s, (_k, x) => (x === '__inf' ? Infinity : x));

export class FileStore implements GameStore {
  readonly kind = 'local folder';
  constructor(private dir: string) { fs.mkdirSync(dir, { recursive: true }); }
  private file(id: string) { return path.join(this.dir, `game-${id.replace(/[^a-zA-Z0-9_-]/g, '')}.json`); }
  async loadAll() {
    const now = Date.now();
    return fs.readdirSync(this.dir).filter(f => /^game-.*\.json$/.test(f)).flatMap(f => {
      const full = path.join(this.dir, f);
      const json = fs.readFileSync(full, 'utf8');
      let keepUntil: number | null = null;
      try { keepUntil = Number(JSON.parse(json).scheduledFor) || null; } catch { /* damaged: treat as unscheduled */ }
      if (now - fs.statSync(full).mtimeMs > TTL_SECONDS * 1000 && !(keepUntil && keepUntil + TTL_SECONDS * 1000 > now)) { fs.rmSync(full, { force: true }); return []; }
      return [json];
    });
  }
  async save(id: string, json: string) {
    const tmp = this.file(id) + '.tmp';
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, this.file(id)); // atomic: never a half-written file
  }
  async remove(id: string) { fs.rmSync(this.file(id), { force: true }); }
}

export class UpstashStore implements GameStore {
  readonly kind = 'Upstash Redis';
  constructor(private url: string, private token: string) {}
  private async cmd(args: (string | number)[]) {
    const res = await fetch(this.url, { method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    if (!res.ok) throw new Error(`Upstash ${res.status}: ${await res.text()}`);
    return (await res.json() as { result: unknown }).result;
  }
  async loadAll() {
    const keys = (await this.cmd(['KEYS', 'botc:game:*'])) as string[];
    if (!keys.length) return [];
    return ((await this.cmd(['MGET', ...keys])) as (string | null)[]).filter((x): x is string => !!x);
  }
  async save(id: string, json: string, keepUntil?: number | null) { await this.cmd(['SET', `botc:game:${id}`, json, 'EX', ttlFor(keepUntil)]); }
  async remove(id: string) { await this.cmd(['DEL', `botc:game:${id}`]); }
}

export function createStore(env = process.env, dataDir = '.data'): GameStore {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return new UpstashStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  return new FileStore(dataDir);
}

// ---------------------------------------------------------------- a small key-value store (accounts)
/** Plain key-value storage, kept until deleted (or until `ttlSeconds`). */
export interface KV {
  readonly kind: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export class FileKV implements KV {
  readonly kind = 'local folder';
  constructor(private dir: string) { fs.mkdirSync(dir, { recursive: true }); }
  private file(key: string) { return path.join(this.dir, `${Buffer.from(key).toString('base64url')}.json`); }
  async get(key: string) {
    try {
      const { v, exp } = JSON.parse(fs.readFileSync(this.file(key), 'utf8')) as { v: string; exp: number | null };
      if (exp && Date.now() > exp) { fs.rmSync(this.file(key), { force: true }); return null; }
      return v;
    } catch { return null; }
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    const tmp = this.file(key) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ v: value, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null }));
    fs.renameSync(tmp, this.file(key));
  }
  async del(key: string) { fs.rmSync(this.file(key), { force: true }); }
}

export class UpstashKV implements KV {
  readonly kind = 'Upstash Redis';
  constructor(private url: string, private token: string) {}
  private async cmd(args: (string | number)[]) {
    const res = await fetch(this.url, { method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    if (!res.ok) throw new Error(`Upstash ${res.status}: ${await res.text()}`);
    return (await res.json() as { result: unknown }).result;
  }
  async get(key: string) { return (await this.cmd(['GET', `botc:kv:${key}`])) as string | null; }
  async set(key: string, value: string, ttlSeconds?: number) { await this.cmd(ttlSeconds ? ['SET', `botc:kv:${key}`, value, 'EX', ttlSeconds] : ['SET', `botc:kv:${key}`, value]); }
  async del(key: string) { await this.cmd(['DEL', `botc:kv:${key}`]); }
}

export function createKV(env = process.env, dataDir = '.data'): KV {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return new UpstashKV(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  return new FileKV(path.join(dataDir, 'kv'));
}
