import type { Server, Socket } from 'socket.io';
import { Game, GameError, type Player } from './game';
import { playerView, storytellerView, lobbyEntry } from './views';
import type { VoiceManager } from './voice';

const fail = (m: string): never => { throw new GameError(m); };

interface Binding { gameId: string; id: string }

export class Lobby {
  games = new Map<string, Game>();
  private sockets = new Map<string, Set<Socket>>(); // gameId → sockets
  private pending = new Set<string>();

  constructor(private io: Server, private voice: VoiceManager) {
    setInterval(() => { for (const g of this.games.values()) g.tick(); }, 250);
    setInterval(() => this.cleanup(), 60_000);
  }

  private bind(socket: Socket, g: Game, id: string) {
    this.leave(socket);
    socket.data.binding = { gameId: g.id, id } satisfies Binding;
    if (!this.sockets.has(g.id)) this.sockets.set(g.id, new Set());
    this.sockets.get(g.id)!.add(socket);
    this.voice.resync(g, id);
  }
  private binding(socket: Socket): { g: Game; id: string } {
    const b = socket.data.binding as Binding | undefined;
    const g = b && this.games.get(b.gameId);
    if (!b || !g) fail('You are not in a game.');
    return { g: g!, id: b!.id };
  }

  private wire(g: Game) {
    g.emit = (audience, event, payload) => this.sendTo(g.id, audience, event, payload);
    g.onChange = () => {
      if (this.pending.has(g.id)) return;
      this.pending.add(g.id);
      setImmediate(() => { this.pending.delete(g.id); this.broadcast(g); });
    };
  }
  sendTo(gameId: string, audience: string[] | 'all', event: string, payload: unknown) {
    for (const s of this.sockets.get(gameId) ?? []) {
      const id = (s.data.binding as Binding).id;
      if (audience === 'all' || audience.includes(id)) s.emit(event, payload);
    }
  }
  broadcast(g: Game) {
    for (const s of this.sockets.get(g.id) ?? []) {
      const id = (s.data.binding as Binding).id;
      const view = id === 'st' ? storytellerView(g) : (() => { const p = g.maybePlayer(id); return p ? playerView(g, p) : null; })();
      if (!view) continue;
      view.voice.enabled = this.voice.enabled;
      if (id === 'st' && view.self.isStoryteller) view.self.availableRegions = this.voice.regions.map(r => r.name);
      s.emit('state', view);
    }
    void this.voice.reconcile(g);
  }

  publicList() {
    return [...this.games.values()].filter(g => g.visibility === 'public' && g.phase !== 'ended').map(lobbyEntry);
  }
  create(socket: Socket, d: any) {
    const g = new Game({ name: d.name, visibility: d.visibility, stName: d.stName, stAvatar: d.stAvatar });
    if (['tb', 'bmr', 'snv', 'custom'].includes(d.edition)) g.settings.edition = d.edition;
    this.games.set(g.id, g);
    this.wire(g);
    this.bind(socket, g, 'st');
    g.storyteller.connected = true;
    g.changed();
    return { gameId: g.id, code: g.code, token: g.storyteller.token, id: 'st' };
  }
  private byCode(code: string) {
    const c = code.trim().toUpperCase();
    return [...this.games.values()].find(g => g.code === c || g.id === code) ?? fail('No game with that code.');
  }
  lookup(code: string) {
    const g = this.byCode(code);
    return { game: lobbyEntry(g), travellersOnly: g.started };
  }
  join(socket: Socket, d: any) {
    const g = this.byCode(String(d.code ?? ''));
    const p = g.join(d.name, d.avatar);
    this.bind(socket, g, p.id);
    return { gameId: g.id, code: g.code, token: p.token, id: p.id };
  }
  rejoin(socket: Socket, d: any) {
    const g = this.games.get(String(d.gameId ?? '')) ?? fail('That game no longer exists.');
    const token = String(d.token ?? '');
    if (g.banned.has(token)) fail('You were removed from this game.');
    if (token === g.storyteller.token) {
      this.bind(socket, g, 'st');
      g.storyteller.connected = true;
      if (g.paused && g.pausedBySTDisconnect) { g.pausedBySTDisconnect = false; g.setPaused(false); }
      g.changed();
      return { gameId: g.id, code: g.code, id: 'st' };
    }
    const p = g.players.find(x => x.token === token) ?? fail('Seat not found.');
    this.bind(socket, g, p.id);
    p.connected = true;
    g.changed();
    return { gameId: g.id, code: g.code, id: p.id };
  }
  leave(socket: Socket) {
    const b = socket.data.binding as Binding | undefined;
    if (!b) return;
    this.sockets.get(b.gameId)?.delete(socket);
    socket.data.binding = undefined;
    const g = this.games.get(b.gameId);
    if (g) this.markDisconnected(g, b.id);
  }
  disconnected(socket: Socket) { this.leave(socket); }
  private markDisconnected(g: Game, id: string) {
    const stillThere = [...(this.sockets.get(g.id) ?? [])].some(s => (s.data.binding as Binding).id === id);
    if (stillThere) return;
    if (id === 'st') {
      g.storyteller.connected = false;
      if (g.started && g.phase !== 'ended' && !g.paused) { g.pausedBySTDisconnect = true; g.setPaused(true); }
    } else {
      const p = g.maybePlayer(id);
      if (p) p.connected = false;
    }
    g.changed();
  }
  voiceConnected(socket: Socket, room: string) {
    const { g, id } = this.binding(socket);
    this.voice.markConnected(g, id, room);
  }
  chat(socket: Socket, text: string) {
    const { g, id } = this.binding(socket);
    g.sendChat(id, text);
  }

  action(socket: Socket, d: any) {
    const { g, id } = this.binding(socket);
    const type = String(d.type ?? '');
    if (type.startsWith('st:')) {
      if (id !== 'st') fail('Only the Storyteller can do that.');
      if (g.paused && !['st:pause', 'st:notes', 'st:end'].includes(type) && g.pausedBySTDisconnect) fail('Game is paused.');
      return this.stAction(g, type, d);
    }
    if (id === 'st') {
      if (type === 'profile') { g.storyteller.name = String(d.name ?? g.storyteller.name).slice(0, 24); g.changed(); return; }
      if (type === 'move') { g.moveST(String(d.room)); g.changed(); return; }
      fail('Storytellers use the Grimoire.');
    }
    const p = g.player(id);
    if (g.paused && !['profile', 'rtt', 'claim'].includes(type)) fail('The game is paused.');
    return this.playerAction(g, p, type, d);
  }

  private playerAction(g: Game, p: Player, type: string, d: any) {
    switch (type) {
      case 'profile': return g.setProfile(p, d.name, d.avatar);
      case 'move': {
        const err = g.canEnter(p, String(d.room));
        if (err) fail(err);
        if (g.phase === 'day' && g.isPrivateRoom(String(d.room))) p.whispersToday++;
        g.movePlayer(p, String(d.room));
        return g.changed();
      }
      case 'claim': return g.setClaim(p, String(d.claim ?? ''));
      case 'question': return g.answerQuestion(p, !!d.yes);
      case 'nominate': return g.nominate(p.id, String(d.nomineeId), !!d.exile);
      case 'vote': return g.setHand(p, !!d.raised);
      case 'ability': return g.useAbility(p, d.mode === 'claim' ? 'claim' : 'real', d.characterId);
      case 'abilityTarget': return g.abilityTarget(p, String(d.targetId));
      case 'abilityDone': return g.abilityDone(p);
      case 'nightChoice': return g.nightChoose(p, Array.isArray(d.ids) ? d.ids.map(String) : []);
      case 'reveal': return g.revealTo(p, String(d.toId));
      case 'pickTraveller': return g.pickTraveller(p, String(d.characterId ?? ''));
      case 'rtt': {
        const rtt: Record<string, number> = {};
        for (const [k, v] of Object.entries(d.rtt ?? {})) if (typeof v === 'number') rtt[k.slice(0, 40)] = Math.max(0, Math.min(10000, v));
        p.rtt = rtt;
        return;
      }
      default: fail('Unknown action.');
    }
  }

  private stAction(g: Game, type: string, d: any) {
    const pid = String(d.playerId ?? '');
    switch (type) {
      case 'st:settings': return g.updateSettings(d.settings ?? {});
      case 'st:seat': return g.moveSeat(pid, Number(d.seat));
      case 'st:kick': {
        g.kick(pid);
        for (const s of this.sockets.get(g.id) ?? []) if ((s.data.binding as Binding).id === pid) this.leave(s);
        return;
      }
      case 'st:deal': return g.deal();
      case 'st:reveal': return g.reveal();
      case 'st:nextQuestion': return g.nextQuestion();
      case 'st:night': return g.beginNight();
      case 'st:day': return g.beginDay();
      case 'st:stage': return g.setStage(d.stage);
      case 'st:startDefense': return g.startDefense();
      case 'st:startVote': return g.startVote();
      case 'st:endDay': return g.endDay();
      case 'st:skipTimer': return g.expireTimer();
      case 'st:addTime': return g.addTime(Number(d.seconds) || 30);
      case 'st:pause': g.pausedBySTDisconnect = false; return g.setPaused(!!d.paused);
      case 'st:wake': return g.toggleWake(pid);
      case 'st:focus': return g.setFocus(pid);
      case 'st:info': return g.sendInfoCard(pid, d.card ?? {});
      case 'st:kill': return g.kill(pid, d.cause);
      case 'st:revive': return g.revive(pid);
      case 'st:execute': return g.execute(pid);
      case 'st:mute': return g.toggleMute(pid);
      case 'st:setCharacter': return g.setCharacter(pid, d.characterId ?? null);
      case 'st:setShown': return g.setShownCharacter(pid, d.characterId ?? null);
      case 'st:setAlignment': return g.setAlignment(pid, d.alignment);
      case 'st:reminders': return g.setReminders(pid, Array.isArray(d.reminders) ? d.reminders : []);
      case 'st:ghostVote': return g.setGhostVote(pid, !!d.used);
      case 'st:fakeEvil': return g.setFakeEvilTeam(pid, Array.isArray(d.ids) ? d.ids.map(String) : []);
      case 'st:bluffs': return g.setBluffs(d.kind === 'lunatic' ? 'lunatic' : 'demon', Array.isArray(d.ids) ? d.ids.map(String) : []);
      case 'st:resolveAbility': return g.resolveAbility(d.outcome === 'kill' ? 'kill' : 'nothing');
      case 'st:takeRequest': return g.takePrivateRequest(String(d.eventId));
      case 'st:invite': g.startStudy(pid); return g.changed();
      case 'st:closeStudy': return g.closeStudy();
      case 'st:notes': g.stNotes = String(d.notes ?? '').slice(0, 20000); return; // no broadcast needed
      case 'st:end': return g.endGame(d.winner);
      default: fail('Unknown Storyteller action.');
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const g of this.games.values()) {
      const live = (this.sockets.get(g.id)?.size ?? 0) > 0;
      const idle = now - g.lastActivity;
      if ((!live && idle > 2 * 3600_000) || (g.phase === 'ended' && idle > 3600_000)) {
        this.games.delete(g.id);
        this.sockets.delete(g.id);
        this.voice.dropGame(g);
      }
    }
  }
}
