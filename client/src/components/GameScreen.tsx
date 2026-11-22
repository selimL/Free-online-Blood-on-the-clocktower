import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { GameView, Avatar } from '../../../shared/types';
import { defaultAvatar, EMOTES } from '../../../shared/types';
import { AvatarCreator } from './Avatar';
import { CHARACTER_BY_ID, CHARACTERS, CLAIMABLE_ABILITIES, DAY_ABILITIES, ROOM_ART } from '../../../shared/characters';
import { act, useStore, rpc, set, forgetSession, getStore, saveSession } from '../net';
import { setGhosts, useVoice, toggleMic, toggleCam, probeRegions, setPushToTalk, setTalking, setVoiceVolume, setPeerVolume, listMics, setMicDevice } from '../voice';
import { sendEmote } from '../emotes';
import { sunPosition } from '../daylight';
import { recordGame } from '../history';
import { Countdown, downloadIcs, toLocalInput, fromLocalInput } from './Schedule';
import { usePlayerNotes, setPlayerNote, MARKS } from '../playerNotes';
import { TownCircle, TownMap, seatRadiusPct } from './TownSquare';
import { SQUASH, initial3D, save3D, webglAvailable } from '../three/support';
import { setNightAmbience, setHeartbeat, setVolume, useVolume, setMusic, setMusicVolume, useMusicVolume, setRain, ping, useAlertPrefs, setAlertPrefs } from '../sound';

const TownScene = lazy(() => import('../three/TownScene'));
const RoomScene = lazy(() => import('../three/RoomScene'));
import { occupantsOf } from '../three/occupants';
import {
  CharacterModal, CharactersInPlay, Confirm, InfoPopup, QuestionPrompt, TimerBadge, VoteBar,
  TransitionOverlay, NightSleep, Modal, CharacterToken,
} from './Overlays';
import { StorytellerPanel, StorytellerControls } from './Storyteller';
import { Almanac } from './Almanac';
import { PromptForPlayer } from './GroupActions';
import { TranscriptConsent } from './Transcript';
import { useTranscriber, transcriptionSupported } from '../transcriber';
import { pushAlert } from '../net';
import { WhisperThread, useUnread } from './Whispers';

type ConfirmState = { title: string; text: React.ReactNode; confirm: string; onYes: () => void } | null;

const PHASE_LABEL: Record<string, string> = { lobby: 'Gathering', dealt: 'Setting up', questions: 'Questions', night: 'Night', day: 'Day', ended: 'Game over' };
const STAGE_LABEL: Record<string, string> = { discussion: 'Town discussion', private: 'Private conversations', nominations: 'Nominations open', accusation: 'Accusation', defense: 'Defence', voting: 'Voting', closed: 'Nominations closed', speedround: 'Speed round' };

export function GameScreen({ view }: { view: GameView }) {
  const isST = view.self.isStoryteller;
  const me = !view.self.isStoryteller ? view.players.find(p => p.id === view.self.id) ?? null : null;
  const [modal, setModal] = useState<'character' | 'list' | 'claim' | 'label' | 'invite' | 'reveal' | 'rules' | 'customise' | 'story' | 'voice' | 'almanac' | 'alerts' | null>(null);
  const [almanacId, setAlmanacId] = useState<string | null>(null);
  const openAlmanac = (id: string | null = null) => { setAlmanacId(id); setModal('almanac'); };
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
  // asleep: an empty moonlit town with a slowly circling camera (no figures, nothing secret)
  const showSleep3D = use3D && !failed3D && asleep;
  const viewRef = useRef(view);
  viewRef.current = view;
  const sun = useMemo(() => () => sunPosition(viewRef.current), []);
  const sleepStoryteller = useMemo(() => ({ name: '', avatar: view.storyteller.avatar, location: null, pos: null }), [view.storyteller.avatar]);
  const spectating = !view.self.isStoryteller && !!view.self.spectator;
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
  // remember finished games in "My games" (updated as MVP votes come in)
  const mvpKey = JSON.stringify(view.mvp?.votes ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ended) recordGame(view); }, [ended, mvpKey]);
  // atmosphere: wind and crickets at night, a heartbeat while votes are counted
  const voting = view.stage === 'voting' && !!view.nomination && !view.nomination.done;
  useEffect(() => { setNightAmbience(night); }, [night]);
  useEffect(() => { setHeartbeat(voting); }, [voting]);
  // background music follows the moment; rain is heard outdoors (or asleep in bed)
  const mood = voting ? 'vote' : night ? 'night' : 'day';
  useEffect(() => { setMusic(mood); }, [mood]);
  // dead players sound like ghosts
  const deadIds = view.players.filter(p => !p.alive).map(p => p.id).join(',');
  useEffect(() => { setGhosts(deadIds ? deadIds.split(',') : []); }, [deadIds]);
  useEffect(() => () => setGhosts([]), []);
  // personal alerts: nominated, woken, your vote, your turn to speak
  const myId = view.self.isStoryteller ? null : view.self.id;
  const nomKey = view.nomination && !view.nomination.done ? `${view.nomination.nominatorId}>${view.nomination.nomineeId}` : '';
  useEffect(() => { if (myId && view.nomination && !view.nomination.done && view.nomination.nomineeId === myId) ping('nominated'); }, [nomKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const woken = !view.self.isStoryteller && night && view.self.awake;
  useEffect(() => { if (woken) ping('woken'); }, [woken]);
  const myVoteNow = !!myId && view.stage === 'voting' && !!view.nomination && !view.nomination.done && view.nomination.order[view.nomination.voteIndex] === myId;
  useEffect(() => { if (myVoteNow) ping('yourVote'); }, [myVoteNow]);
  const mySpotlight = !!myId && view.speakerId === myId;
  useEffect(() => { if (mySpotlight) ping('spotlight'); }, [mySpotlight]);
  // voice transcript: only with consent, the house rule on, and a live microphone
  const vstate = useVoice();
  const transcribing = !isST && !spectating && !view.self.isStoryteller && !!view.self.transcriptActive && view.self.transcriptConsent === true
    && !!vstate.connectedRoom && vstate.canPublish && vstate.micOn && (!vstate.pushToTalk || vstate.talking);
  useTranscriber(transcribing, () => pushAlert('Speech-to-text was blocked by the browser, so nothing is being transcribed.', 'error'));
  const outdoors = asleep || night || myLoc === 'square' || spectating;
  useEffect(() => { setRain(!outdoors ? 0 : view.weather === 'storm' ? 2 : view.weather === 'rain' ? 1 : 0); }, [view.weather, outdoors]);
  useEffect(() => () => { setNightAmbience(false); setHeartbeat(false); setMusic('off'); setRain(0); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.toLowerCase() === 'p' && !isST) setModal(m => (m === 'character' ? null : 'character'));
      // number keys 1-9 and 0: gestures
      const n = /^Digit(\d)$/.exec(e.code);
      if (n && canGestureRef.current && !e.ctrlKey && !e.metaKey && !e.altKey) { const i = (Number(n[1]) + 9) % 10; if (EMOTES[i]) sendEmote(EMOTES[i].id); }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [isST]);

  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';
  const canGesture = !spectating && !night && view.phase !== 'ended' && !!myLoc;
  const canGestureRef = useRef(canGesture);
  canGestureRef.current = canGesture;

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
      <TopBar view={view} openAlerts={() => setModal('alerts')} openAlmanac={() => openAlmanac()} openVoice={() => setModal('voice')} openList={() => setModal('list')} openInvite={() => setModal('invite')} openRules={() => setModal('rules')} openCustomise={() => setModal('customise')} openStory={() => setModal('story')} use3D={use3D && !failed3D} toggle3D={toggle3D} />
      <main className="layout">
        <aside className="left"><TownMap view={view} /></aside>
        <section ref={stageRef} onMouseMove={onStageMove} className={`stage ${art ? 'has-room-art' : ''} ${show3D || showSleep3D ? 'has-3d' : ''} ${showSleep3D ? 'sleep-3d' : ''}`} style={art ? { ['--room-art' as string]: `url(/art/${art}.jpg)` } : undefined}>
          {art && !show3DRoom && <><div className="room-art-layer" aria-hidden="true" /><div className="room-art-light" aria-hidden="true" /></>}
          {show3DRoom && art && (
            <Suspense fallback={null}>
              <RoomScene art={art} occupants={roomOccupants} myId={view.self.isStoryteller ? 'st' : view.self.id} canWalk={!night && !spectating}
                reducedMotion={reducedMotion} onFigureClick={onSeatClick} onFail={() => setFailed3D(true)} />
            </Suspense>
          )}
          {show3D && (
            <Suspense fallback={null}>
              <TownScene key="town" anchor={circleRef} container={stageRef} seatRadiusFrac={seatRadiusPct(view.players.length) / 100}
                night={night} rooms={view.rooms} players={view.players} storyteller={view.storyteller} awakeIds={awakeIds}
                reducedMotion={reducedMotion} onFail={() => setFailed3D(true)}
                myId={view.self.isStoryteller ? 'st' : view.self.id} canWalk={walkMode} onFigureClick={onSeatClick}
                onEnterRoom={room => { void act('move', { room }); }} arrivedFrom={arrivedFromRef.current}
                nomination={view.nomination} voting={view.stage === 'voting'} sun={sun} weather={view.weather} />
            </Suspense>
          )}
          {showSleep3D && (
            <Suspense fallback={null}>
              <TownScene key="sleep" sleepView anchor={circleRef} container={stageRef} seatRadiusFrac={0.4}
                night rooms={[]} players={[]} storyteller={sleepStoryteller} awakeIds={[]}
                reducedMotion={reducedMotion} onFail={() => setFailed3D(true)} myId="" canWalk={false}
                onFigureClick={() => {}} onEnterRoom={() => {}} arrivedFrom={null} nomination={null} voting={false} sun={sun} weather={view.weather} />
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
          {!view.self.isStoryteller && view.self.tutorial && <TutorialTip tip={view.self.tutorial} />}
          {isST ? <StorytellerPanel view={view} /> : <SidePanel view={view} />}
        </aside>
      </main>
      <footer className="bottom-bar">
        <div className="bl">
          {spectating && <SpectatorBar view={view} />}
          {!isST && !spectating && view.phase !== 'lobby' && <>
            <button className="btn" onClick={() => setModal('claim')} disabled={view.phase !== 'day'}>🎭 Claim Ability</button>
            <button className="btn ghost" onClick={() => setModal('label')}>🏷 Set claimed character</button>
            {view.houseRules.allowCharacterReveal && <button className="btn ghost" onClick={() => setModal('reveal')}>🂠 Show character</button>}
          </>}
          {!isST && !spectating && view.phase === 'lobby' && <button className="btn ghost" onClick={() => setModal('label')}>🏷 Set claimed character</button>}
        </div>
        <div className="bc">
          {view.voice.enabled && <PushToTalkButton />}
          {canGesture && <GestureMenu />}
          {isST && <StorytellerControls view={view} />}
        </div>
        <div className="br">
          {!isST && !spectating && <>
            <button className="btn" onClick={() => setModal('character')} title="Shortcut: P">📜 Character <kbd>P</kbd></button>
            <UseAbilityButton view={view} setConfirm={setConfirm} />
          </>}
        </div>
      </footer>

      {modal === 'character' && <CharacterModal view={view} onClose={() => setModal(null)} />}
      {modal === 'list' && <CharactersInPlay view={view} onClose={() => setModal(null)} onPick={openAlmanac} />}
      {modal === 'almanac' && <Almanac onClose={() => setModal(null)} initial={almanacId} inPlay={view.characterList ? [...view.characterList.characters, ...view.characterList.fabled] : undefined} />}
      {modal === 'claim' && <ClaimAbilityDialog view={view} onClose={() => setModal(null)} setConfirm={setConfirm} />}
      {modal === 'label' && <ClaimLabelDialog view={view} onClose={() => setModal(null)} />}
      {modal === 'invite' && <InviteDialog view={view} onClose={() => setModal(null)} />}
      {modal === 'reveal' && <RevealDialog view={view} onClose={() => setModal(null)} />}
      {modal === 'customise' && <CustomiseDialog view={view} onClose={() => setModal(null)} />}
      {modal === 'story' && view.story && <StoryDialog view={view} onClose={() => setModal(null)} />}
      {modal === 'voice' && <VoiceSettings view={view} onClose={() => setModal(null)} />}
      {modal === 'alerts' && <Modal title="🔔 Personal alerts" onClose={() => setModal(null)}><AlertSettings /></Modal>}
      {modal === 'rules' && <Modal title="Table rules" onClose={() => setModal(null)}><ul>{view.tableRules.map(r => <li key={r}>{r}</li>)}</ul></Modal>}
      {!isST && me?.traveller && !view.self.isStoryteller && !view.self.characterId && view.phase !== 'lobby' && <TravellerPicker view={view} />}
      {confirm && <Confirm {...confirm} onYes={() => { confirm.onYes(); setConfirm(null); }} onNo={() => setConfirm(null)} />}
      <QuestionPrompt view={view} />
      <PromptForPlayer view={view} />
      <DawnRecap view={view} />
      <TranscriptConsent view={view} />
      <InfoPopup view={view} />
      <TransitionOverlay />
      {view.paused && <div className="paused-banner">⏸ The game is paused{!view.storyteller.connected ? ' — waiting for the Storyteller to reconnect' : ''}.</div>}
    </div>
  );
}

function TopBar({ view, openAlerts, openAlmanac, openVoice, openList, openInvite, openRules, openCustomise, openStory, use3D, toggle3D }: { view: GameView; openAlerts: () => void; openAlmanac: () => void; openVoice: () => void; openList: () => void; openInvite: () => void; openRules: () => void; openCustomise: () => void; openStory: () => void; use3D: boolean; toggle3D: () => void }) {
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
        {view.coStorytellers.length > 0 && <span className="muted small" title="Co-Storytellers">🎩 with {view.coStorytellers.map(c => c.name).join(', ')}</span>}
        <button className="btn small ghost" onClick={openInvite} title="Invite players">Code <b>{view.code}</b></button>
      </div>
      <div className="tc">
        {view.phase === 'lobby' && view.scheduledFor && <Countdown at={view.scheduledFor} />}
        <span className="phase">{PHASE_LABEL[view.phase]}{view.phase === 'day' ? ` ${view.day}` : view.phase === 'night' ? ` ${view.night}` : ''}{view.stage ? ` · ${STAGE_LABEL[view.stage]}` : ''}</span>
        <TimerBadge view={view} />
      </div>
      <div className="tr">
        {view.voice.enabled ? <>
          <button className={`icon-btn ${voice.micOn ? 'on' : 'off'} ${voice.pushToTalk && voice.talking ? 'talking' : ''}`} onClick={toggleMic} aria-pressed={voice.micOn} title={voice.pushToTalk ? 'Microphone (push-to-talk: hold V or Space to speak)' : 'Microphone'}>{voice.micOn ? '🎙' : '🔇'}</button>
          <button className={`icon-btn ${voice.camOn ? 'on' : 'off'}`} onClick={toggleCam} aria-pressed={voice.camOn} title="Camera (optional)">{voice.camOn ? '📷' : '🚫'}</button>
          <span className={`voice-status ${voice.connectedRoom ? (voice.canPublish ? 'live' : 'waiting') : 'none'}`} title={voice.error ?? ''}>
            {voice.connectedRoom ? (voice.canPublish ? (voice.pushToTalk ? (voice.talking ? 'talking' : 'push-to-talk') : 'voice live') : 'connecting…') : 'no voice'}
          </span>
          <button className="icon-btn" onClick={openVoice} title="Voice settings: push-to-talk, volumes, microphone" aria-label="Voice settings">⚙</button>
        </> : <span className="voice-status none" title="Voice server not configured; text chat only">text only</span>}
        {webglAvailable() && <button className="btn small ghost" onClick={toggle3D} aria-pressed={use3D} title="Switch between the 3D town and the flat 2D view">{use3D ? '🗺 2D view' : '🏰 3D view'}</button>}
        {view.story && <button className="btn small primary" onClick={openStory}>📜 Game story</button>}
        {!view.self.isStoryteller && view.self.transcriptActive && view.self.transcriptConsent && <span className="voice-status transcribed" title={transcriptionSupported() ? 'Your speech is checked for secret words; only detections are kept, for the Storyteller. Change this in ⚙ Voice settings.' : 'You agreed, but this browser cannot turn speech into text: nothing is checked.'}>🗣 {transcriptionSupported() ? 'listening for words' : 'not supported'}</span>}
        {view.spectators.length > 0 && <span className="watchers" title={view.spectators.map(s => s.name).join(', ')}>👁 {view.spectators.length} watching</span>}
        <VolumeControl />
        <button className="icon-btn" onClick={openAlerts} title="Personal alerts: chime, vibration, notifications" aria-label="Personal alerts">🔔</button>
        {(view.self.isStoryteller || !view.self.spectator) && <button className="btn small ghost" onClick={openCustomise} title="Change your name and figure">👤 Customise</button>}
        <button className="btn small ghost" onClick={openRules}>⚖ Table rules</button>
        <button className="btn small ghost" onClick={openAlmanac} title="Every character's ability, with tips">📚 Almanac</button>
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
  const [tab, setTab] = useState<'timeline' | 'replay' | 'votes' | 'grimoire'>('timeline');
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
      {view.mvp && !(!view.self.isStoryteller && view.self.spectator) && <MvpVote view={view} />}
      <div className="tabs" role="tablist">
        {(['timeline', 'replay', 'votes', 'grimoire'] as const).filter(t => t !== 'replay' || story.timeline?.length).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t === 'timeline' ? 'Timeline' : t === 'replay' ? '▶ Replay' : t === 'votes' ? `Votes (${story.votes.length})` : 'Grimoire'}</button>)}
      </div>
      {tab === 'timeline' && <div className="story-timeline">{groups.map((g, i) => (
        <section key={i}><h3>{g.when || 'Setup'}</h3><ul>{g.lines.map((l, j) => <li key={j} className={/BLUFF|died|executed|exiled|Demon/i.test(l) ? 'key' : ''}>{l}</li>)}</ul></section>
      ))}</div>}
      {tab === 'replay' && <Replay view={view} />}
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

/** Morning summary at dawn (shown once per day; the Town crier tab keeps the details). */
function DawnRecap({ view }: { view: GameView }) {
  const r = view.dawnRecap;
  const key = r ? `botc:recap:${view.id}:${r.day}` : '';
  const [closed, setClosed] = useState<string | null>(null);
  const seen = (() => { try { return !!key && localStorage.getItem(key) === '1'; } catch { return false; } })();
  if (!r || closed === key || seen || view.stage !== 'discussion') return null;
  const close = () => { try { localStorage.setItem(key, '1'); } catch { /* ignore */ } setClosed(key); };
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? '?';
  const alive = view.players.filter(p => p.alive && !p.traveller).length;
  const residents = view.players.filter(p => !p.traveller).length;
  return (
    <div className="dawn-recap parchment" role="dialog" aria-label={`Day ${r.day}`}>
      <h2>☀ Day {r.day}</h2>
      <ul>
        <li>{r.died.length ? <>🌙 During the night <b>{r.died.map(name).join(', ')}</b> {r.died.length > 1 ? 'died' : 'died'}.</> : <>🌙 Nobody died in the night.</>}</li>
        {r.day > 1 && <li>{r.executed ? <>⚖ Yesterday <b>{name(r.executed)}</b> was executed.</> : <>⚖ Nobody was executed yesterday.</>}</li>}
        {r.exiled.length > 0 && <li>🚪 Exiled yesterday: <b>{r.exiled.map(name).join(', ')}</b>.</li>}
        <li>❤ {alive} of {residents} players are alive · {Math.ceil(view.players.filter(p => p.alive).length / 2)} votes are needed to put someone on the block.</li>
      </ul>
      <div className="row end"><button className="btn primary small" onClick={close}>To the Town Square</button></div>
    </div>
  );
}

function MvpVote({ view }: { view: GameView }) {
  const mvp = view.mvp!;
  const isST = view.self.isStoryteller;
  const top = Math.max(0, ...Object.values(mvp.votes));
  return (
    <div className="mvp">
      <b>🏆 Most valuable player:</b> <span className="muted small">vote for who played best (you can change your vote)</span>
      <div className="chips">
        {view.players.filter(p => isST || p.id !== view.self.id).map(p => {
          const n = mvp.votes[p.id] ?? 0;
          return <button key={p.id} className={`chip ${mvp.mine === p.id ? 'active' : ''} ${n && n === top ? 'lead' : ''}`}
            onClick={() => act(isST ? 'st:mvp' : 'mvp', { candidateId: p.id })}>{n && n === top ? '🏆 ' : ''}{p.name}{n ? ` · ${n}` : ''}</button>;
        })}
      </div>
    </div>
  );
}

/** Step through the finished game on the town circle: who was alive, who was involved, what happened. */
function Replay({ view }: { view: GameView }) {
  // skip the lobby (players joining), where not everyone is seated yet
  const tl = view.story!.timeline.filter(e => !(e.when === 'Setup' && / joined/.test(e.text)));
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setI(x => { if (x >= tl.length - 1) { setPlaying(false); return x; } return x + 1; }), 1300);
    return () => clearInterval(t);
  }, [playing, tl.length]);
  const step = tl[Math.min(i, tl.length - 1)];
  const grim = Object.fromEntries(view.story!.grimoire.map(g => [g.id, g]));
  const n = view.players.length;
  const involved = new Set(view.players.filter(p => step.text.includes(p.name)).map(p => p.id));
  const secret = /BLUFF|Info to|chose|poison|Drunk|Demon bluffs|Grimoire/i.test(step.text);
  return (
    <div className="replay">
      <div className="replay-circle">
        {view.players.map((p, k) => {
          const a = (k / n) * Math.PI * 2 - Math.PI / 2;
          const g = grim[p.id];
          return (
            <div key={p.id} className={`rp-seat ${step.alive.includes(p.id) ? '' : 'dead'} ${involved.has(p.id) ? 'hot' : ''} ${g?.alignment ?? ''}`} style={{ left: `${50 + Math.cos(a) * 40}%`, top: `${50 + Math.sin(a) * 40}%` }}>
              <span className="rp-dot">{step.alive.includes(p.id) ? '' : '👻'}</span>
              <span className="rp-name">{p.name}</span>
              <span className="rp-char">{CHARACTER_BY_ID[g?.characterId ?? '']?.name ?? ''}</span>
            </div>
          );
        })}
        <div className="rp-center"><b>{step.when}</b><span>{i + 1} / {tl.length}</span></div>
      </div>
      <p className={`rp-text ${secret ? 'secret' : ''}`}>{secret ? '🔒 ' : ''}{step.text}</p>
      <div className="rp-controls">
        <button className="btn small ghost" onClick={() => { setPlaying(false); setI(0); }}>⏮</button>
        <button className="btn small" onClick={() => { setPlaying(false); setI(x => Math.max(0, x - 1)); }}>◀ Back</button>
        <button className="btn small primary" onClick={() => setPlaying(p => !p)}>{playing ? '⏸ Pause' : '▶ Play'}</button>
        <button className="btn small" onClick={() => { setPlaying(false); setI(x => Math.min(tl.length - 1, x + 1)); }}>Next ▶</button>
        <button className="btn small ghost" onClick={() => { setPlaying(false); setI(tl.length - 1); }}>⏭</button>
      </div>
      <input type="range" min={0} max={tl.length - 1} value={i} onChange={e => { setPlaying(false); setI(Number(e.target.value)); }} aria-label="Replay position" style={{ width: '100%' }} />
      <p className="muted small">🔒 marks things that were secret during the game. Names in gold were involved in that moment.</p>
    </div>
  );
}

function SpectatorBar({ view }: { view: GameView }) {
  const seats = view.players.length;
  const canSit = view.phase === 'lobby' ? seats < 10 : view.phase !== 'ended' && view.houseRules.allowTravellers && seats < 10;
  const takeSeat = async () => {
    let name = '', avatar: unknown;
    try { name = localStorage.getItem('botc:name') ?? ''; avatar = JSON.parse(localStorage.getItem('botc:avatar') ?? 'null'); } catch { /* ignore */ }
    const me = view.spectators.find(s => s.id === view.self.id);
    const needs = view.phase !== 'lobby' && !!view.self.transcriptRequired;
    if (needs && !confirm('This game listens for secret words: while your microphone is live, your speech is turned into English text and checked only for those words (only detections are kept, for the Storyteller). You can\'t change this after joining.\n\nDo you agree?')) return;
    const r = await act('takeSeat', { name: name || me?.name, avatar: avatar ?? undefined, listeningConsent: needs });
    if (r.ok) { const s = { gameId: r.gameId, code: r.code, token: r.token, id: r.id }; saveSession(s); set({ session: s }); }
  };
  return (
    <span className="spectator-bar">
      👁 <b>You are watching.</b> <span className="muted small">Public information only · you can listen to the Town Square</span>
      {canSit && <button className="btn small primary" onClick={takeSeat}>{view.phase === 'lobby' ? 'Take a seat' : 'Join as a Traveller'}</button>}
    </span>
  );
}

function AlertSettings() {
  const a = useAlertPrefs();
  const askNotify = async (on: boolean) => {
    if (on && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const r = await Notification.requestPermission();
      if (r !== 'granted') return setAlertPrefs({ notify: false });
    }
    setAlertPrefs({ notify: on });
  };
  return (
    <fieldset className="voice-mode">
      <legend>🔔 Personal alerts</legend>
      <p className="muted small">When you are nominated, woken at night, whispered to, when the vote reaches you, or it is your turn to speak.</p>
      <label><input type="checkbox" checked={a.sound} onChange={e => setAlertPrefs({ sound: e.target.checked })} /> Play a chime</label>
      <label><input type="checkbox" checked={a.vibrate} onChange={e => setAlertPrefs({ vibrate: e.target.checked })} /> Vibrate (phones)</label>
      {typeof Notification !== 'undefined' && <label><input type="checkbox" checked={a.notify} onChange={e => void askNotify(e.target.checked)} /> Show a notification when this tab is in the background</label>}
      <button type="button" className="btn small ghost" onClick={() => ping('nominated')}>Test the alert</button>
    </fieldset>
  );
}

function PushToTalkButton() {
  const voice = useVoice();
  if (!voice.pushToTalk) return null;
  const up = () => setTalking(false);
  return (
    <button className={`btn ptt ${voice.talking ? 'primary talking' : ''}`} disabled={!voice.micOn}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setTalking(true); }}
      onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onContextMenu={e => e.preventDefault()}
      title="Hold to talk (or hold V / Space)">{voice.talking ? '🎙 Talking…' : '🎙 Hold to talk'}</button>
  );
}

function GestureMenu() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const t = setTimeout(() => addEventListener('click', close), 0);
    return () => { clearTimeout(t); removeEventListener('click', close); };
  }, [open]);
  return (
    <span className="gesture-menu">
      <button className="btn" onClick={() => setOpen(o => !o)} aria-expanded={open} title="Gestures (keys 1–9 and 0)">😀 Gesture</button>
      {open && (
        <div className="gesture-pop parchment" role="menu">
          {EMOTES.map((e, i) => (
            <button key={e.id} role="menuitem" className="gesture" onClick={() => { sendEmote(e.id); setOpen(false); }} title={`${e.label} (key ${(i + 1) % 10})`}>
              <span className="gi">{e.icon}</span><span className="gl">{e.label}</span><kbd>{(i + 1) % 10}</kbd>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function VoiceSettings({ view, onClose }: { view: GameView; onClose: () => void }) {
  const voice = useVoice();
  const [mics, setMics] = useState<{ deviceId: string; label: string }[]>([]);
  useEffect(() => { void listMics().then(setMics); }, []);
  const nameOf = (identity: string, fallback: string) => identity === 'st' ? `${view.storyteller.name} (Storyteller)` : view.players.find(p => p.id === identity)?.name ?? fallback;
  const peers = voice.peers.filter(p => !p.identity.startsWith('spec:'));
  return (
    <Modal title="Voice settings" onClose={onClose}>
      <fieldset className="voice-mode">
        <legend>How your microphone works</legend>
        <label><input type="radio" name="vmode" checked={!voice.pushToTalk} onChange={() => setPushToTalk(false)} /> <b>Open mic</b> — everyone in your room hears you whenever your mic is on</label>
        <label><input type="radio" name="vmode" checked={voice.pushToTalk} onChange={() => setPushToTalk(true)} /> <b>Push-to-talk</b> — you are only heard while you hold <kbd>V</kbd> or <kbd>Space</kbd>, or the 🎙 Hold to talk button</label>
      </fieldset>
      {mics.length > 1 && (
        <label className="field">Microphone
          <select value={voice.micDevice} onChange={e => void setMicDevice(e.target.value)}>
            <option value="">System default</option>
            {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label}</option>)}
          </select>
        </label>
      )}
      <label className="field">Voices volume (everyone)
        <span className="row"><input type="range" min={0} max={100} value={Math.round(voice.voiceVolume * 100)} onChange={e => setVoiceVolume(Number(e.target.value) / 100)} aria-label="Voices volume" /> <span className="muted small">{Math.round(voice.voiceVolume * 100)}%</span></span>
      </label>
      <h3>People you can hear now</h3>
      {peers.length === 0 && <p className="muted small">{voice.connectedRoom ? 'Nobody else is in your room right now.' : 'You are not connected to voice right now.'}</p>}
      <ul className="peer-volumes">
        {peers.map(p => {
          const v = voice.peerVolume[p.identity] ?? 1;
          return (
            <li key={p.identity}>
              <span className={`peer-name ${voice.speaking.includes(p.identity) ? 'speaking' : ''}`}>{nameOf(p.identity, p.name)}</span>
              <input type="range" min={0} max={100} value={Math.round(v * 100)} onChange={e => setPeerVolume(p.identity, Number(e.target.value) / 100)} aria-label={`Volume for ${nameOf(p.identity, p.name)}`} />
              <button className="icon-btn" onClick={() => setPeerVolume(p.identity, v ? 0 : 1)} aria-label={v ? 'Silence for me' : 'Unsilence'} title={v ? 'Silence for me only' : 'Hear again'}>{v ? '🔊' : '🔇'}</button>
            </li>
          );
        })}
      </ul>
      {!view.self.isStoryteller && (view.self.transcriptActive || view.self.transcriptRequired) && !view.self.spectator && <>
        <label className="toggle"><input type="checkbox" checked={!!view.self.transcriptConsent} disabled={!!view.self.consentLocked} onChange={e => act('transcriptConsent', { allow: e.target.checked })} />
          🗣 Listening for secret words (only detections are kept, Storyteller only).{view.self.consentLocked ? ' Locked: it can\'t be changed after the game has started.' : ''}</label>
      </>}
      <AlertSettings />
      <p className="muted small">These settings only change what <i>you</i> hear and are saved in this browser. Nobody else is told.</p>
    </Modal>
  );
}

function VolumeControl() {
  const volume = useVolume();
  const music = useMusicVolume();
  const [last, setLast] = useState(0.6);
  return (
    <>
    <span className="volume" title="Music volume">
      <button className="icon-btn" aria-label={music ? 'Turn music off' : 'Turn music on'} onClick={() => setMusicVolume(music ? 0 : 0.35)}>{music ? '🎵' : '🔇'}</button>
      <input type="range" min={0} max={100} value={Math.round(music * 100)} aria-label="Music volume" onChange={e => setMusicVolume(Number(e.target.value) / 100)} />
    </span>
    <span className="volume" title="Sound effects volume (bells, night ambience, heartbeat)">
      <button className="icon-btn" aria-label={volume ? 'Mute sound effects' : 'Unmute sound effects'}
        onClick={() => { if (volume) { setLast(volume); setVolume(0); } else setVolume(last || 0.6); }}>{volume === 0 ? '🔈' : volume < 0.5 ? '🔉' : '🔊'}</button>
      <input type="range" min={0} max={100} value={Math.round(volume * 100)} aria-label="Sound effects volume" onChange={e => setVolume(Number(e.target.value) / 100)} />
    </span>
    </>
  );
}

function StageHeader({ view }: { view: GameView }) {
  const isST = view.self.isStoryteller;
  const watching = !view.self.isStoryteller && !!view.self.spectator;
  const loc = isST ? view.storyteller.location : watching ? 'square' : view.players.find(p => p.id === view.self.id)?.location;
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

function TutorialTip({ tip }: { tip: { title: string; text: string; next: string | null; done: boolean } }) {
  const [hidden, setHidden] = useState(false);
  const quit = async () => {
    if (!tip.done && !confirm('End the practice game? You can start a new one from the lobby at any time.')) return;
    const code = getStore().session?.code;
    await act('tutorial:quit');
    if (code) forgetSession(code);
    set({ session: null, view: null });
    history.pushState(null, '', '/');
    dispatchEvent(new PopStateEvent('popstate'));
  };
  useEffect(() => setHidden(false), [tip.title, tip.text]);
  if (hidden) return <button className="btn small tutorial-reopen" onClick={() => setHidden(false)}>🎓 Show the Guide</button>;
  return (
    <div className="tutorial-tip parchment" role="status" aria-live="polite">
      <div className="tt-head"><b>🎓 {tip.title}</b><button className="icon-btn" aria-label="Hide the Guide" onClick={() => setHidden(true)}>✕</button></div>
      <p>{tip.text}</p>
      <div className="row end">
        {!tip.done && <button className="btn ghost small" onClick={quit} title="Leave now; the practice game is deleted">End practice</button>}
        {tip.done && <button className="btn small" onClick={quit}>Back to the lobby</button>}
        {!tip.done && !tip.next && <button className="btn small" onClick={() => act('tutorial:skip')} title="Do this step for me">Skip ahead ⏭</button>}
        {tip.next && <button className="btn primary small" onClick={() => act('tutorial:next')}>{tip.next}</button>}
      </div>
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
  const options = CHARACTERS.filter(c => c.type !== 'fabled' && c.type !== 'loric');
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
  const [when, setWhen] = useState(toLocalInput(view.scheduledFor));
  const canSchedule = view.self.isStoryteller && view.phase === 'lobby';
  return (
    <Modal title="Invite players" onClose={onClose}>
      {view.scheduledFor && <p><Countdown at={view.scheduledFor} /> <button className="btn small ghost" onClick={() => downloadIcs(view.name, view.scheduledFor!, link)}>📅 Add to calendar</button></p>}
      {canSchedule && (
        <form className="row" onSubmit={e => { e.preventDefault(); void act('st:schedule', { scheduledFor: fromLocalInput(when) }); }}>
          <label className="field">Start time (optional)<input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></label>
          <button className="btn small">Save time</button>
          {view.scheduledFor && <button type="button" className="btn small ghost" onClick={() => { setWhen(''); void act('st:schedule', { scheduledFor: null }); }}>Clear</button>}
        </form>
      )}
      <p>Invite code: <b className="code">{view.code}</b></p>
      <p><input readOnly value={link} onFocus={e => e.target.select()} aria-label="Invite link" /></p>
      <button className="btn" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
    </Modal>
  );
}

function SidePanel({ view }: { view: GameView }) {
  const [tab, setTab] = useState<'chat' | 'log' | 'notes' | 'votes' | 'st'>('chat');
  const canWhisper = !view.self.isStoryteller && !view.self.spectator && !view.self.tutorial;
  const unread = useUnread();
  const myUnread = !view.self.isStoryteller ? unread[view.self.id] ?? 0 : 0;
  const tabs = (['chat', ...(canWhisper ? ['st'] : []), 'log', 'notes', ...(view.voteHistory ? ['votes'] : [])] as ('chat' | 'log' | 'notes' | 'votes' | 'st')[]);
  const label = { chat: 'Room chat', log: 'Town crier', notes: 'My notes', votes: 'Vote record', st: `✉ Storyteller${myUnread ? ` (${myUnread})` : ''}` };
  return (
    <div className="side-panel">
      <div className="tabs" role="tablist">
        {tabs.map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{label[t]}</button>)}
      </div>
      {tab === 'votes' && <VoteRecord view={view} />}
      {tab === 'st' && canWhisper && <WhisperThread view={view} playerId={view.self.id} />}
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
  const pnotes = usePlayerNotes(view.id);
  return (
    <div className="notes-tab">
      <ul className="pnote-list">
        {view.players.filter(p => view.self.isStoryteller || p.id !== view.self.id).map(p => {
          const n = pnotes[p.id];
          return (
            <li key={p.id}>
              <span className="pn-name">{p.alive ? '' : '👻 '}{p.name}</span>
              <span className="pn-marks">{MARKS.map(m => <button key={m.id} className={`icon-btn ${n?.mark === m.id ? 'on' : ''}`} title={m.label} aria-pressed={n?.mark === m.id} onClick={() => setPlayerNote(view.id, p.id, { mark: n?.mark === m.id ? '' : m.id })}>{m.icon}</button>)}</span>
              <input value={n?.text ?? ''} maxLength={80} placeholder="note…" aria-label={`Note on ${p.name}`} onChange={e => setPlayerNote(view.id, p.id, { text: e.target.value })} />
            </li>
          );
        })}
      </ul>
      <textarea className="notes" value={txt} placeholder="Your private scribbles (stored only in this browser)…" onChange={e => { setTxt(e.target.value); try { localStorage.setItem(key, e.target.value); } catch { /* ignore */ } }} />
      <p className="muted small">Tip: right-click a player's seat (or press and hold on a phone) to note them from the circle.</p>
    </div>
  );
}

export function Chat({ view }: { view: GameView }) {
  const spectator = !view.self.isStoryteller && !!view.self.spectator;
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
        <input value={text} maxLength={300} onChange={e => setText(e.target.value)} placeholder={spectator ? 'Spectators can read the Town Square but not type' : 'Say something to the room…'} disabled={spectator} aria-label="Chat message" />
        <button className="btn small">Send</button>
      </form>
    </div>
  );
}
