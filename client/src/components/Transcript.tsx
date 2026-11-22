// Voice transcript UI: the consent question for players, and the Storyteller's reader.
import { useEffect, useMemo, useState } from 'react';
import type { GameView, TranscriptLine } from '../../../shared/types';
import { act, socket } from '../net';
import { Modal } from './Overlays';
import { transcriptionSupported } from '../transcriber';

export function TranscriptConsent({ view }: { view: GameView }) {
  if (view.self.isStoryteller || view.self.spectator || view.self.tutorial) return null;
  if (!view.houseRules.voiceTranscript || view.self.transcriptConsent !== null && view.self.transcriptConsent !== undefined || view.phase === 'ended') return null;
  const supported = transcriptionSupported();
  return (
    <Modal title="📝 Voice transcript">
      <p>The Storyteller has turned on a <b>voice transcript</b> for this game. If you agree:</p>
      <ul>
        <li>What you say in voice chat is turned into text by your browser and kept for this game.</li>
        <li><b>Only the Storyteller</b> can read it. Other players never see it.</li>
        <li>To do this, your browser sends your speech to its speech service (Google, in Chrome and Edge).</li>
        <li>Only while your microphone is live, and you can withdraw at any time in ⚙ Voice settings (that also deletes what was kept).</li>
      </ul>
      {!supported && <p className="warn small">Your browser can't transcribe speech, so nothing you say will be written down even if you agree.</p>}
      <div className="row end">
        <button className="btn ghost" onClick={() => act('transcriptConsent', { allow: false })}>Don't allow</button>
        <button className="btn primary" onClick={() => act('transcriptConsent', { allow: true })}>Allow</button>
      </div>
    </Modal>
  );
}

const roomName = (view: GameView, room: string) => {
  if (room.startsWith('night:')) return `🌙 Night, with ${view.players.find(p => `night:${p.id}` === room)?.name ?? '?'}`;
  const r = view.rooms.find(x => x.id === room);
  return r ? `${r.icon} ${r.name}` : room === 'study' ? '🕯 The Study' : room;
};

/** The Storyteller's transcript reader (filled once, then live). */
export function TranscriptReader({ view }: { view: GameView }) {
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [room, setRoom] = useState('');
  const [who, setWho] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    void act('st:transcript').then(r => { if (r.ok && Array.isArray(r.lines)) setLines(r.lines as TranscriptLine[]); });
    const add = (l: TranscriptLine) => setLines(ls => [...ls.slice(-2999), l]);
    const reset = (d: { playerId: string | null }) => { if (d.playerId) setLines(ls => ls.filter(l => l.playerId !== d.playerId)); };
    socket.on('transcript', add);
    socket.on('transcript:reset', reset);
    return () => { socket.off('transcript', add); socket.off('transcript:reset', reset); };
  }, []);
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';
  const rooms = useMemo(() => [...new Set(lines.map(l => l.room))], [lines]);
  const shown = lines.filter(l => (!room || l.room === room) && (!who || l.playerId === who) && (!q.trim() || l.text.toLowerCase().includes(q.trim().toLowerCase())));
  const consent = view.players.filter(p => !p.bot);
  if (!view.houseRules.voiceTranscript) return <p className="muted small">The voice transcript is off. Turn it on under Setup → House rules → <i>Voice transcript</i>. Every player will be asked to agree first.</p>;
  return (
    <div className="transcript">
      <div className="row wrap">
        <select value={room} onChange={e => setRoom(e.target.value)} aria-label="Room"><option value="">All rooms</option>{rooms.map(r => <option key={r} value={r}>{roomName(view, r)}</option>)}</select>
        <select value={who} onChange={e => setWho(e.target.value)} aria-label="Speaker"><option value="">Everyone</option>{consent.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" aria-label="Search the transcript" />
      </div>
      <div className="chat-log transcript-log">
        {shown.length === 0 && <p className="muted small">Nothing yet. Only players who agreed, speaking with a live microphone in Chrome or Edge, are transcribed.</p>}
        {shown.map((l, i) => {
          const newRoom = i === 0 || shown[i - 1].room !== l.room;
          return <div key={l.id}>
            {newRoom && <div className="tr-room">{roomName(view, l.room)} · {l.when}</div>}
            <div className="msg"><span className="muted small">{new Date(l.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> <b>{name(l.playerId)}:</b> {l.text}</div>
          </div>;
        })}
      </div>
      <p className="muted small">Only you can read this. Players who withdraw their agreement are removed from it.</p>
    </div>
  );
}
