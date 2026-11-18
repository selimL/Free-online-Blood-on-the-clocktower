import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { Lobby } from './lobby';
import { VoiceManager, loadRegions } from './voice';
import { GameError } from './game';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? true } });

const voice = new VoiceManager(loadRegions(), (gameId, id, event, payload) => lobby.sendTo(gameId, [id], event, payload));
const lobby = new Lobby(io, voice);

app.get('/api/health', (_req, res) => res.json({ ok: true, games: lobby.games.size, voice: voice.enabled }));
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
      if (e instanceof GameError) reply({ ok: false, error: e.message });
      else { console.error(e); reply({ ok: false, error: 'Server error.' }); }
    }
  };

  socket.on('lobby:list', guard(() => ({ games: lobby.publicList() })));
  socket.on('game:create', guard(d => lobby.create(socket, d)));
  socket.on('game:lookup', guard(d => lobby.lookup(String(d.code ?? ''))));
  socket.on('game:join', guard(d => lobby.join(socket, d)));
  socket.on('game:rejoin', guard(d => lobby.rejoin(socket, d)));
  socket.on('game:leave', guard(() => lobby.leave(socket)));
  socket.on('action', guard(d => lobby.action(socket, d)));
  socket.on('chat', guard(d => lobby.chat(socket, String(d.text ?? ''))));
  socket.on('voice:connected', guard(d => lobby.voiceConnected(socket, String(d.room ?? ''))));
  socket.on('disconnect', () => { clearInterval(interval); lobby.disconnected(socket); });
});

http.listen(PORT, () => console.log(`BotC server on :${PORT} (voice ${voice.enabled ? `enabled: ${voice.regions.map(r => r.name).join(', ')}` : 'disabled — set LIVEKIT_* env'})`));
