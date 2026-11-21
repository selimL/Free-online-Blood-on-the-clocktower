// The practice game: one human (the Empath) and six bots in a small Trouble Brewing game,
// run by an automatic Storyteller ("the Guide") that explains each step. It drives the real
// engine through its normal methods, so what the player learns is exactly how games work.
import type { Game } from './game';
import { addBot, botTick } from './bots';
import type { Avatar } from '../../shared/types';

// Seat order matters: the Empath (seat 0) sits between Finn (good, seat 6) and Ada (the Imp, seat 1).
const CAST: { name: string; character: string }[] = [
  { name: 'Ada', character: 'imp' },
  { name: 'Bram', character: 'chef' },
  { name: 'Cora', character: 'washerwoman' },
  { name: 'Dorian', character: 'poisoner' },
  { name: 'Edda', character: 'monk' },
  { name: 'Finn', character: 'soldier' },
];
const LOOKS: Avatar[] = [
  { skin: 1, hair: 2, hairColor: 5, eyes: 0, outfit: 3, outfitColor: 0, accessory: 4, build: 1, height: 0 },
  { skin: 4, hair: 4, hairColor: 0, eyes: 2, outfit: 1, outfitColor: 1, accessory: 1, build: 2, height: 2 },
  { skin: 0, hair: 3, hairColor: 1, eyes: 1, outfit: 4, outfitColor: 3, accessory: 0, build: 0, height: 1 },
  { skin: 2, hair: 6, hairColor: 3, eyes: 3, outfit: 2, outfitColor: 6, accessory: 2, build: 0, height: 0 },
  { skin: 3, hair: 5, hairColor: 2, eyes: 0, outfit: 3, outfitColor: 7, accessory: 5, build: 1, height: 1 },
  { skin: 5, hair: 1, hairColor: 4, eyes: 2, outfit: 0, outfitColor: 2, accessory: 6, build: 2, height: 2 },
];

const S = 1000;
const byName = (g: Game, name: string) => g.players.find(p => p.name === name)!;
const human = (g: Game) => g.player(g.tutorial!.humanId);

function tip(g: Game, step: string, title: string, text: string, next: string | null = 'Next ▶') {
  g.tutorial!.step = step;
  g.tutorial!.stepAt = Date.now();
  g.tutorial!.tip = { title, text, next };
  g.changed();
}
function say(g: Game, from: string, text: string, afterMs: number) {
  g.tutorial!.chatQueue.push({ at: Date.now() + afterMs, from, text });
  g.tutorial!.chatQueue.sort((a, b) => a.at - b.at);
}

/** Set up a practice game for one human. */
export function startTutorial(g: Game, humanId: string) {
  g.settings.timers = { ...g.settings.timers, discussion: null, privateRooms: null, nominations: null, accusation: null, defense: null, question: null };
  g.settings.houseRules = { ...g.settings.houseRules, allowSpectators: false, allowTravellers: false, timersAutoAdvance: false };
  CAST.forEach((c, i) => addBot(g, c.name, LOOKS[i]));
  g.tutorial = {
    humanId, step: 'welcome', stepAt: Date.now(), tip: { title: '', text: '', next: null }, chatQueue: [], attempts: 0, done: false,
  };
  tip(g, 'welcome', 'Welcome to Clocktower Nights',
    'This is a practice game. You and six townsfolk (computer players) are gathered in the Town Square, and I, the Guide, am your Storyteller. '
    + 'Somewhere among you hides the Demon, who kills at night. The good team wins by executing the Demon. Press Next when you are ready.');
}

/** The player pressed the tip's button. */
export function tutorialNext(g: Game, playerId: string) {
  const T = g.tutorial;
  if (!T || T.humanId !== playerId || !T.tip.next) return;
  const me = human(g);
  switch (T.step) {
    case 'welcome': {
      g.updateSettings({ characters: ['empath', ...CAST.map(c => c.character)] });
      g.deal();
      g.setCharacter(me.id, 'empath');
      for (const c of CAST) g.setCharacter(byName(g, c.name).id, c.character);
      g.demonBluffs = ['investigator', 'librarian', 'virgin'];
      g.reveal();
      me.wantsQuestion = false; // the Guide answers your questions in these tips instead
      return tip(g, 'character', 'You are the Empath',
        'Press 📜 Character (or the P key) to see your character. As the Empath, each night you learn how many of your two living neighbours are evil. '
        + 'Your neighbours are Finn and Ada. Nobody else knows your character. You may tell the truth about it… or bluff.');
    }
    case 'character': {
      g.beginNight();
      g.setAwake(me.id, true);
      g.sendInfoCard(me.id, { text: 'Your Empath number is 1: exactly one of your living neighbours (Finn and Ada) is evil.', playerIds: [byName(g, 'Finn').id, byName(g, 'Ada').id] });
      return tip(g, 'night', 'The first night',
        'At night everyone sleeps, and the Storyteller wakes characters one at a time. I woke you and showed you your information. '
        + 'Remember it: one of Finn and Ada is evil. Asleep players see nothing until they are woken.');
    }
    case 'night': {
      g.setAwake(me.id, false);
      g.beginDay();
      say(g, 'Bram', 'Morning all! I\'m the Chef. I got a 0, so no two evil players are sitting next to each other.', 4 * S);
      say(g, 'Cora', 'Washerwoman here. I learned that either Bram or Edda is the Chef. So Bram is probably telling the truth.', 8 * S);
      say(g, 'Ada', 'I\'m the Soldier! The Demon can\'t kill me, so I\'m happy to say it out loud. 😇', 12 * S);
      say(g, 'Finn', 'Wait, what? I\'M the Soldier. Ada, why are you lying?', 16 * S);
      say(g, 'Edda', 'I\'m the Monk. I can protect someone each night. Who do we trust?', 20 * S);
      say(g, 'Dorian', 'I believe Ada. Finn has been acting strange all morning…', 24 * S);
      return tip(g, 'discussion', 'Day 1: town discussion',
        'By day everyone talks in the Town Square. In a real game this is voice chat; here the bots type in the Room chat panel on the right. '
        + 'Watch what they claim. Two people claim to be the Soldier, and there is only one Soldier!');
    }
    case 'discussion': {
      g.setStage('private');
      return tip(g, 'private', 'Private conversations',
        'Now the side rooms open. Click a building on the map on the left (or walk to its door in the 3D view) to talk privately with up to a few others. '
        + 'Try entering a building and coming back to the Town Square, then press Next.');
    }
    case 'private': {
      g.setStage('nominations');
      return tip(g, 'nominations', 'Nominations',
        'Time to choose who to execute. Your number was 1, so Finn or Ada is evil. Both claim to be the Soldier, so one of them is lying. '
        + 'Click Ada\'s avatar to nominate her (each player may nominate once per day).', null);
    }
    default: return;
  }
}

/** Runs a few times a second: bot chat, bot votes, and the automatic parts of the script. */
export function tutorialTick(g: Game, now = Date.now()) {
  const T = g.tutorial;
  if (!T || T.done) return;
  // queued bot chat
  while (T.chatQueue.length && T.chatQueue[0].at <= now) {
    const m = T.chatQueue.shift()!;
    const bot = g.players.find(p => p.name === m.from);
    if (bot) try { g.sendChat(bot.id, m.text); } catch { /* the room changed: skip the line */ }
  }
  const ada = byName(g, 'Ada');
  // bots: good bots vote for whoever is accused of being Ada; evil bots never do
  botTick(g, (game, bot) => {
    const n = game.nomination!;
    const evil = bot.alignment === 'evil';
    return n.nomineeId === ada.id ? !evil : evil && n.nomineeId !== ada.id && n.nomineeId !== byName(game, 'Dorian').id && Math.random() < 0.5;
  });
  const me = human(g);
  const since = now - T.stepAt;
  switch (T.step) {
    case 'nominations':
      if (g.nomination && !g.nomination.done && g.stage === 'accusation') {
        const nominee = g.player(g.nomination.nomineeId);
        if (g.nomination.nominatorId === me.id) say(g, nominee.name, nominee.id === ada.id ? 'Me? I\'m the Soldier, I swear! Finn is the liar!' : 'Me? I\'m good, you\'re making a mistake!', 8 * S); // during the defence
        tip(g, 'accusation', 'The accusation',
          `${g.nameOf(g.nomination.nominatorId)} accuses ${nominee.name}. The nominator explains why, then the nominee defends themselves. In a real game you would speak now.`, null);
      } else if (since > 25 * S && !g.nomination && T.tip.text.indexOf('Hint') < 0) {
        tip(g, 'nominations', 'Nominations', `${T.tip.text} Hint: Ada is the avatar to your right in the circle.`, null);
      }
      break;
    case 'accusation':
      if (g.stage === 'accusation' && since > 6 * S) { g.startDefense(); T.stepAt = now; }
      else if (g.stage === 'defense' && since > 6 * S) {
        g.startVote();
        tip(g, 'voting', 'Voting',
          `The clock hand goes round the circle, starting after the nominee. Raise your hand ✋ Yes before it reaches you to vote for the execution. `
          + `${g.nomination!.needed} votes are needed.`, null);
      }
      break;
    case 'voting':
      if (g.nomination?.done) {
        const executed = g.aboutToDie?.playerId;
        if (executed === ada.id) {
          g.execute(ada.id);
          tip(g, 'win', 'Ada is executed…', 'Ada was the Imp, the Demon! With the Demon dead, the good team wins.', null);
        } else {
          tip(g, 'fail', 'Not this time', g.nomination.result ?? 'The vote failed.', null);
        }
      }
      break;
    case 'win':
      if (since > 4 * S) {
        g.endGame('good');
        T.done = true;
        tip(g, 'end', 'You win! 🎉',
          'Good wins. Every character is now revealed: Dorian was the Poisoner, Ada the Imp. Open 📜 Game story to see the whole game, including the secret night actions. '
          + 'When you are ready, press Leave and host or join a real game with friends. You can also replay this practice game from the lobby.', null);
      }
      break;
    case 'fail':
      if (since > 4 * S) {
        T.attempts++;
        if (g.aboutToDie) g.execute(g.aboutToDie.playerId);
        if (T.attempts >= 2) {
          g.endGame('evil');
          T.done = true;
          tip(g, 'end', 'Evil wins this time',
            'The Demon survived. Ada (seated next to you) was the Imp: your Empath 1 and the two Soldier claims pointed at her or Finn, and the Chef\'s 0 cleared nobody next to Ada. '
            + 'Open 📜 Game story to see everything, then try the practice game again from the lobby.', null);
          return;
        }
        // night: the Imp kills the Monk
        g.beginNight();
        g.kill(byName(g, 'Edda').id);
        tip(g, 'night2', 'Night falls', 'The day ended without the Demon being executed, so the Demon strikes again…', null);
      }
      break;
    case 'night2':
      if (since > 5 * S) {
        g.beginDay();
        say(g, 'Finn', 'Edda is dead! I\'m still the real Soldier. Please, look at Ada.', 4 * S);
        g.setStage('nominations');
        tip(g, 'nominations', 'Day 2: another chance',
          'Edda the Monk died in the night: the Demon is still alive. Your number was 1, so Finn or Ada is evil, and both claimed the Soldier. Nominate the one you believe is lying.', null);
      }
      break;
    default: break;
  }
}
