import type { Server, Socket } from 'socket.io';
import { Game, GameError, cleanText, sanitizeAvatar, type Player } from './game';
import { playerView, storytellerView, spectatorView, lobbyEntry } from './views';
import type { VoiceManager } from './voice';
import { encode, decode, type GameStore } from './persist';
import { addBot, botTick } from './bots';
import { startTutorial, tutorialNext, tutorialTick, tutorialSkip } from './tutorial';

const fail = (m: string): never => { throw new GameError(m); };

export const UNDO_WINDOW_MS = 10 * 60_000;
/** Storyteller actions worth undoing, with a short label (null = not undoable). */
function undoLabel(g: Game, type: string, d: any): string | null {
  const who = () => g.nameOf(String(d.playerId ?? ''));
  switch (type) {
    case 'st:kill': return `Kill ${who()}`;
    case 'st:revive': return `Revive ${who()}`;
    case 'st:execute': return `Execute ${who()}`;
    case 'st:setCharacter': return `Change ${who()}'s character`;
    case 'st:setShown': return `Change what ${who()} thinks they are`;
    case 'st:setAlignment': return `Change ${who()}'s alignment`;
    case 'st:reminders': return `Reminders on ${who()}`;
    case 'st:ghostVote': return `${who()}'s ghost vote`;
    case 'st:kick': return null; // a kicked player's connection is gone: not undoable
    case 'st:deal': return 'Deal characters';
    case 'st:reveal': return 'Reveal characters';
    case 'st:night': return 'Start the night';
    case 'st:day': return 'Start the day';
    case 'st:stage': return `Change stage to ${String(d.stage)}`;
    case 'st:startDefense': return 'Start the defence';
    case 'st:startVote': return 'Start the vote';
    case 'st:endDay': return 'End the day';
    case 'st:skipTimer': return 'End the timer';
    case 'st:resolveAbility': return 'Resolve the ability';
    case 'st:end': return 'End the game';
    case 'st:boomdandy': return 'Boomdandy explosion';
    case 'st:applyPrompt': return 'Apply the Al-Hadikhia deaths';
    case 'st:mezephelesSaid': return `${who()} said the Mezepheles' word`;
    case 'st:bluffs': return 'Change bluffs';
    default: return null;
  }
}

interface Binding { gameId: string; id: string }

export class Lobby {
  games = new Map<string, Game>();
  private sockets = new Map<string, Set<Socket>>(); // gameId → sockets
  private pending = new Set<string>();

  private dirty = new Set<string>();
  /** Undo history per game: snapshots taken just before important Storyteller actions. Not saved. */
  private undo = new Map<string, { label: string; at: number; json: string }[]>();

  constructor(private io: Server, private voice: VoiceManager, private store?: GameStore) {
    setInterval(() => void this.flush(), 2000);
    setInterval(() => {
      for (const g of this.games.values()) {
        g.tick();
        try { if (g.tutorial) tutorialTick(g); else botTick(g); } catch (e) { console.warn('[bots]', (e as Error).message); }
      }
    }, 250);
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
    g.markDirty = () => { this.dirty.add(g.id); };
    g.onChange = () => {
      this.dirty.add(g.id);
      if (this.pending.has(g.id)) return;
      this.pending.add(g.id);
      setImmediate(() => { this.pending.delete(g.id); this.broadcast(g); });
    };
  }
  sendTo(gameId: string, audience: string[] | 'all', event: string, payload: unknown) {
    // anything meant for the Storyteller also goes to the co-Storytellers
    const toST = audience !== 'all' && audience.includes('st');
    for (const s of this.sockets.get(gameId) ?? []) {
      const id = (s.data.binding as Binding).id;
      if (audience === 'all' || audience.includes(id) || (toST && id.startsWith('co:'))) s.emit(event, payload);
    }
  }
  broadcast(g: Game) {
    for (const s of this.sockets.get(g.id) ?? []) {
      const id = (s.data.binding as Binding).id;
      const view = id === 'st' || id.startsWith('co:') ? storytellerView(g)
        : id.startsWith('spec:') ? (() => { const sp = g.spectators.find(x => x.id === id); return sp ? spectatorView(g, sp) : null; })()
        : (() => { const p = g.maybePlayer(id); return p ? playerView(g, p) : null; })();
      if (!view) continue;
      view.voice.enabled = this.voice.enabled;
      if ((id === 'st' || id.startsWith('co:')) && view.self.isStoryteller) {
        view.self.availableRegions = this.voice.regions.map(r => r.name);
        const top = this.undo.get(g.id)?.at(-1);
        view.self.undo = top && Date.now() - top.at < UNDO_WINDOW_MS ? { label: top.label, at: top.at } : null;
      }
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
    g.setSchedule(d.scheduledFor);
    this.games.set(g.id, g);
    this.wire(g);
    this.bind(socket, g, 'st');
    g.storyteller.connected = true;
    g.changed();
    return { gameId: g.id, code: g.code, token: g.storyteller.token, id: 'st' };
  }
  /** A private practice game: the player, six bots and an automatic Storyteller. */
  tutorial(socket: Socket, d: any) {
    const g = new Game({ name: 'Practice game', visibility: 'private', stName: 'The Guide' });
    this.games.set(g.id, g);
    this.wire(g);
    const p = g.join(d.name, d.avatar);
    g.storyteller.connected = true; // the server plays the Storyteller
    startTutorial(g, p.id);
    this.bind(socket, g, p.id);
    return { gameId: g.id, code: g.code, token: p.token, id: p.id };
  }
  private byCode(code: string) {
    const c = code.trim().toUpperCase();
    return [...this.games.values()].find(g => g.code === c || g.id === code) ?? fail('No game with that code.');
  }
  lookup(code: string) {
    const g = this.byCode(code);
    return { game: lobbyEntry(g), travellersOnly: g.started, needsListening: g.started && g.transcriptRequired() };
  }
  /** Watch a game without a seat. */
  spectate(socket: Socket, d: any) {
    const g = this.byCode(String(d.code ?? ''));
    const sp = g.addSpectator(d.name, d.avatar);
    this.bind(socket, g, sp.id);
    return { gameId: g.id, code: g.code, token: sp.token, id: sp.id };
  }
  join(socket: Socket, d: any) {
    const g = this.byCode(String(d.code ?? ''));
    const p = g.join(d.name, d.avatar, { listeningConsent: !!d.listeningConsent });
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
    const co = (g.coStorytellers ?? []).find(x => x.token === token);
    if (co) {
      if (g.banned.has(co.id)) fail('You were removed from this game.');
      this.bind(socket, g, co.id);
      co.connected = true;
      if (g.paused && g.pausedBySTDisconnect) { g.pausedBySTDisconnect = false; g.setPaused(false); }
      g.changed();
      return { gameId: g.id, code: g.code, id: co.id };
    }
    const sp = g.spectators.find(x => x.token === token);
    if (sp) {
      this.bind(socket, g, sp.id);
      sp.connected = true;
      g.changed();
      return { gameId: g.id, code: g.code, id: sp.id };
    }
    const p = g.players.find(x => x.token === token) ?? fail('Seat not found.');
    this.bind(socket, g, p.id);
    g.setConnected(p, true);
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
    if (id.startsWith('co:')) {
      const c = g.coStorytellers.find(x => x.id === id);
      if (c) c.connected = false;
      if (!g.storyteller.connected && g.started && g.phase !== 'ended' && !g.paused) { g.pausedBySTDisconnect = true; g.setPaused(true); }
    } else if (id === 'st') {
      g.storyteller.connected = false;
      // a connected co-Storyteller keeps the game running
      if (!g.coStorytellers.some(c => c.connected) && g.started && g.phase !== 'ended' && !g.paused) { g.pausedBySTDisconnect = true; g.setPaused(true); }
    } else if (id.startsWith('spec:')) {
      const sp = g.spectators.find(x => x.id === id);
      if (sp) sp.connected = false;
    } else {
      const p = g.maybePlayer(id);
      if (p) g.setConnected(p, false);
    }
    g.changed();
  }
  voiceConnected(socket: Socket, room: string) {
    const { g, id } = this.binding(socket);
    this.voice.markConnected(g, id, room);
  }
  whisper(socket: Socket, d: any) {
    const { g, id } = this.binding(socket);
    g.whisper(g.isStoryteller(id) ? 'st' : id, String(d.to ?? 'st'), d.text);
  }
  chat(socket: Socket, text: string) {
    const { g, id } = this.binding(socket);
    g.sendChat(id, text);
  }

  action(socket: Socket, d: any) {
    const { g, id } = this.binding(socket);
    const type = String(d.type ?? '');
    if (type.startsWith('st:')) {
      if (!g.isStoryteller(id)) fail('Only the Storyteller can do that.');
      if (g.paused && !['st:pause', 'st:notes', 'st:end'].includes(type) && g.pausedBySTDisconnect) fail('Game is paused.');
      return this.stAction(g, type, d);
    }
    if (id.startsWith('co:')) {
      const c = g.coStorytellers.find(x => x.id === id)!;
      if (type === 'profile') { c.name = cleanText(d.name ?? c.name, 24) || c.name; g.changed(); return; }
      if (type === 'emote') return g.emote(id, d.kind);
      if (type === 'walk' || type === 'move') return; // co-Storytellers follow the lead Storyteller
      fail('Storytellers use the Grimoire.');
    }
    if (id === 'st') {
      if (type === 'profile') {
        g.storyteller.name = cleanText(d.name ?? g.storyteller.name, 24) || g.storyteller.name;
        if (d.avatar) g.storyteller.avatar = sanitizeAvatar(d.avatar);
        g.changed(); return;
      }
      if (type === 'move') { g.moveST(String(d.room)); g.storyteller.pos = null; g.changed(); return; }
      if (type === 'walk') return g.walk('st', d.x, d.z, d.ry);
      if (type === 'emote') return g.emote('st', d.kind);
      fail('Storytellers use the Grimoire.');
    }
    if (id.startsWith('spec:')) return this.spectatorAction(socket, g, id, type, d);
    if (type === 'tutorial:quit') {
      // end practice: the practice game is simply thrown away
      if (!g.tutorial || g.tutorial.humanId !== id) fail('This is not your practice game.');
      this.leave(socket);
      this.removeGame(g);
      return;
    }
    const p = g.player(id);
    if (g.paused && !['profile', 'rtt', 'claim'].includes(type)) fail('The game is paused.');
    return this.playerAction(g, p, type, d);
  }

  /** Spectators can only stop watching, or take a seat (a normal seat before the game, a Traveller seat during it). */
  private spectatorAction(socket: Socket, g: Game, id: string, type: string, d: any) {
    const sp = g.spectators.find(x => x.id === id) ?? fail('You are not watching this game.');
    if (type === 'takeSeat') {
      const p = g.join(d.name ?? sp!.name, d.avatar ?? sp!.avatar, { listeningConsent: !!d.listeningConsent }); // fails if full, Travellers not allowed, or no consent
      g.removeSpectator(sp!.id);
      this.bind(socket, g, p.id);
      return { gameId: g.id, code: g.code, token: p.token, id: p.id };
    }
    if (type === 'rtt') return;
    fail('Spectators can only watch.');
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
      case 'tutorial:next': return tutorialNext(g, p.id);
      case 'tutorial:skip': return tutorialSkip(g, p.id);
      case 'mvp': return g.voteMvp(p.id, String(d.candidateId ?? ''));
      case 'transcriptConsent': return g.setTranscriptConsent(p, !!d.allow);
      case 'say': return g.checkSpeech(p.id, d.text);
      case 'prompt': return g.answerPrompt(p.id, String(d.promptId ?? ''), String(d.answer ?? ''));
      case 'walk': return g.walk(p.id, d.x, d.z, d.ry);
      case 'emote': return g.emote(p.id, d.kind);
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
    if (type === 'st:undo') return this.undoLast(g);
    const label = undoLabel(g, type, d);
    if (!label) return this.stActionInner(g, type, d);
    const json = encode(g.toJSON());
    const out = this.stActionInner(g, type, d); // throws (and records nothing) if the action is refused
    const stack = this.undo.get(g.id) ?? [];
    stack.push({ label, at: Date.now(), json });
    if (stack.length > 10) stack.shift();
    this.undo.set(g.id, stack);
    g.changed();
    return out;
  }
  private undoLast(g: Game) {
    const stack = this.undo.get(g.id) ?? [];
    const top = stack.pop();
    if (!top || Date.now() - top.at > UNDO_WINDOW_MS) { this.undo.set(g.id, []); fail('There is nothing to undo.'); }
    try { g.restoreSnapshot(decode(top!.json), Date.now() - top!.at); }
    catch (e) { this.undo.set(g.id, []); throw e; }
    g.emit(['st'], 'alert', { text: `Undone: ${top!.label}`, kind: 'info' });
  }

  private stActionInner(g: Game, type: string, d: any) {
    const pid = String(d.playerId ?? '');
    switch (type) {
      case 'st:settings': return g.updateSettings(d.settings ?? {});
      case 'st:seat': return g.moveSeat(pid, Number(d.seat));
      case 'st:kick': {
        g.kick(pid);
        for (const s of this.sockets.get(g.id) ?? []) if ((s.data.binding as Binding).id === pid) this.leave(s);
        return;
      }
      case 'st:schedule': return g.setSchedule(d.scheduledFor);
      case 'st:mvp': return g.voteMvp('st', String(d.candidateId ?? ''));
      case 'st:addCo': { const c = g.addCoStoryteller(d.name); return { token: c.token, id: c.id }; }
      case 'st:removeCo': {
        g.removeCoStoryteller(String(d.id ?? ''));
        for (const s of this.sockets.get(g.id) ?? []) if ((s.data.binding as Binding).id === d.id) { s.emit('kicked', { reason: 'The Storyteller removed you as co-Storyteller.' }); this.leave(s); }
        return;
      }
      case 'st:dismissWordHit': return g.dismissWordHit(String(d.id ?? ''));
      case 'st:prompt': { g.startPrompt(d.kind === 'rps' ? 'rps' : d.kind === 'point' ? 'point' : 'livedie', Array.isArray(d.playerIds) ? d.playerIds.map(String) : []); return; }
      case 'st:applyPrompt': return g.applyPrompt(String(d.promptId ?? ''));
      case 'st:dismissPrompt': return g.dismissPrompt(String(d.promptId ?? ''));
      case 'st:boomdandy': return g.boomdandy(Array.isArray(d.survivors) ? d.survivors.map(String) : []);
      case 'st:word': return g.setSecretWord(d.kind === 'yaggababble' ? 'yaggababble' : 'mezepheles', d.word);
      case 'st:mezephelesSaid': return g.mezephelesSaid(pid);
      case 'st:yagga': return g.yaggababbleSaid(Number(d.delta) || 1);
      case 'st:ugHat': return g.setUgHat(d.playerId ? String(d.playerId) : null);
      case 'st:deal': return g.deal();
      case 'st:addBot': { if (g.players.filter(p => p.bot).length >= 9) fail('That is plenty of bots.'); addBot(g); return; }
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
      case 'st:setAwake': return g.setAwake(pid, !!d.awake);
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
      const waitingForStart = !!g.scheduledFor && g.phase === 'lobby' && now < g.scheduledFor + 3 * 3600_000;
      if ((!live && idle > 2 * 3600_000 && !waitingForStart) || (g.phase === 'ended' && idle > 3600_000)) {
        this.removeGame(g);
      }
    }
  }
  private removeGame(g: Game) {
    this.games.delete(g.id);
    this.sockets.delete(g.id);
    this.voice.dropGame(g);
    this.dirty.delete(g.id);
    this.undo.delete(g.id);
    void this.store?.remove(g.id).catch(e => console.warn('[save] could not remove game:', e.message));
  }

  // ------------------------------------------------------------ saving & restoring games
  /** Load saved games at start-up (they come back paused until the Storyteller reconnects). */
  async restore() {
    if (!this.store) return;
    try {
      const saved = await this.store.loadAll();
      for (const json of saved) {
        try {
          const g = Game.fromJSON(decode(json));
          this.games.set(g.id, g);
          this.wire(g);
        } catch (e) { console.warn('[save] skipped a damaged saved game:', (e as Error).message); }
      }
      console.log(`[save] games are saved to: ${this.store.kind}${saved.length ? ` (restored ${saved.length})` : ''}`);
    } catch (e) {
      console.warn(`[save] could not load saved games from ${this.store.kind}:`, (e as Error).message);
    }
  }
  /** Save every game that changed since the last save. */
  async flush() {
    if (!this.store || !this.dirty.size) return;
    const ids = [...this.dirty];
    this.dirty.clear();
    await Promise.all(ids.map(async id => {
      const g = this.games.get(id);
      if (!g) return;
      try { await this.store!.save(id, encode(g.toJSON()), g.scheduledFor); }
      catch (e) { this.dirty.add(id); console.warn('[save] could not save game:', (e as Error).message); }
    }));
  }
}
