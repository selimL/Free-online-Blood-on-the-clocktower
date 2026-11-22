// Computer-controlled seats: for the practice game, and so a Storyteller can try a setup alone.
// Bots never speak on voice. They decline the question prompt and vote (randomly, unless a
// practice game decides for them). Everything goes through the normal Game methods.
import { AVATAR_LIMITS, type Avatar } from '../../shared/types';
import { GameError, type Game, type Player } from './game';

export const BOT_NAMES = ['Ada', 'Bram', 'Cora', 'Dorian', 'Edda', 'Finn', 'Greta', 'Hugo', 'Ines', 'Jasper'];

function randomAvatar(): Avatar {
  const a = {} as Avatar;
  for (const [k, max] of Object.entries(AVATAR_LIMITS)) (a as unknown as Record<string, number>)[k] = Math.floor(Math.random() * max);
  return a;
}

export function addBot(g: Game, name?: string, avatar?: Avatar): Player {
  if (g.phase !== 'lobby') throw new GameError('Bots can only join before the game starts.');
  const taken = new Set(g.players.map(p => p.name));
  const n = name ?? BOT_NAMES.find(x => !taken.has(x)) ?? `Bot ${g.players.length + 1}`;
  const p = g.join(n, avatar ?? randomAvatar(), { bot: true });
  g.changed();
  return p;
}

/** How a bot votes on the current nomination (practice games override this). */
export type BotVote = (g: Game, bot: Player) => boolean;
const randomVote: BotVote = () => Math.random() < 0.35;

/** Called a few times a second: bots answer prompts and decide their votes. */
export function botTick(g: Game, vote: BotVote = randomVote) {
  if (!g.players.some(p => p.bot)) return;
  if (g.phase === 'questions') {
    for (const p of g.players) if (p.bot && p.wantsQuestion === null) g.answerQuestion(p, false);
  }
  // group actions: bots answer at random
  for (const pr of g.prompts) {
    if (pr.result) continue;
    for (const id of pr.playerIds) {
      const p = g.maybePlayer(id);
      if (p?.bot && !pr.answers[id]) try { g.answerPrompt(id, pr.id, pr.options[Math.floor(Math.random() * pr.options.length)]); } catch { /* closed */ }
    }
  }
  const n = g.nomination;
  if (n && !n.done && ['accusation', 'defense', 'voting'].includes(g.stage ?? '')) {
    for (const p of g.players) {
      if (!p.bot || n.hands[p.id] !== undefined || !n.order.includes(p.id) || !g.canVote(p, n.exile)) continue;
      if (g.stage === 'voting' && n.order.indexOf(p.id) < n.voteIndex) continue;
      try { g.setHand(p, vote(g, p)); } catch { /* vote closed meanwhile */ }
    }
  }
}
