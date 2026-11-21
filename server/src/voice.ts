// Server-enforced audio routing over LiveKit.
//
// Every in-game location maps to its own LiveKit room ("<gameId>__<location>").
// Tokens are minted ONLY here and ALWAYS grant canPublish=false/canSubscribe=false,
// with a short TTL. Real permissions are raised afterwards through the LiveKit
// server API once the game engine says the player may hear/speak (join delay over,
// not muted, not night…). A modified client therefore cannot hear or be heard
// anywhere the server has not explicitly allowed.
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import type { Game } from './game';

export interface Region { name: string; url: string; apiKey: string; apiSecret: string }

export function loadRegions(env = process.env): Region[] {
  if (env.LIVEKIT_REGIONS) {
    try {
      const list = JSON.parse(env.LIVEKIT_REGIONS) as Region[];
      return list.filter(r => r.name && r.url && r.apiKey && r.apiSecret);
    } catch (e) { console.error('Invalid LIVEKIT_REGIONS JSON', e); return []; }
  }
  if (env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET) {
    return [{ name: env.LIVEKIT_REGION_NAME ?? 'default', url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET }];
  }
  return [];
}

const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws(s?):\/\//, 'http$1://');

interface Seat { room: string | null; connected: boolean; applied: string }

/** Minimal surface of RoomServiceClient so tests can mock it. */
export interface RoomApi {
  updateParticipant(room: string, identity: string, opts: { permission: Record<string, unknown> }): Promise<unknown>;
  removeParticipant(room: string, identity: string): Promise<unknown>;
}

export class VoiceManager {
  private seats = new Map<string, Seat>();
  private apis = new Map<string, RoomApi>();

  constructor(
    readonly regions: Region[],
    private send: (gameId: string, id: string, event: string, payload: unknown) => void,
    apiFactory: (r: Region) => RoomApi = r => {
      const c = new RoomServiceClient(httpUrl(r.url), r.apiKey, r.apiSecret);
      return { updateParticipant: (room, id, o) => c.updateParticipant(room, id, o as never), removeParticipant: (room, id) => c.removeParticipant(room, id) };
    },
  ) {
    for (const r of regions) this.apis.set(r.name, apiFactory(r));
  }

  get enabled() { return this.regions.length > 0; }
  regionFor(g: Game): Region | undefined {
    return this.regions.find(r => r.name === g.region) ?? this.regions[0];
  }
  roomName(g: Game, location: string) { return `${g.id}__${location.replace(/[^a-zA-Z0-9:_-]/g, '')}`; }
  private key(g: Game, id: string) { return `${g.id}/${id}`; }

  /** Forget a seat's media state so the next reconcile re-issues a token (e.g. after socket reconnect). */
  resync(g: Game, id: string) { this.seats.delete(this.key(g, id)); }
  dropGame(g: Game) { for (const k of [...this.seats.keys()]) if (k.startsWith(`${g.id}/`)) this.seats.delete(k); }

  markConnected(g: Game, id: string, room: string) {
    const s = this.seats.get(this.key(g, id));
    if (s && s.room === room) { s.connected = true; s.applied = ''; }
    void this.reconcile(g);
  }

  async reconcile(g: Game) {
    if (!this.enabled) return;
    const region = this.regionFor(g)!;
    const api = this.apis.get(region.name)!;
    const ids = ['st', ...g.players.map(p => p.id), ...g.spectators.map(s => s.id)];
    await Promise.all(ids.map(async id => {
      const target = g.voiceTarget(id);
      const k = this.key(g, id);
      const seat = this.seats.get(k) ?? { room: null, connected: false, applied: '' };
      this.seats.set(k, seat);
      const desiredRoom = target.room ? this.roomName(g, target.room) : null;
      if (seat.room !== desiredRoom) {
        const old = seat.room;
        seat.room = desiredRoom; seat.connected = false; seat.applied = '';
        if (old) api.removeParticipant(old, id).catch(() => {});
        if (desiredRoom) {
          const token = await this.mintToken(region, desiredRoom, id, g.nameOf(id));
          this.send(g.id, id, 'voice:join', { url: region.url, token, room: desiredRoom, location: target.room });
        } else {
          this.send(g.id, id, 'voice:leave', {});
        }
      }
      if (!seat.room || !seat.connected) return;
      const applied = `${target.publish}|${target.subscribe}`;
      if (seat.applied === applied) return;
      seat.applied = applied;
      try {
        await api.updateParticipant(seat.room, id, {
          permission: {
            canPublish: target.publish, canSubscribe: target.subscribe, canPublishData: false,
            canPublishSources: target.publish ? [TrackSource.MICROPHONE, TrackSource.CAMERA] : [],
          },
        });
      } catch {
        seat.applied = ''; // participant not connected yet; retried on next change / voice:connected
      }
    }));
  }

  async mintToken(region: Region, room: string, identity: string, name: string) {
    const at = new AccessToken(region.apiKey, region.apiSecret, { identity, name, ttl: '60s' });
    at.addGrant({ roomJoin: true, room, canPublish: false, canSubscribe: false, canPublishData: false, canUpdateOwnMetadata: false });
    return at.toJwt();
  }
}
