// Where the sun is: 0 = sunrise, 0.5 = noon, 1 = sunset. The day is split in proportion to
// the Storyteller's timer lengths (discussion, private conversations, speed round, nominations),
// so the sun sets as nominations run out. While a nominee is on trial the sun holds still.
import type { GameView } from '../../shared/types';

const NO_LIMIT_GUESS = 300; // stages without a time limit still get a share of the day

// the sun never goes backwards within a day (e.g. when the Storyteller adds time)
let held = { key: '', p: 0 };

export function sunPosition(view: GameView, now = Date.now()): number | null {
  if (view.phase === 'night') return null;
  if (view.phase === 'ended') return 0.12;                // a new dawn
  if (view.phase !== 'day') return 0.93;                  // gathering at dusk, before the first night
  const t = view.timers;
  const key = `${view.id}:${view.day}`;
  const alive = view.players.filter(p => p.alive && !p.traveller).length || 1;
  const segs: { stage: string; len: number; timed: number | null }[] = [
    { stage: 'discussion', len: t.discussion ?? NO_LIMIT_GUESS, timed: t.discussion },
    { stage: 'private', len: t.privateRooms ?? NO_LIMIT_GUESS, timed: t.privateRooms },
    ...(view.houseRules.speedRound ? [{ stage: 'speedround', len: t.speedRound * alive, timed: t.speedRound * alive }] : []),
    { stage: 'nominations', len: t.nominations ?? NO_LIMIT_GUESS, timed: t.nominations },
  ];
  const total = segs.reduce((s, x) => s + x.len, 0);
  let p: number;
  const stage = view.stage ?? 'discussion';
  const i = segs.findIndex(s => s.stage === stage);
  if (stage === 'closed') p = 1;
  else if (i < 0) p = held.key === key ? held.p : 0;  // accusation / defence / voting: the sun waits
  else {
    const start = segs.slice(0, i).reduce((s, x) => s + x.len, 0);
    let elapsed = 0;
    const timer = view.timer;
    if (timer && segs[i].timed) {
      const remaining = timer.paused || timer.endsAt === null ? (timer.remainingMs ?? segs[i].timed! * 1000) : timer.endsAt - now;
      if (stage === 'speedround') {
        // one timer per speaker: count the speakers already done
        const done = view.speakerId ? Math.max(0, view.players.filter(p => p.alive && !p.traveller).findIndex(p => p.id === view.speakerId)) : 0;
        elapsed = done * t.speedRound + (t.speedRound - remaining / 1000);
      } else elapsed = segs[i].timed! - remaining / 1000;
    }
    p = (start + Math.max(0, Math.min(segs[i].len, elapsed))) / total;
  }
  p = Math.max(0, Math.min(1, p));
  if (held.key === key) p = Math.max(p, held.p);
  held = { key, p };
  return p;
}
