// Client side of the voice layer. The client only ever joins the LiveKit room the
// server sends it a token for; the server decides (via the LiveKit API) whether it
// can actually publish/subscribe. Nothing here is trusted for enforcement.
import { Room, RoomEvent, Track, type RemoteTrack, type Participant } from 'livekit-client';
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
}

let state: VoiceState = { connectedRoom: null, location: null, micOn: true, camOn: false, canPublish: false, speaking: [], video: {}, error: null };
const listeners = new Set<() => void>();
const set = (p: Partial<VoiceState>) => { state = { ...state, ...p }; listeners.forEach(l => l()); };
export const useVoice = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);

let room: Room | null = null;
const audioEls = new Map<string, HTMLMediaElement>();

async function applyLocalMedia() {
  if (!room) return;
  const lp = room.localParticipant;
  const allowed = lp.permissions?.canPublish ?? false;
  set({ canPublish: allowed });
  if (!allowed) return;
  try {
    await lp.setMicrophoneEnabled(state.micOn);
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
  set({ connectedRoom: null, location: null, speaking: [], video: {}, canPublish: false });
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
    } else if (track.kind === Track.Kind.Video) {
      set({ video: { ...state.video, [participant.identity]: track.mediaStreamTrack } });
    }
  });
  r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant) => {
    track.detach().forEach(el => el.remove());
    audioEls.delete(track.sid ?? participant.identity);
    if (track.kind === Track.Kind.Video) { const v = { ...state.video }; delete v[participant.identity]; set({ video: v }); }
  });
  r.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => set({ speaking: speakers.map(s => s.identity) }));
  r.on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant) => {
    if (participant === r.localParticipant) void applyLocalMedia();
  });
  r.on(RoomEvent.Disconnected, () => { if (room === r) set({ connectedRoom: null }); });
  try {
    await r.connect(url, token, { autoSubscribe: true });
    if (room !== r) { await r.disconnect(); return; }
    set({ connectedRoom: roomName, location, error: null });
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
