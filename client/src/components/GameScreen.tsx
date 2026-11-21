import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { GameView, Avatar } from '../../../shared/types';
import { defaultAvatar } from '../../../shared/types';
import { AvatarCreator } from './Avatar';
import { CHARACTER_BY_ID, CHARACTERS, CLAIMABLE_ABILITIES, DAY_ABILITIES, ROOM_ART } from '../../../shared/characters';
import { act, useStore, rpc, set, forgetSession, getStore } from '../net';
import { useVoice, toggleMic, toggleCam, probeRegions } from '../voice';
import { TownCircle, TownMap, seatRadiusPct } from './TownSquare';
import { SQUASH, initial3D, save3D, webglAvailable } from '../three/support';
import { setNightAmbience, setHeartbeat, setVolume, useVolume } from '../sound';

const TownScene = lazy(() => import('../three/TownScene'));
const RoomScene = lazy(() => import('../three/RoomScene'));
import { occupantsOf } from '../three/occupants';
import {
  CharacterModal, CharactersInPlay, Confirm, InfoPopup, QuestionPrompt, TimerBadge, VoteBar,
  TransitionOverlay, NightSleep, Modal, CharacterToken,
} from './Overlays';
import { StorytellerPanel, StorytellerControls } from './Storyteller';

type ConfirmState = { title: string; text: React.ReactNode; confirm: string; onYes: () => void } | null;

const PHASE_LABEL: Record<string, string> = { lobby: 'Gathering', dealt: 'Setting up', questions: 'Questions', night: 'Night', day: 'Day', ended: 'Game over' };
const STAGE_LABEL: Record<string, string> = { discussion: 'Town discussion', private: 'Private conversations', nominations: 'Nominations open', accusation: 'Accusation', defense: 'Defence', voting: 'Voting', closed: 'Nominations closed', speedround: 'Speed round' };

export function GameScreen({ view }: { view: GameView }) {
  const isST = view.self.isStoryteller;
  const me = !view.self.isStoryteller ? view.players.find(p => p.id === view.self.id) ?? null : null;
  const [modal, setModal] = useState<'character' | 'list' | 'claim' | 'label' | 'invite' | 'reveal' | 'rules' | 'customise' | 'story' | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [nightSel, setNightSel] = useState<string[]>([]);
  const night = view.phase === 'night';
  const asleep = night && !isST && !view.self.isStoryteller && !view.self.awake;
  const [use3D, setUse3D] = useState(initial3D);
  const [failed3D, setFailed3D] = useState(false);
  const stageRef = useRef<HTMLElement>(null);
  const circleRef = useRef<HTMLDivElement>(null);
  const art = roomArt(view);
  const show3D = use3D && !failed3D && !art && !asleep;
  const show3DRoom = use3D && !failed3D && !!art && !asleep;
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // where I just came from (to step out of that building's door in the 3D town)
  const myLoc = view.self.isStoryteller ? view.storyteller.location : me?.location ?? null;
  const lastLocRef = useRef<string | null>(myLoc);
  const arrivedFromRef = useRef<string | null>(null);
  if (myLoc !== lastLocRef.current) { if (myLoc === 'square') arrivedFromRef.current = lastLocRef.current; lastLocRef.current = myLoc; }
  const walkMode = show3D && view.canWalk && !night && myLoc === 'square';
  const roomOccupants = useMemo(() => (show3DRoom && myLoc ? occupantsOf(myLoc, view.players, view.storyteller) : []), [show3DRoom, myLoc, view.players, view.storyteller]);
  const awakeIds = useMemo(() => view.self.isStoryteller
    ? view.self.grimoire.filter(g => g.awake).map(g => g.id)
    : view.self.awake ? [view.self.id] : [], [view.self]);
  const toggle3D = () => { const on = !use3D; setUse3D(on); setFailed3D(false); save3D(on); };
  // Side-room art: tilt/shift with the pointer for a sense of depth.
  const onStageMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!art || reducedMotion) return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--px', String((e.clientX - r.left) / r.width - 0.5));
    e.currentTarget.style.setProperty('--py', String((e.clientY - r.top) / r.height - 0.5));
  };

  useEffect(() => { if (!isST) void probeRegions(); }, [isST]);
  useEffect(() => { if (!night) setNightSel([]); }, [night]);
  // the story opens by itself when the game ends
  const ended = view.phase === 'ended';
  useEffect(() => { if (ended) { const t = setTimeout(() => setModal('story'), 2800); return () => clearTimeout(t); } }, [ended]);
  // atmosphere: wind and crickets at night, a heartbeat while votes are counted
  const voting = view.stage === 'voting' && !!view.nomination && !view.nomination.done;
  useEffect(() => { setNightAmbience(night); }, [night]);
  useEffect(() => { setHeartbeat(voting); }, [voting]);
  useEffect(() => () => { setNightAmbience(false); setHeartbeat(false); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.toLowerCase() === 'p' && !isST) setModal(m => (m === 'character' ? null : 'character'));
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [isST]);

  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';

  const onSeatClick = (id: string) => {
    if (view.self.isStoryteller) {
      if (night) void act('st:wake', { playerId: id });
      else if (view.phase !== 'lobby') void act('st:mute', { playerId: id });
      return;
    }
    const self = view.self;
    if (night) {
      if (!self.awake) return;
      setNightSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
      return;
    }
    const a = view.ability;
    if (a && a.playerId === self.id && a.stage === 'acting' && a.needsTarget) { void act('abilityTarget', { targetId: id }); return; }
    if (view.phase === 'day' && view.stage === 'nominations' && me) {
      const target = view.players.find(p => p.id === id)!;
      const canNominate = me.alive && !view.nominatorsToday.includes(me.id) && !view.nominatedToday.includes(id);
      if (target.traveller) {
        setConfirm({
          title: `Nominate ${target.name}?`, confirm: 'Call for exile',
          text: <p>{target.name} is a Traveller. You can call for their <b>exile</b> (anyone may, alive or dead; half of all players must vote).{canNominate && <> <button className="btn small" onClick={() => { setConfirm(null); void act('nominate', { nomineeId: id }); }}>Nominate for execution instead</button></>}</p>,
          onYes: () => act('nominate', { nomineeId: id, exile: true }),
        });
      } else if (canNominate) {
        setConfirm({ title: 'Nominate?', text: <p>Nominate <b>{target.name}</b> for execution{target.id === me.id ? ' (yourself)' : ''}? You can only nominate once per day.</p>, confirm: 'Nominate', onYes: () => act('nominate', { nomineeId: id }) });
      }
    }
  };

  const selected = useMemo(() => {
    if (night) return nightSel;
    const a = view.ability;
    return a?.targetId ? [a.targetId] : [];
  }, [night, nightSel, view.ability]);

  const showClickHint = !isST && !night && view.phase === 'day' && view.stage === 'nominations' && me?.alive && !view.nominatorsToday.includes(me.id);

  return (
    <div className={`game phase-${view.phase} ${asleep ? 'asleep' : ''}`}>
      <TopBar view={view} openList={() => setModal('list')} openInvite={() => setModal('invite')} openRules={() => setModal('rules')} openCustomise={() => setModal('customise')} openStory={() => setModal('story')} use3D={use3D && !failed3D} toggle3D={toggle3D} />
      <main className="layout">
        <aside className="left"><TownMap view={view} /></aside>
        <section ref={stageRef} onMouseMove={onStageMove} className={`stage ${art ? 'has-room-art' : ''} ${show3D ? 'has-3d' : ''}`} style={art ? { ['--room-art' as string]: `url(/art/${art}.jpg)` } : undefined}>
          {art && !show3DRoom && <><div className="room-art-layer" aria-hidden="true" /><div className="room-art-light" aria-hidden="true" /></>}
          {show3DRoom && art && (
            <Suspense fallback={null}>
              <RoomScene art={art} occupants={roomOccupants} myId={view.self.isStoryteller ? 'st' : view.self.id}
                reducedMotion={reducedMotion} onFigureClick={onSeatClick} onFail={() => setFailed3D(true)} />
            </Suspense>
          )}
          {show3D && (
            <Suspense fallback={null}>
              <TownScene anchor={circleRef} container={stageRef} seatRadiusFrac={seatRadiusPct(view.players.length) / 100}
                night={night} rooms={view.rooms} players={view.players} storyteller={view.storyteller} awakeIds={awakeIds}
                reducedMotion={reducedMotion} onFail={() => setFailed3D(true)}
                myId={view.self.isStoryteller ? 'st' : view.self.id} canWalk={walkMode} onFigureClick={onSeatClick}
                onEnterRoom={room => { void act('move', { room }); }} arrivedFrom={arrivedFromRef.current} />
            </Suspense>
          )}
          <StageHeader view={view} />
          {asleep ? <NightSleep view={view} /> : show3DRoom ? <div ref={circleRef} className="room3d-spacer" /> : <TownCircle view={view} onSeatClick={onSeatClick} selected={selected} anchorRef={circleRef} squash={show3D ? SQUASH : undefined} walking={walkMode} />}
          {showClickHint && <p className="hint">Click a player's avatar to nominate them.</p>}
          {!isST && night && view.self.awake && !view.self.isStoryteller && (
            <div className="night-choice parchment">
              <b>You are awake.</b> Speak with the Storyteller, and click avatars to choose players.
              <div className="chips">{nightSel.map(id => <span key={id} className="chip">{name(id)}</span>)}</div>
              <button className="btn primary" onClick={() => act('nightChoice', { ids: nightSel })}>Send choice to Storyteller</button>
            </div>
          )}
          <AbilityBanner view={view} />
          <VoteBar view={view} />
          {view.phase === 'questions' && <QuestionsBanner view={view} />}
          {view.phase === 'ended' && <div className={`winner-banner ${view.winner}`}>{view.winner === 'good' ? 'Good' : 'Evil'} wins! All characters are revealed.</div>}
        </section>
        <aside className="right">
          {isST ? <StorytellerPanel view={view} /> : <SidePanel view={view} />}
        </aside>
      </main>
      <footer className="bottom-bar">
        <div className="bl">
          {!isST && view.phase !== 'lobby' && <>
            <button className="btn" onClick={() => setModal('claim')} disabled={view.phase !== 'day'}>🎭 Claim Ability</button>
            <button className="btn ghost" onClick={() => setModal('label')}>🏷 Set claimed character</button>
            {view.houseRules.allowCharacterReveal && <button className="btn ghost" onClick={() => setModal('reveal')}>🂠 Show character</button>}
          </>}
          {!isST && view.phase === 'lobby' && <button className="btn ghost" onClick={() => setModal('label')}>🏷 Set claimed character</button>}
        </div>
        <div className="bc">{isST && <StorytellerControls view={view} />}</div>
        <div className="br">
          {!isST && <>
            <button className="btn" onClick={() => setModal('character')} title="Shortcut: P">📜 Character <kbd>P</kbd></button>
            <UseAbilityButton view={view} setConfirm={setConfirm} />
          </>}
        </div>
      </footer>

      {modal === 'character' && <CharacterModal view={view} onClose={() => setModal(null)} />}
      {modal === 'list' && <CharactersInPlay view={view} onClose={() => setModal(null)} />}
      {modal === 'claim' && <ClaimAbilityDialog view={view} onClose={() => setModal(null)} setConfirm={setConfirm} />}
      {modal === 'label' && <ClaimLabelDialog view={view} onClose={() => setModal(null)} />}
      {modal === 'invite' && <InviteDialog view={view} onClose={() => setModal(null)} />}
      {modal === 'reveal' && <RevealDialog view={view} onClose={() => setModal(null)} />}
      {modal === 'customise' && <CustomiseDialog view={view} onClose={() => setModal(null)} />}
      {modal === 'story' && view.story && <StoryDialog view={view} onClose={() => setModal(null)} />}
      {modal === 'rules' && <Modal title="Table rules" onClose={() => setModal(null)}><ul>{view.tableRules.map(r => <li key={r}>{r}</li>)}</ul></Modal>}
      {!isST && me?.traveller && !view.self.isStoryteller && !view.self.characterId && view.phase !== 'lobby' && <TravellerPicker view={view} />}
      {confirm && <Confirm {...confirm} onYes={() => { confirm.onYes(); setConfirm(null); }} onNo={() => setConfirm(null)} />}
      <QuestionPrompt view={view} />
      <InfoPopup view={view} />
      <TransitionOverlay />
      {view.paused && <div className="paused-banner">⏸ The game is paused{!view.storyteller.connected ? ' — waiting for the Storyteller to reconnect' : ''}.</div>}
    </div>
  );
}

function TopBar({ view, openList, openInvite, openRules, openCustomise, openStory, use3D, toggle3D }: { view: GameView; openList: () => void; openInvite: () => void; openRules: () => void; openCustomise: () => void; openStory: () => void; use3D: boolean; toggle3D: () => void }) {
  const voice = useVoice();
  const leave = async () => {
    if (!confirm('Leave this game? Your seat is kept — you can rejoin from this browser.')) return;
    await rpc('game:leave');
    set({ session: null, view: null });
    history.pushState(null, '', '/');
    dispatchEvent(new PopStateEvent('popstate'));
  };
  void forgetSession; void getStore;
  return (
    <header className="top-bar">
      <div className="tl">
        <span className="game-name">{view.name}</span>
        <button className="btn small ghost" onClick={openInvite} title="Invite players">Code <b>{view.code}</b></button>
      </div>
      <div className="tc">
        <span className="phase">{PHASE_LABEL[view.phase]}{view.phase === 'day' ? ` ${view.day}` : view.phase === 'night' ? ` ${view.night}` : ''}{view.stage ? ` · ${STAGE_LABEL[view.stage]}` : ''}</span>
        <TimerBadge view={view} />
      </div>
      <div className="tr">
        {view.voice.enabled ? <>
          <button className={`icon-btn ${voice.micOn ? 'on' : 'off'}`} onClick={toggleMic} aria-pressed={voice.micOn} title="Microphone">{voice.micOn ? '🎙' : '🔇'}</button>
          <button className={`icon-btn ${voice.camOn ? 'on' : 'off'}`} onClick={toggleCam} aria-pressed={voice.camOn} title="Camera (optional)">{voice.camOn ? '📷' : '🚫'}</button>
          <span className={`voice-status ${voice.connectedRoom ? (voice.canPublish ? 'live' : 'waiting') : 'none'}`} title={voice.error ?? ''}>
            {voice.connectedRoom ? (voice.canPublish ? 'voice live' : 'connecting…') : 'no voice'}
          </span>
        </> : <span className="voice-status none" title="Voice server not configured; text chat only">text only</span>}
        {webglAvailable() && <button className="btn small ghost" onClick={toggle3D} aria-pressed={use3D} title="Switch between the 3D town and the flat 2D view">{use3D ? '🗺 2D view' : '🏰 3D view'}</button>}
        {view.story && <button className="btn small primary" onClick={openStory}>📜 Game story</button>}
        <VolumeControl />
        <button className="btn small ghost" onClick={openCustomise} title="Change your name and figure">👤 Customise</button>
        <button className="btn small ghost" onClick={openRules}>⚖ Table rules</button>
        {view.characterList ? <button className="btn small" onClick={openList}>📖 Characters in Play</button> : null}
        <button className="btn small ghost" onClick={leave}>Leave</button>
      </div>
    </header>
  );
}

/** Art for the viewer's current side room or the Study (the Town Square has its own plaza art). */
function roomArt(view: GameView): string | null {
  if (view.phase === 'night') return null;
  const loc = view.self.isStoryteller ? view.storyteller.location : view.players.find(p => p.id === view.self.id)?.location;
  if (loc === 'study') return 'study';
  const m = loc?.match(/^r(\d+)$/);
  return m ? ROOM_ART[Number(m[1]) % ROOM_ART.length] : null;
}

function StoryDialog({ view, onClose }: { view: GameView; onClose: () => void }) {
  const story = view.story!;
  const [tab, setTab] = useState<'timeline' | 'votes' | 'grimoire'>('timeline');
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? (id === 'st' ? view.storyteller.name : '?');
  // group "[Night 1] text" lines under their night/day heading
  const groups: { when: string; lines: string[] }[] = [];
  for (const line of story.log) {
    const m = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    const when = m ? m[1] : '', text = m ? m[2] : line;
    if (!groups.length || groups[groups.length - 1].when !== when) groups.push({ when, lines: [] });
    groups[groups.length - 1].lines.push(text);
  }
  const ch = (id: string | null) => (id ? CHARACTER_BY_ID[id]?.name ?? id : '—');
  return (
    <Modal title={`The story of ${view.name}`} onClose={onClose} wide>
      <p className={`story-winner ${view.winner}`}>{view.winner === 'good' ? '☀ Good wins!' : view.winner === 'evil' ? '🩸 Evil wins!' : ''}</p>
      <div className="tabs" role="tablist">
        {(['timeline', 'votes', 'grimoire'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t === 'timeline' ? 'Timeline' : t === 'votes' ? `Votes (${story.votes.length})` : 'Grimoire'}</button>)}
      </div>
      {tab === 'timeline' && <div className="story-timeline">{groups.map((g, i) => (
        <section key={i}><h3>{g.when || 'Setup'}</h3><ul>{g.lines.map((l, j) => <li key={j} className={/BLUFF|died|executed|exiled|Demon/i.test(l) ? 'key' : ''}>{l}</li>)}</ul></section>
      ))}</div>}
      {tab === 'votes' && (story.votes.length ? <table className="story-votes"><thead><tr><th>Day</th><th>Nomination</th><th>Votes</th><th>Voted yes</th></tr></thead><tbody>
        {story.votes.map((v, i) => <tr key={i}><td>{v.day}</td><td>{name(v.nominatorId)} → {name(v.nomineeId)}{v.exile ? ' (exile)' : ''}</td><td>{v.votes}/{v.needed}</td><td>{v.yes.map(name).join(', ') || '—'}</td></tr>)}
      </tbody></table> : <p className="muted">No votes this game.</p>)}
      {tab === 'grimoire' && <table className="story-grim"><thead><tr><th>Player</th><th>Character</th><th>Team</th><th>Notes</th></tr></thead><tbody>
        {story.grimoire.map(g => <tr key={g.id} className={g.alignment}><td>{g.alive ? '' : '👻 '}{g.name}{g.traveller ? ' (Traveller)' : ''}</td>
          <td><b>{ch(g.characterId)}</b>{g.shownCharacterId && g.shownCharacterId !== g.characterId ? <span className="muted"> — thought they were the {ch(g.shownCharacterId)}</span> : null}</td>
          <td className={`align ${g.alignment}`}>{g.alignment}</td><td className="muted small">{g.reminders.join(', ')}</td></tr>)}
      </tbody></table>}
      {tab === 'grimoire' && story.demonBluffs.length > 0 && <p className="muted small">Demon bluffs: {story.demonBluffs.map(ch).join(', ')}</p>}
    </Modal>
  );
}

function VolumeControl() {
  const volume = useVolume();
  const [last, setLast] = useState(0.6);
  return (
    <span className="volume" title="Sound effects volume (bells, night ambience, heartbeat)">
      <button className="icon-btn" aria-label={volume ? 'Mute sound effects' : 'Unmute sound effects'}
        onClick={() => { if (volume) { setLast(volume); setVolume(0); } else setVolume(last || 0.6); }}>{volume === 0 ? '🔈' : volume < 0.5 ? '🔉' : '🔊'}</button>
      <input type="range" min={0} max={100} value={Math.round(volume * 100)} aria-label="Sound effects volume" onChange={e => setVolume(Number(e.target.value) / 100)} />
    </span>
  );
}

function StageHeader({ view }: { view: GameView }) {
  const isST = view.self.isStoryteller;
  const loc = isST ? view.storyteller.location : view.players.find(p => p.id === view.self.id)?.location;
  const room = view.rooms.find(r => r.id === loc);
  const me = !isST ? view.players.find(p => p.id === view.self.id) : null;
  if (view.phase === 'night') return <div className={`stage-header night`}>🌙 Night {view.night}{isST && loc ? ` · with ${view.players.find(p => `night:${p.id}` === loc)?.name}` : ''}</div>;
  return (
    <div className={`stage-header loc-${room?.kind ?? 'none'} room-${room?.id ?? ''}`}>
      <span>{room ? `${room.icon} ${room.name}` : 'Nowhere'}</span>
      {me?.joining && <span className="joining-note">Joining… you cannot hear or be heard for a moment.</span>}
      {me?.muted && <span className="muted-note">🔇 Muted by Storyteller</span>}
    </div>
  );
}

function QuestionsBanner({ view }: { view: GameView }) {
  const q = view.questions;
  const cur = view.players.find(p => p.id === q.currentId);
  return (
    <div className="questions-banner parchment">
      {cur ? <>Storyteller is answering questions ({q.done + 1}/{Math.max(q.total, q.done + 1)}) — with {cur.name}{!view.self.isStoryteller && cur.id === view.self.id ? ' (you)' : ''}.</>
        : <>The Storyteller is preparing{q.total ? ` · questions answered ${q.done}/${q.total}` : ''}.</>}
    </div>
  );
}

function AbilityBanner({ view }: { view: GameView }) {
  const a = view.ability;
  if (!a) return null;
  const mine = !view.self.isStoryteller && a.playerId === view.self.id;
  const name = (id: string | null) => view.players.find(p => p.id === id)?.name ?? '?';
  const ch = CHARACTER_BY_ID[a.characterId];
  return (
    <div className="ability-banner" role="alert">
      <div className="ability-title">⚔ {name(a.playerId)} is using an ability! <span className="muted">({ch?.name})</span></div>
      {a.stage === 'gathering' && <div>Everyone is gathering in the Town Square…</div>}
      {a.stage === 'acting' && (mine
        ? <div>{a.prompt} {a.needsTarget && <>Click an avatar. Target: <b>{a.targetId ? name(a.targetId) : '—'}</b>. </>}Explain dramatically how you do it, then
          <button className="btn primary small" disabled={a.needsTarget && !a.targetId} onClick={() => act('abilityDone')}>Done</button></div>
        : <div>{name(a.playerId)} is acting{a.targetId ? <> — target: <b>{name(a.targetId)}</b></> : ''}…</div>)}
      {a.stage === 'pending' && <div>{a.targetId ? <>Target: <b>{name(a.targetId)}</b>. </> : ''}The Storyteller is resolving…</div>}
      {a.stage === 'resolved' && <div className="ability-result">{a.result}</div>}
    </div>
  );
}

function UseAbilityButton({ view, setConfirm }: { view: GameView; setConfirm: (c: ConfirmState) => void }) {
  if (view.self.isStoryteller) return null;
  const id = view.self.characterId;
  const def = id ? DAY_ABILITIES[id] : undefined;
  if (!id || !def) return null; // only shown for characters with a day ability
  const ch = CHARACTER_BY_ID[id];
  const once = def.frequency === 'once';
  return (
    <button className="btn primary" disabled={!view.self.abilityAvailable || !!view.ability}
      onClick={() => setConfirm({
        title: `Use ${ch.name} ability?`,
        text: <><p>{ch.ability}</p>{once && <p><b>Are you sure? This can only be used once.</b></p>}{def.public ? <p>Everyone will be pulled to the Town Square.</p> : <p>This is private: the Storyteller will call you to the Study.</p>}</>,
        confirm: 'Use ability', onYes: () => act('ability', { mode: 'real' }),
      })}>✨ Use Ability</button>
  );
}

function ClaimAbilityDialog({ view, onClose, setConfirm }: { view: GameView; onClose: () => void; setConfirm: (c: ConfirmState) => void }) {
  if (view.self.isStoryteller) return null;
  const self = view.self;
  const options = CLAIMABLE_ABILITIES.filter(id => id !== self.characterId);
  return (
    <Modal title="Claim an ability (bluff)" onClose={onClose}>
      <p className="muted">Publicly “use” the daytime ability of a character you are claiming to be. To everyone else it looks exactly like a real use. The Storyteller resolves it.</p>
      {options.map(id => {
        const def = DAY_ABILITIES[id];
        const used = self.claimsUsed[id] !== undefined && (def.frequency !== 'daily' || self.claimsUsed[id] === view.day);
        const meP = view.players.find(p => p.id === self.id);
        const tooLate = (def.frequency === 'firstDay' && view.day !== 1) || (def.requiresDead ? meP?.alive : !meP?.alive);
        return (
          <div key={id} className="claim-option">
            <div><CharacterToken ch={CHARACTER_BY_ID[id]} />{def.requiresDead && <p className="small muted">Only after you have died.</p>}</div>
            <button className="btn" disabled={used || tooLate || !!view.ability} onClick={() => {
              onClose();
              setConfirm({ title: `Use ${CHARACTER_BY_ID[id].name} ability?`, text: def.frequency === 'once' ? <p><b>Are you sure? This can only be used once.</b></p> : <p>Use this ability now?</p>, confirm: 'Use ability', onYes: () => act('ability', { mode: 'claim', characterId: id }) });
            }}>Use as {CHARACTER_BY_ID[id].name}</button>
          </div>
        );
      })}
    </Modal>
  );
}

function ClaimLabelDialog({ view, onClose }: { view: GameView; onClose: () => void }) {
  const me = !view.self.isStoryteller ? view.players.find(p => p.id === view.self.id) : null;
  const [val, setVal] = useState(me?.claim ?? '');
  const options = CHARACTERS.filter(c => c.type !== 'fabled');
  return (
    <Modal title="Your claimed character" onClose={onClose}>
      <p className="muted">Shown next to your name. Entirely your choice — it may be a bluff, and it looks the same either way.</p>
      <select value={CHARACTER_BY_ID[val] ? val : ''} onChange={e => setVal(e.target.value)} aria-label="Claimed character">
        <option value="">— none —</option>
        {options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <div className="row end">
        <button className="btn ghost" onClick={() => { void act('claim', { claim: '' }); onClose(); }}>Clear</button>
        <button className="btn primary" onClick={() => { void act('claim', { claim: val }); onClose(); }}>Save</button>
      </div>
    </Modal>
  );
}

function RevealDialog({ view, onClose }: { view: GameView; onClose: () => void }) {
  const others = view.players.filter(p => view.self.isStoryteller || p.id !== view.self.id);
  return (
    <Modal title="Show your character" onClose={onClose}>
      <p className="muted">House rule: you may show your character card to one player.</p>
      {others.map(p => <button key={p.id} className="btn small" onClick={() => { void act('reveal', { toId: p.id }); onClose(); }}>{p.name}</button>)}
    </Modal>
  );
}

function CustomiseDialog({ view, onClose }: { view: GameView; onClose: () => void }) {
  const me = view.self.isStoryteller ? { name: view.storyteller.name, avatar: view.storyteller.avatar } : view.players.find(p => p.id === view.self.id);
  const [name, setName] = useState(me?.name ?? '');
  const [avatar, setAvatar] = useState<Avatar>({ ...defaultAvatar(), ...(me?.avatar ?? {}) });
  const save = async () => {
    const r = await act('profile', { name, avatar });
    if (r.ok) {
      try { localStorage.setItem('botc:avatar', JSON.stringify(avatar)); if (!view.self.isStoryteller) localStorage.setItem('botc:name', name); } catch { /* ignore */ }
      onClose();
    }
  };
  return (
    <Modal title="Customise your figure" onClose={onClose} wide>
      <label className="field">Name<input value={name} maxLength={24} onChange={e => setName(e.target.value)} /></label>
      <AvatarCreator value={avatar} onChange={setAvatar} />
      <p className="muted small">Everyone sees your figure in the 3D town and your portrait in the 2D view. It is purely cosmetic.</p>
      <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!name.trim()} onClick={save}>Save</button></div>
    </Modal>
  );
}

function InviteDialog({ view, onClose }: { view: GameView; onClose: () => void }) {
  const link = `${location.origin}/join/${view.code}`;
  return (
    <Modal title="Invite players" onClose={onClose}>
      <p>Invite code: <b className="code">{view.code}</b></p>
      <p><input readOnly value={link} onFocus={e => e.target.select()} aria-label="Invite link" /></p>
      <button className="btn" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
    </Modal>
  );
}

function SidePanel({ view }: { view: GameView }) {
  const [tab, setTab] = useState<'chat' | 'log' | 'notes' | 'votes'>('chat');
  const tabs = (['chat', 'log', 'notes', ...(view.voteHistory ? ['votes'] : [])] as ('chat' | 'log' | 'notes' | 'votes')[]);
  const label = { chat: 'Room chat', log: 'Town crier', notes: 'My notes', votes: 'Vote record' };
  return (
    <div className="side-panel">
      <div className="tabs" role="tablist">
        {tabs.map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{label[t]}</button>)}
      </div>
      {tab === 'votes' && <VoteRecord view={view} />}
      {tab === 'chat' && <Chat view={view} />}
      {tab === 'log' && <Announcements view={view} />}
      {tab === 'notes' && <PersonalNotes view={view} />}
    </div>
  );
}

export function VoteRecord({ view }: { view: GameView }) {
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';
  if (!view.voteHistory?.length) return <p className="muted small">No votes yet.</p>;
  return (
    <ul className="announcements">{[...view.voteHistory].reverse().map((v, i) => (
      <li key={i} className="vote">Day {v.day}: {name(v.nominatorId)} → {name(v.nomineeId)}{v.exile ? ' (exile)' : ''} — {v.votes}/{v.needed}{v.yes.length ? ` · yes: ${v.yes.map(name).join(', ')}` : ''}</li>
    ))}</ul>
  );
}

function TravellerPicker({ view }: { view: GameView }) {
  const taken = new Set(view.players.map(p => p.travellerCharacter).filter(Boolean));
  const options = CHARACTERS.filter(c => c.type === 'traveller' && !taken.has(c.id));
  return (
    <Modal title="Choose your Traveller">
      <p className="muted">You have arrived mid-game. Choose a Traveller: your character is public, and the Storyteller decides your alignment.</p>
      {options.map(c => (
        <div key={c.id} className="claim-option">
          <CharacterToken ch={c} />
          <button className="btn" onClick={() => act('pickTraveller', { characterId: c.id })}>Choose</button>
        </div>
      ))}
    </Modal>
  );
}

export function Announcements({ view }: { view: GameView }) {
  return <ul className="announcements">{[...view.announcements].reverse().map(a => <li key={a.id} className={a.kind}>{a.text}</li>)}</ul>;
}

function PersonalNotes({ view }: { view: GameView }) {
  const key = `botc:notes:${view.id}`;
  const [txt, setTxt] = useState(() => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } });
  return <textarea className="notes" value={txt} placeholder="Your private scribbles (stored only in this browser)…" onChange={e => { setTxt(e.target.value); try { localStorage.setItem(key, e.target.value); } catch { /* ignore */ } }} />;
}

export function Chat({ view }: { view: GameView }) {
  const chat = useStore(s => s.chat);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [chat.length]);
  const send = async () => {
    if (!text.trim()) return;
    const r = await rpc('chat', { text });
    if (r.ok) setText(''); else set({ alerts: [...getStore().alerts, { id: Date.now(), text: r.error ?? 'Not sent', kind: 'error' }] });
  };
  void view;
  return (
    <div className="chat">
      <div className="chat-log">
        {chat.length === 0 && <p className="muted small">Messages are only delivered to people in your current room — like voice. There is no history.</p>}
        {chat.map(m => <div key={m.id} className={`msg ${m.fromId === 'st' ? 'st' : ''}`}><b>{m.name}:</b> {m.text}</div>)}
        <div ref={endRef} />
      </div>
      <form className="row" onSubmit={e => { e.preventDefault(); void send(); }}>
        <input value={text} maxLength={300} onChange={e => setText(e.target.value)} placeholder="Say something to the room…" aria-label="Chat message" />
        <button className="btn small">Send</button>
      </form>
    </div>
  );
}
