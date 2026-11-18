import type { GameView, PublicPlayer } from '../../../shared/types';
import { CHARACTER_BY_ID } from '../../../shared/characters';
import { Avatar } from './Avatar';
import { useVoice } from '../voice';
import { useStore, act } from '../net';

export function Clocktower({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 220" aria-hidden="true">
      <defs>
        <linearGradient id="stone" x1="0" x2="1"><stop offset="0" stopColor="#2b2530" /><stop offset="1" stopColor="#15121a" /></linearGradient>
      </defs>
      <path d="M60 2 L82 46 L38 46Z" fill="#1a1520" stroke="#3b3040" />
      <rect x="40" y="46" width="40" height="160" fill="url(#stone)" stroke="#3b3040" />
      <rect x="30" y="200" width="60" height="18" fill="#1a1520" />
      <circle cx="60" cy="82" r="15" fill="#e9dcc0" stroke="#5a1212" strokeWidth="3" />
      <path d="M60 82 L60 71 M60 82 L68 86" stroke="#2a1a12" strokeWidth="2.4" strokeLinecap="round" />
      {/* blood stains */}
      <path d="M48 96 q2 10 0 22 q3 4 4 0 q-2 -12 2 -22z M70 97 q-1 14 1 30 q3 3 4 -1 q-3 -14 -1 -29z" fill="#7a0f14" opacity=".9" />
      <path d="M52 66 q8 -4 16 0" stroke="#7a0f14" strokeWidth="3" fill="none" />
      <rect x="54" y="150" width="12" height="20" rx="6" fill="#ffcf6b" className="flicker" opacity=".85" />
      <rect x="54" y="120" width="12" height="16" rx="6" fill="#0b0a0f" />
    </svg>
  );
}

const ROLE_LABEL = { demon: 'Demon', minion: 'Minion', evil: 'evil' } as const;

interface CircleProps {
  view: GameView;
  onSeatClick?: (id: string) => void;
  selected?: string[];
  sleepingView?: boolean;
}

export function TownCircle({ view, onSeatClick, selected = [], sleepingView }: CircleProps) {
  const voice = useVoice();
  const deathFlash = useStore(s => s.deathFlash);
  const n = view.players.length;
  const isST = view.self.isStoryteller;
  const myLoc = isST ? view.storyteller.location : view.players.find(p => p.id === view.self.id)?.location ?? null;
  const night = view.phase === 'night';
  const nom = view.nomination;
  const evilRoles = !isST && view.self.evilTeam ? Object.fromEntries(view.self.evilTeam.members.map(m => [m.id, m.role])) : {};
  const grim = isST ? Object.fromEntries(view.self.grimoire.map(g => [g.id, g])) : {};
  const radius = n <= 6 ? 36 : 40;

  const seat = (p: PublicPlayer, i: number) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius;
    const away = !night && myLoc && p.location !== myLoc;
    const room = view.rooms.find(r => r.id === p.location);
    const hand = nom && !nom.done ? nom.hands[p.id] : undefined;
    const locked = nom ? nom.locked[p.id] : undefined;
    const isCurrentVoter = nom && !nom.done && view.stage === 'voting' && nom.order[nom.voteIndex] === p.id;
    const g = grim[p.id];
    const asleep = night && (sleepingView || (isST ? !g?.awake : p.id !== view.self.id || !(!isST && view.self.awake)));
    const classes = ['seat',
      p.alive ? 'alive' : 'dead', away ? 'away' : '', selected.includes(p.id) ? 'selected' : '',
      view.aboutToDie?.playerId === p.id ? 'on-block' : '', nom?.nomineeId === p.id ? 'nominee' : '',
      nom?.nominatorId === p.id ? 'nominator' : '', view.speakerId === p.id ? 'spotlight' : '',
      view.ability?.targetId === p.id ? 'ability-target' : '', view.ability?.playerId === p.id ? 'ability-user' : '',
      isCurrentVoter ? 'current-voter' : '', deathFlash === p.id ? 'death-flash' : '', !p.connected ? 'disconnected' : '',
      onSeatClick ? 'clickable' : '',
    ].join(' ');
    const label = `${p.name}${p.alive ? '' : ' (dead)'}${p.claim ? `, claims ${CHARACTER_BY_ID[p.claim]?.name ?? p.claim}` : ''}`;
    return (
      <div key={p.id} className={classes} style={{ left: `${x}%`, top: `${y}%` }}>
        <button className="seat-btn" onClick={() => onSeatClick?.(p.id)} disabled={!onSeatClick} aria-label={label}>
          <Avatar avatar={p.avatar} size={64} ghost={!p.alive} sleeping={asleep} speaking={voice.speaking.includes(p.id)} video={night ? undefined : voice.video[p.id]} title={p.name} />
          {(hand || locked) && <span className="hand" aria-label="hand raised">✋</span>}
          {locked === false && nom?.done === false && <span className="hand down" aria-hidden>·</span>}
          {p.muted && <span className="badge muted" title="Muted by Storyteller">🔇</span>}
          {p.joining && <span className="badge joining" title="Joining…">⏳</span>}
          {away && room && <span className="badge room" title={room.name}>{room.icon}</span>}
          {!p.alive && <span className={`badge ghostvote ${p.ghostVoteUsed ? 'used' : ''}`} title={p.ghostVoteUsed ? 'Ghost vote used' : 'Ghost vote available'}>{p.ghostVoteUsed ? '◌' : '●'}</span>}
        </button>
        <div className={`nameplate ${p.alive ? 'alive' : 'dead'}`}>
          {p.name}
          {p.evilMark && <span className="evil-mark"> (evil{evilRoles[p.id] && evilRoles[p.id] !== 'evil' ? ` · ${ROLE_LABEL[evilRoles[p.id] as 'demon' | 'minion']}` : ''})</span>}
        </div>
        {p.claim && <div className="claim">“{CHARACTER_BY_ID[p.claim]?.name ?? p.claim}”</div>}
        {p.traveller && p.travellerCharacter && <div className="claim traveller">Traveller: {CHARACTER_BY_ID[p.travellerCharacter]?.name}</div>}
        {p.revealedCharacter && <div className="claim revealed">{CHARACTER_BY_ID[p.revealedCharacter]?.name}</div>}
        {g && <div className={`grim-tag ${g.alignment}`}>{CHARACTER_BY_ID[g.characterId ?? '']?.name ?? '—'}{g.shownCharacterId !== g.characterId && g.shownCharacterId ? ` (thinks ${CHARACTER_BY_ID[g.shownCharacterId]?.name})` : ''}{g.reminders.length ? ` · ${g.reminders.join(', ')}` : ''}</div>}
      </div>
    );
  };

  return (
    <div className={`town-circle ${night ? 'night' : ''}`}>
      <div className="plaza" aria-hidden="true" />
      <div className="center">
        <Clocktower className="tower" />
        {(!night || isST) && view.storyteller.location === (myLoc ?? 'square') && (
          <div className="st-mini" title="Storyteller">
            <Avatar avatar={view.storyteller.avatar} size={44} speaking={voice.speaking.includes('st')} video={voice.video.st} />
            <span>{view.storyteller.name}</span>
          </div>
        )}
      </div>
      {view.players.map(seat)}
    </div>
  );
}

export function TownMap({ view }: { view: GameView }) {
  const isST = view.self.isStoryteller;
  const myId = isST ? 'st' : view.self.id;
  const night = view.phase === 'night';
  const voice = useVoice();
  const name = (id: string) => (id === 'st' ? `${view.storyteller.name} (Storyteller)` : view.players.find(p => p.id === id)?.name ?? '?');
  const pl = (id: string) => view.players.find(p => p.id === id);
  if (night && !isST) {
    return <nav className="town-map" aria-label="Town map"><h3>The Town</h3><p className="muted">The town sleeps. Every door is shut.</p></nav>;
  }
  return (
    <nav className="town-map" aria-label="Town map">
      <h3>The Town</h3>
      {view.rooms.filter(r => r.kind !== 'study' || r.occupants.length > 0).map(r => {
        const here = r.occupants.includes(myId);
        const full = r.capacity !== null && r.occupants.filter(o => o !== 'st').length >= r.capacity;
        return (
          <div key={r.id} className={`room-card ${r.kind} ${here ? 'here' : ''}`}>
            <button className="room-head" onClick={() => act('move', { room: r.id })} disabled={here || r.kind === 'study'} aria-label={`Go to ${r.name}`}>
              <span className="room-icon" aria-hidden>{r.icon}</span>
              <span className="room-name">{r.name}</span>
              {r.capacity !== null && <span className={`cap ${full ? 'full' : ''}`}>{r.occupants.filter(o => o !== 'st').length}/{r.capacity}</span>}
            </button>
            <ul>
              {r.occupants.map(id => (
                <li key={id} className={`${pl(id)?.alive === false ? 'dead' : ''} ${pl(id)?.joining ? 'joining' : ''}`}>
                  <span className={`dot ${voice.speaking.includes(id) && here ? 'speaking' : ''}`} />
                  {name(id)}{pl(id)?.joining ? ' — joining…' : ''}{pl(id)?.muted ? ' 🔇' : ''}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {isST && night && <p className="muted small">Night: players are in their beds. Click an avatar to wake them.</p>}
    </nav>
  );
}
