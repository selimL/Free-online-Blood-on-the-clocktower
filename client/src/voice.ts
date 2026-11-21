// Client side of the voice layer. The client only ever joins the LiveKit room the
// server sends it a token for; the server decides (via the LiveKit API) whether it
// can actually publish/subscribe. Nothing here is trusted for enforcement.
import { Room, RoomEvent, Track, type RemoteTrack, type RemoteAudioTrack, type Participant } from 'livekit-client';
import { useSyncExternalStore } from 'react';
import { socket, act } from './net';

interface VoiceState {
  connectedRoom: string | null;
  location: string | null;
  micOn: boolean;
  camOn: boolean;
  canPublish: boolean;
  speaking: string[];
  video: Record<string, MediaStreamTrack>;
  error: string | null;
  /** Push-to-talk: the mic is only live while the talk key/button is held. */
  pushToTalk: boolean;
  talking: boolean;
  /** Master volume for other people's voices (0..1), and per-person volumes by voice identity. */
  voiceVolume: number;
  peerVolume: Record<string, number>;
  /** Who else is in my voice room right now. */
  peers: { identity: string; name: string }[];
  micDevice: string;
}

// voice preferences live in this browser only
const PREFS = 'botc:voicePrefs';
const loadPrefs = (): Partial<VoiceState> => { try { return JSON.parse(localStorage.getItem(PREFS) ?? '{}'); } catch { return {}; } };
const savePrefs = () => {
  try { localStorage.setItem(PREFS, JSON.stringify({ pushToTalk: state.pushToTalk, voiceVolume: state.voiceVolume, peerVolume: state.peerVolume, micDevice: state.micDevice })); } catch { /* ignore */ }
};
const prefs = loadPrefs();

let state: VoiceState = {
  connectedRoom: null, location: null, micOn: true, camOn: false, canPublish: false, speaking: [], video: {}, error: null,
  pushToTalk: !!prefs.pushToTalk, talking: false,
  voiceVolume: typeof prefs.voiceVolume === 'number' ? Math.max(0, Math.min(1, prefs.voiceVolume)) : 1,
  peerVolume: prefs.peerVolume && typeof prefs.peerVolume === 'object' ? prefs.peerVolume : {},
  peers: [], micDevice: typeof prefs.micDevice === 'string' ? prefs.micDevice : '',
};
const listeners = new Set<() => void>();
const set = (p: Partial<VoiceState>) => { state = { ...state, ...p }; listeners.forEach(l => l()); };
export const useVoice = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);

let room: Room | null = null;
const audioEls = new Map<string, HTMLMediaElement>();
const audioTracks = new Map<string, { identity: string; track: RemoteAudioTrack }>();

/** Is my microphone actually live (switched on, and the talk key held in push-to-talk mode)? */
const micLive = () => state.micOn && (!state.pushToTalk || state.talking);
const volumeFor = (identity: string) => state.voiceVolume * (state.peerVolume[identity] ?? 1);
function applyVolumes() { for (const { identity, track } of audioTracks.values()) track.setVolume(volumeFor(identity)); }
function refreshPeers() {
  const r = room;
  set({ peers: r ? [...r.remoteParticipants.values()].map(p => ({ identity: p.identity, name: p.name || p.identity })) : [] });
}

async function applyLocalMedia() {
  if (!room) return;
  const lp = room.localParticipant;
  const allowed = lp.permissions?.canPublish ?? false;
  set({ canPublish: allowed });
  if (!allowed) return;
  try {
    const opts = state.micDevice ? { deviceId: state.micDevice } : undefined;
    // push-to-talk: publish the mic once (muted) so the first press is instant and asks for permission early
    if (state.pushToTalk && state.micOn && !lp.getTrackPublication(Track.Source.Microphone)) {
      await lp.setMicrophoneEnabled(true, opts);
    }
    await lp.setMicrophoneEnabled(micLive(), opts);
    await lp.setCameraEnabled(state.camOn);
    const cam = lp.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
    const video = { ...state.video };
    if (cam && state.camOn) video[lp.identity] = cam; else delete video[lp.identity];
    set({ video, error: null });
  } catch (e) {
    set({ error: 'Microphone/camera permission denied.' });
  }
}

async function leave() {
  const r = room;
  room = null;
  for (const el of audioEls.values()) el.remove();
  audioEls.clear();
  audioTracks.clear();
  set({ connectedRoom: null, location: null, speaking: [], video: {}, canPublish: false, peers: [] });
  if (r) await r.disconnect();
}

async function join(url: string, token: string, roomName: string, location: string) {
  await leave();
  const r = new Room({ adaptiveStream: true, dynacast: true });
  room = r;
  r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant) => {
    if (track.kind === Track.Kind.Audio) {
      const el = track.attach();
      el.style.display = 'none';
      document.body.appendChild(el);
      audioEls.set(track.sid ?? participant.identity, el);
      const audio = track as RemoteAudioTrack;
      audioTracks.set(track.sid ?? participant.identity, { identity: participant.identity, track: audio });
      audio.setVolume(volumeFor(participant.identity));
    } else if (track.kind === Track.Kind.Video) {
      set({ video: { ...state.video, [participant.identity]: track.mediaStreamTrack } });
    }
  });
  r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant) => {
    track.detach().forEach(el => el.remove());
    audioEls.delete(track.sid ?? participant.identity);
    audioTracks.delete(track.sid ?? participant.identity);
    if (track.kind === Track.Kind.Video) { const v = { ...state.video }; delete v[participant.identity]; set({ video: v }); }
  });
  r.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => set({ speaking: speakers.map(s => s.identity) }));
  r.on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant) => {
    if (participant === r.localParticipant) void applyLocalMedia();
  });
  r.on(RoomEvent.ParticipantConnected, refreshPeers);
  r.on(RoomEvent.ParticipantDisconnected, refreshPeers);
  r.on(RoomEvent.Disconnected, () => { if (room === r) set({ connectedRoom: null }); });
  try {
    await r.connect(url, token, { autoSubscribe: true });
    if (room !== r) { await r.disconnect(); return; }
    set({ connectedRoom: roomName, location, error: null });
    refreshPeers();
    socket.emit('voice:connected', { room: roomName }, () => {});
    void applyLocalMedia();
  } catch (e) {
    set({ error: 'Could not connect to voice server.' });
  }
}

socket.on('voice:join', (d: { url: string; token: string; room: string; location: string }) => { void join(d.url, d.token, d.room, d.location); });
socket.on('voice:leave', () => { void leave(); });
socket.on('disconnect', () => { void leave(); });

export function toggleMic() { set({ micOn: !state.micOn }); void applyLocalMedia(); }

export function setPushToTalk(on: boolean) { set({ pushToTalk: on, talking: false }); savePrefs(); void applyLocalMedia(); }
/** Hold to talk (key or button). Ignored in open-mic mode. */
export function setTalking(on: boolean) {
  if (!state.pushToTalk || state.talking === on) return;
  set({ talking: on });
  void applyLocalMedia();
}
export function setVoiceVolume(v: number) { set({ voiceVolume: Math.max(0, Math.min(1, v)) }); savePrefs(); applyVolumes(); }
export function setPeerVolume(identity: string, v: number) {
  set({ peerVolume: { ...state.peerVolume, [identity]: Math.max(0, Math.min(1, v)) } }); savePrefs(); applyVolumes();
}
export async function listMics(): Promise<{ deviceId: string; label: string }[]> {
  try { return (await Room.getLocalDevices('audioinput')).map(d => ({ deviceId: d.deviceId, label: d.label || 'Microphone' })); } catch { return []; }
}
export async function setMicDevice(deviceId: string) {
  set({ micDevice: deviceId }); savePrefs();
  try { await room?.switchActiveDevice('audioinput', deviceId); } catch { /* applied on the next join */ }
}

// push-to-talk keys: hold V, or Space when not typing / on a button
const isTypingTarget = (t: EventTarget | null) => /^(INPUT|TEXTAREA|SELECT)$/.test((t as HTMLElement | null)?.tagName ?? '') || !!(t as HTMLElement | null)?.isContentEditable;
const isPttKey = (e: KeyboardEvent) => e.code === 'KeyV' || (e.code === 'Space' && !/^(BUTTON|A)$/.test((e.target as HTMLElement | null)?.tagName ?? ''));
if (typeof window !== 'undefined') {
  addEventListener('keydown', e => {
    if (!state.pushToTalk || isTypingTarget(e.target) || !isPttKey(e)) return;
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) setTalking(true);
  });
  addEventListener('keyup', e => { if (state.pushToTalk && isPttKey(e)) setTalking(false); });
  addEventListener('blur', () => setTalking(false));
}
export function toggleCam() { set({ camOn: !state.camOn }); void applyLocalMedia(); }

/** Measure RTT to each configured media region and report it (used to pick the closest region). */
export async function probeRegions() {
  try {
    const regions: { name: string; url: string }[] = await (await fetch('/api/regions')).json();
    const rtt: Record<string, number> = {};
    await Promise.all(regions.map(async r => {
      const http = r.url.replace(/^ws/, 'http');
      const samples: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t = performance.now();
        try { await fetch(http, { mode: 'no-cors', cache: 'no-store' }); samples.push(performance.now() - t); } catch { samples.push(5000); }
      }
      rtt[r.name] = Math.min(...samples);
    }));
    if (Object.keys(rtt).length) await act('rtt', { rtt });
  } catch { /* voice disabled */ }
}
