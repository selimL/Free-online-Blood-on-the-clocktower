// "My games": a record of finished games, kept in this browser only.
import type { GameView } from '../../shared/types';
import { localChanged } from './syncBus';

export interface HistoryEntry {
  gameId: string; name: string; endedAt: number; players: number; script: string;
  me: string; role: 'player' | 'storyteller'; character: string | null; alignment: 'good' | 'evil' | null;
  winner: 'good' | 'evil' | null; won: boolean | null; survived: boolean | null;
  mvp: string[]; mvpMe: boolean;
}
const KEY = 'botc:history';

export function loadHistory(): HistoryEntry[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Save (or update) the finished game the viewer just played. */
export function recordGame(view: GameView) {
  if (view.phase !== 'ended' || !view.story || view.self.isStoryteller === undefined) return;
  if (!view.self.isStoryteller && view.self.spectator) return;
  if (!view.self.isStoryteller && view.self.tutorial) return; // the practice game doesn't count
  const isST = view.self.isStoryteller;
  const meSeat = !isST ? view.story.grimoire.find(g => g.id === view.self.id) : null;
  const votes = view.mvp?.votes ?? {};
  const top = Math.max(0, ...Object.values(votes));
  const mvp = top ? Object.entries(votes).filter(([, n]) => n === top).map(([id]) => id) : [];
  const entry: HistoryEntry = {
    gameId: view.id, name: view.name, endedAt: Date.now(), players: view.players.length,
    script: view.characterList ? `${view.characterList.characters.length} characters` : '',
    me: isST ? view.storyteller.name : view.players.find(p => p.id === view.self.id)?.name ?? '?',
    role: isST ? 'storyteller' : 'player',
    character: meSeat?.characterId ?? null, alignment: meSeat?.alignment ?? null,
    winner: view.winner, won: meSeat && view.winner ? meSeat.alignment === view.winner : null,
    survived: meSeat ? meSeat.alive : null,
    mvp: mvp.map(id => view.players.find(p => p.id === id)?.name ?? '?'),
    mvpMe: !isST && mvp.includes(view.self.id),
  };
  const list = loadHistory();
  const old = list.find(x => x.gameId === entry.gameId);
  if (old) entry.endedAt = old.endedAt;
  try { localStorage.setItem(KEY, JSON.stringify([entry, ...list.filter(x => x.gameId !== entry.gameId)].slice(0, 200))); } catch { /* full */ }
  localChanged();
}

export function stats(list: HistoryEntry[]) {
  const played = list.filter(x => x.role === 'player');
  const asTeam = (a: 'good' | 'evil') => { const g = played.filter(x => x.alignment === a); return { games: g.length, wins: g.filter(x => x.won).length }; };
  const chars: Record<string, number> = {};
  for (const x of played) if (x.character) chars[x.character] = (chars[x.character] ?? 0) + 1;
  return {
    games: played.length, storytold: list.length - played.length,
    wins: played.filter(x => x.won).length, good: asTeam('good'), evil: asTeam('evil'),
    survived: played.filter(x => x.survived).length, mvps: played.filter(x => x.mvpMe).length,
    topCharacters: Object.entries(chars).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}
