// Private messages between a player and the Storyteller.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { GameView } from '../../../shared/types';
import { rpc, pushAlert, socket, getStore } from '../net';
import { ping } from '../sound';

// unread counts per thread (player id), kept in memory for this tab
let unread: Record<string, number> = {};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());
export const useUnread = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => unread);
export function markRead(playerId: string) { if (unread[playerId]) { unread = { ...unread, [playerId]: 0 }; notify(); } }
let openThread: string | null = null; // the thread currently on screen counts as read

socket.on('whisper', (w: { playerId: string; fromST: boolean; text: string; name: string }) => {
  const me = getStore().session?.id;
  const isST = me === 'st' || !!me?.startsWith('co:');
  const mine = isST ? w.fromST : !w.fromST;
  if (mine) return;
  if (openThread !== w.playerId) { unread = { ...unread, [w.playerId]: (unread[w.playerId] ?? 0) + 1 }; notify(); }
  pushAlert(`✉ ${isST ? w.name : 'Storyteller'}: ${w.text}`, 'info');
  if (!isST) ping('whisper');
});

export function WhisperThread({ view, playerId }: { view: GameView; playerId: string }) {
  const isST = view.self.isStoryteller;
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const thread = view.whispers.filter(w => w.playerId === playerId);
  useEffect(() => { openThread = playerId; markRead(playerId); return () => { openThread = null; }; }, [playerId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); markRead(playerId); }, [thread.length, playerId]);
  const name = view.players.find(p => p.id === playerId)?.name ?? '?';
  const send = async () => {
    if (!text.trim()) return;
    const r = await rpc('whisper', { to: isST ? playerId : 'st', text });
    if (r.ok) setText(''); else pushAlert(r.error ?? 'Not sent', 'error');
  };
  return (
    <div className="chat whispers">
      <div className="chat-log">
        {thread.length === 0 && <p className="muted small">{isST ? `Nothing from ${name} yet.` : 'Ask the Storyteller something privately. Nobody else can see these messages.'}</p>}
        {thread.map(w => <div key={w.id} className={`msg ${w.fromST ? 'st' : ''}`}><b>{w.fromST ? (isST ? 'You' : 'Storyteller') : (isST ? name : 'You')}:</b> {w.text}</div>)}
        <div ref={endRef} />
      </div>
      <form className="row" onSubmit={e => { e.preventDefault(); void send(); }}>
        <input value={text} maxLength={300} onChange={e => setText(e.target.value)} placeholder={isST ? `Reply to ${name}…` : 'Whisper to the Storyteller…'} aria-label="Private message" />
        <button className="btn small">Send</button>
      </form>
    </div>
  );
}

/** The Storyteller's inbox: one thread per player. */
export function WhisperInbox({ view }: { view: GameView }) {
  const counts = useUnread();
  const [sel, setSel] = useState<string | null>(null);
  const humans = view.players.filter(p => !p.bot);
  const last = (id: string) => view.whispers.filter(w => w.playerId === id).at(-1);
  const sorted = [...humans].sort((a, b) => (last(b.id)?.ts ?? 0) - (last(a.id)?.ts ?? 0));
  if (sel) return <div className="whisper-inbox"><button className="btn small ghost" onClick={() => setSel(null)}>← All players</button><h3>✉ {view.players.find(p => p.id === sel)?.name}</h3><WhisperThread view={view} playerId={sel} /></div>;
  return (
    <ul className="whisper-list">
      {sorted.map(p => {
        const l = last(p.id);
        return (
          <li key={p.id}><button onClick={() => setSel(p.id)} className={counts[p.id] ? 'unread' : ''}>
            <b>{p.name}</b>{counts[p.id] ? <span className="count">{counts[p.id]}</span> : null}
            <span className="muted small">{l ? `${l.fromST ? 'You: ' : ''}${l.text}` : 'No messages'}</span>
          </button></li>
        );
      })}
    </ul>
  );
}
