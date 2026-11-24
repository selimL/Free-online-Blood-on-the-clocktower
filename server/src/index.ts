import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { Lobby } from './lobby';
import { VoiceManager, loadRegions } from './voice';
import { GameError } from './game';
import { Gallery } from './gallery';
import { translate } from '../../shared/i18n';
import { createStore, createKV } from './persist';
import { Accounts } from './accounts';
import { adminRoutes } from './admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Optional settings file: put LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET (and PORT) in a `.env`
// file in the project folder instead of typing them each time. It is git-ignored, so keys stay local.
// Note: imports above are evaluated first, but the voice settings are only read when the server starts below.
try {
  const envFile = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envFile)) { process.loadEnvFile(envFile); console.log('Loaded settings from .env'); }
} catch (e) { console.warn('Could not read .env:', (e as Error).message); }
const PORT = Number(process.env.PORT ?? 3001);

const app = express();
app.set('trust proxy', 1); // behind Render's proxy: real https URLs and client addresses
app.use(express.json({ limit: '512kb' }));
const http = createServer(app);
const io = new Server(http, { cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? true }, maxHttpBufferSize: 2.5e6 }); // room for a game backup upload

const voice = new VoiceManager(loadRegions(), (gameId, id, event, payload) => lobby.sendTo(gameId, [id], event, payload));
const lobby = new Lobby(io, voice, createStore(process.env, path.resolve(__dirname, '../../.data')));

const kv = createKV(process.env, path.resolve(__dirname, '../../.data'));
const accounts = new Accounts(kv);
accounts.routes(app);
const gallery = new Gallery(kv, accounts);
gallery.routes(app);
adminRoutes(app, lobby, accounts, process.env, gallery);

app.get('/api/health', (_req, res) => res.json({ ok: true, games: lobby.games.size, voice: voice.enabled }));
const startedAt = Date.now();
// the public status page (/status): only aggregate numbers
app.get('/api/status', (_req, res) => res.json({
  ok: true, uptimeMinutes: Math.round((Date.now() - startedAt) / 60000), ...lobby.status(),
  voice: voice.enabled, accountStorage: kv.kind, version: (process.env.RENDER_GIT_COMMIT ?? '').slice(0, 7) || null, time: Date.now(),
}));
// Region list for client-side RTT probing (URLs only, never secrets).
app.get('/api/regions', (_req, res) => res.json(voice.regions.map(r => ({ name: r.name, url: r.url }))));

const dist = path.resolve(__dirname, '../../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

type Ack = (res: { ok: boolean; error?: string; [k: string]: unknown }) => void;

io.on('connection', (socket: Socket) => {
  let bucket = 0;
  const interval = setInterval(() => (bucket = 0), 1000);
  const guard = (fn: (data: any) => unknown) => async (data: any, ack?: Ack) => {
    const reply: Ack = typeof ack === 'function' ? ack : () => {};
    if (++bucket > 40) return reply({ ok: false, error: 'Slow down.' });
    try {
      const out = await fn(data ?? {});
      reply({ ok: true, ...(out && typeof out === 'object' ? out : {}) });
    } catch (e) {
      if (e instanceof GameError) reply({ ok: false, error: translate(lobby.languageOf(socket), e.template, e.vars) });
      else { console.error(e); reply({ ok: false, error: 'Server error.' }); }
    }
  };

  socket.on('lobby:list', guard(() => ({ games: lobby.publicList(), chat: lobby.lobbyChat })));
  socket.on('lobby:chat', guard(d => lobby.postLobbyChat(socket, d)));
  socket.on('report', guard(d => lobby.report(socket, d)));
  socket.on('game:create', guard(d => lobby.create(socket, d)));
  socket.on('game:lookup', guard(d => lobby.lookup(String(d.code ?? ''))));
  socket.on('game:join', guard(d => lobby.join(socket, d)));
  socket.on('game:tutorial', guard(d => lobby.tutorial(socket, d)));
  socket.on('game:restore', guard(d => lobby.restoreBackup(socket, d)));
  socket.on('game:spectate', guard(d => lobby.spectate(socket, d)));
  socket.on('game:rejoin', guard(d => lobby.rejoin(socket, d)));
  socket.on('game:leave', guard(() => lobby.leave(socket)));
  socket.on('action', guard(d => lobby.action(socket, d)));
  socket.on('chat', guard(d => lobby.chat(socket, String(d.text ?? ''))));
  socket.on('whisper', guard(d => lobby.whisper(socket, d)));
  socket.on('voice:connected', guard(d => lobby.voiceConnected(socket, String(d.room ?? ''))));
  socket.on('disconnect', () => { clearInterval(interval); lobby.disconnected(socket); });
});

http.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use: the game is probably already running in another window.`);
    console.error('Close that window (or press Ctrl + C in it) and run "npm start" again.');
    console.error(`Windows shortcut to stop it: Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force\n`);
    process.exit(1);
  }
  throw e;
});

// Save everything when the host stops the server (updates, the free plan going to sleep, Ctrl + C).
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, () => { lobby.flush().finally(() => process.exit(0)); setTimeout(() => process.exit(0), 4000); });
}

await lobby.restore();
http.listen(PORT, () => console.log(`BotC server on :${PORT} (voice ${voice.enabled ? `enabled: ${voice.regions.map(r => r.name).join(', ')}` : 'disabled — set LIVEKIT_* env'})`));
