// Word listening UI: the consent question for players, and the Storyteller's log of detections.
import type { GameView } from '../../../shared/types';
import { act } from '../net';
import { Modal } from './Overlays';
import { transcriptionSupported } from '../transcriber';

const WORD_CHARS = 'the Mezepheles\' secret word, the Yaggababble\'s phrase, a Goblin claim or the God of Ug\'s one-syllable rule';

export function TranscriptConsent({ view }: { view: GameView }) {
  if (view.self.isStoryteller || view.self.spectator || view.self.tutorial) return null;
  if (!view.self.transcriptRequired) return null;
  const needed = view.phase === 'lobby' || view.phase === 'dealt';
  if (view.self.transcriptConsent === false && needed) return (
    <div className="consent-banner" role="alert">
      🗣 This game has a character that needs <b>listening for secret words</b>, so it can't start until everyone allows it.
      You chose not to. <button className="btn small primary" onClick={() => act('transcriptConsent', { allow: true })}>Allow</button>
      <span className="muted small"> or ask the Storyteller to change the characters, or leave.</span>
    </div>
  );
  if (view.self.transcriptConsent !== null && view.self.transcriptConsent !== undefined) return null;
  const supported = transcriptionSupported();
  return (
    <Modal title="🗣 Listening for secret words">
      <p>A character in this game depends on what people <b>say out loud</b> ({WORD_CHARS}). {needed && <b>The game can only start once every player allows this.</b>} If you agree:</p>
      <ul>
        <li>While your microphone is live, your browser turns your speech into English text.</li>
        <li>The game checks it <b>only</b> for those words, then throws it away. <b>What you say is never kept.</b></li>
        <li>If you say one of them, the Storyteller sees who said it, when, in which room and who was there. <b>Only the Storyteller</b> sees this.</li>
        <li>To do this, your browser sends your speech to its speech service (Google, in Chrome and Edge).</li>
        <li><b>Your answer is locked once the game starts.</b> Until then you can change it in ⚙ Voice settings.</li>
      </ul>
      {!supported && <p className="warn small">Your browser can't turn speech into text (use Chrome or Edge), so nothing will be checked even if you agree.</p>}
      <div className="row end">
        <button className="btn ghost" onClick={() => act('transcriptConsent', { allow: false })}>Don't allow</button>
        <button className="btn primary" onClick={() => act('transcriptConsent', { allow: true })}>Allow</button>
      </div>
    </Modal>
  );
}

const ICON: Record<string, string> = { mezepheles: '🗣', yaggababble: '🗯', goblin: '👺', ug: '🎩' };
const LABEL: Record<string, string> = { mezepheles: 'Mezepheles word', yaggababble: 'Yaggababble phrase', goblin: 'Goblin claim', ug: 'Ug-hat slip' };

/** The Storyteller's log: what was detected, by whom, when, where and who heard it. */
export function TranscriptReader({ view }: { view: GameView }) {
  if (!view.self.isStoryteller) return null;
  const self = view.self;
  const name = (id: string) => (id === 'st' ? 'you' : view.players.find(p => p.id === id)?.name ?? '?');
  const roomName = (room: string) => {
    if (room.startsWith('night:')) return '🌙 a night chamber';
    const r = view.rooms.find(x => x.id === room);
    return r ? `${r.icon} ${r.name}` : room === 'study' ? '🕯 the Study' : room;
  };
  const agreed = view.players.filter(p => !p.bot);
  const consent = (id: string) => self.grimoire.find(g => g.id === id)?.transcriptConsent;
  if (!view.houseRules.voiceTranscript) return <p className="muted small">Word listening is off. Turn it on under Setup → House rules → <i>Listen for word characters</i>.</p>;
  return (
    <div className="transcript">
      <p className={`small ${self.transcriptActive ? '' : 'muted'}`}>{self.transcriptActive
        ? '🟢 Listening: speech of players who agreed is checked for the words your characters need. Sentences are never kept, only what is detected below.'
        : '⚪ Not listening: it switches on once the game starts with the Mezepheles, Yaggababble, Goblin or God of Ug on the public list, the script or the Loric.'}</p>
      {self.transcriptActive && <p className="muted small">Players: {agreed.map(p => `${p.name} ${consent(p.id) === true ? '✓' : consent(p.id) === false ? '✗' : '…'}`).join(' · ')}</p>}
      <ul className="word-log">
        {self.wordLog.length === 0 && <li className="muted small">Nothing detected yet.</li>}
        {[...self.wordLog].reverse().map(e => (
          <li key={e.id}>
            <b>{ICON[e.kind]} {LABEL[e.kind]}</b>: <b>{name(e.playerId)}</b> {e.detail}
            <div className="small muted">{e.when} · {new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {roomName(e.room)} · {e.withIds.length ? `with ${e.withIds.map(name).join(', ')}` : 'nobody else there'}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
