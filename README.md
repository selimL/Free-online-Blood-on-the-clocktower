# Clocktower Nights: online Blood on the Clocktower (private, non-commercial)

## ▶ Play now: **<https://clocktower-nights.onrender.com/>**

No download needed: open the link in a browser, create a game, and send the invite link to your friends. (On the free host the site sleeps when nobody is using it, so the first visit can take up to a minute to wake up.)

A browser-based, real-time, voice-first table for *Blood on the Clocktower*. It has a lobby, isolated game rooms, a Town Square and side rooms (whispers) with a server-enforced 3-second join delay, a Storyteller Grimoire, night waking, nominations with sequential voting, real and bluffed day abilities, and a gothic theme.

> Blood on the Clocktower is © The Pandemonium Institute. This is an unofficial fan project for **private play among friends**. See [`docs/DESIGN.md` §5](docs/DESIGN.md#5-rights-and-public-release) for what would need permission before any public release.

- **Design, assumptions, build plan and house-rule research:** [`docs/DESIGN.md`](docs/DESIGN.md)
- **Rule changes made to match the supplied rules reference PDF:** [`docs/DESIGN.md` §1.C](docs/DESIGN.md#c-changes-made-to-match-the-rules-reference-pdf)
- **Character data (all 3 editions plus Travellers and Fabled):** [`shared/characters.ts`](shared/characters.ts). The ability descriptions are paraphrased summaries, not the official wording. Check them against <https://wiki.bloodontheclocktower.com>, which was unreachable from the build environment.

## Features

- **Town:** lobby with public and private games, invite links, spectators; a 3D Town Square (or a 2D view) with eight buildings you can walk into, 3D interiors, customisable 3D figures, gestures, weather, a day/night cycle that follows the timers, death scenes, music and sound, and a Low/Medium/High 3D quality setting for older devices.
- **Voice and chat:** per-room voice (LiveKit), push-to-talk, per-person volume, room text chat, private whispers to the Storyteller, and a public lobby chat for finding players (games can advertise "looking for N players").
- **Game:** server-enforced rules and hidden information, night waking, nominations with a 3D clock hand and raised hands, real and bluffed day abilities, Travellers, Fabled, house rules, MVP vote and an end-of-game story.
- **Storyteller tools:** Grimoire, night helper with pre-worked-out information, reminder suggestions, kill warnings, undo, script builder (save, export, share), homebrew characters (announced by the Bootlegger), co-Storytellers and handing the role over, bots that claim, bluff, share info, nominate and vote, game backups you can download and restore, saved games that survive restarts, scheduled games with a countdown and calendar file.
- **Learning:** a guided practice game (skippable), the Almanac with tips for every character, private notes on other players, and a personal game history with stats, plus a friends' leaderboard for signed-in players.

## Languages

The Storyteller picks the game's language in **Setup → 🌐 Language** before the game starts (English or Türkçe). Everyone in that game then sees the game screens, announcements, Storyteller messages, character abilities, Almanac tips and bot chat in that language; character names stay in English. The lobby, accounts and admin pages stay English.

Every text is written in English in the code, and each language is a dictionary from that English to its translation (`shared/i18n/`). Anything missing falls back to English. To add a language:

1. Copy `shared/i18n/tr.ts`, `abilities.tr.ts` and `almanac.tr.ts` to e.g. `es.ts`, `abilities.es.ts`, `almanac.es.ts` and translate the right-hand sides, keeping `{placeholders}`.
2. Add the language to `LANGUAGES` and the dictionaries in `shared/i18n/index.ts`.
3. Run `npm test`: `tests/i18n.test.ts` lists any text still missing a translation.

## Quick start (local, text chat only)

Requires Node 20 or later.

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:5173>. Create a game in one browser window, then join from other windows or private tabs with the invite code or link (each tab needs its own storage, so use separate browser profiles or incognito windows). Without a voice server the game runs fully, with room-scoped text chat in place of voice.

## Enabling voice and video (LiveKit)

Voice uses a [LiveKit](https://livekit.io) SFU. For local testing:

```bash
livekit-server --dev
```

```bash
LIVEKIT_URL=ws://localhost:7880 LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret npm run dev
```

The top bar shows **voice live** once the server has granted you audio in your current room.

### Easiest: LiveKit Cloud plus a `.env` file

1. Create a free project at <https://cloud.livekit.io>.
2. Copy its **URL** (`wss://….livekit.cloud`), **API key** and **API secret**.
3. Create a file named `.env` in the project folder containing:

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

4. Restart the server with `npm start` (or `npm run dev`). It prints `Loaded settings from .env` and `voice enabled`.

`.env` is git-ignored, so your keys never end up on GitHub.

### Production and multiple regions

Use self-hosted LiveKit nodes in each region, or LiveKit Cloud. For several regions, set:

```bash
LIVEKIT_REGIONS='[
  {"name":"eu","url":"wss://eu.voice.example.com","apiKey":"…","apiSecret":"…"},
  {"name":"na","url":"wss://na.voice.example.com","apiKey":"…","apiSecret":"…"},
  {"name":"asia","url":"wss://asia.voice.example.com","apiKey":"…","apiSecret":"…"}
]'
```

Each client measures its round-trip time to every region. When characters are revealed, the server picks the region that **minimises the worst player latency**. The Storyteller can override this in Setup.

**STUN/TURN:** turn on LiveKit's embedded TURN server (`turn.enabled: true`, with TLS on 443 and UDP on 3478) so that players behind strict NATs or firewalls can still connect. With LiveKit Cloud, TURN is included.

### Build and run in production

```bash
npm run build
```

```bash
PORT=3001 npm start
```

The server serves the built client from `dist/` and the WebSocket API on the same port. Put a TLS reverse proxy in front of it, because browsers only allow microphone access over HTTPS.

| Env var | Purpose |
|---|---|
| `PORT` | HTTP and WebSocket port (default 3001) |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Single voice region |
| `LIVEKIT_REGIONS` | JSON array for several regions (takes precedence) |
| `CORS_ORIGIN` | Comma-separated allowed origins if the client is hosted elsewhere |
| `VITE_SERVER_URL` | (client build) URL of the game server, if it isn't the same origin |

## Saving games (surviving restarts)

Games are saved every couple of seconds and restored when the server starts again. After a restart they come back **paused**, and resume when the Storyteller reconnects. Players reconnect into the same seats.

- **On your own computer:** saved automatically in a `.data/` folder. Nothing to set up.
- **On Render's free plan,** the disk is wiped on every restart, so use a free **Upstash Redis** database:
  1. Create a free account at <https://upstash.com>, then create a **Redis** database.
  2. Copy its **REST URL** and **REST token** (under *REST API*).
  3. In Render, open your service, then **Environment**. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, then save and deploy.
  4. The log then shows `[save] games are saved to: Upstash Redis`.

Saved games expire 12 hours after their last change.

## Accounts and the admin page

Accounts are optional: players can always play without one. Signing in keeps a player's name, figure, finished games and saved scripts on the server. Accounts are stored with the saved games (Upstash Redis on the hosted site, otherwise the local `.data` folder), so on Render's free plan **set up Upstash first**, or accounts are lost when the site restarts.

Set these in the server's environment (Render → your service → Environment). Each is optional:

| Setting | Turns on |
|---|---|
| `ADMIN_PASSWORD` | The admin page at `/admin`: running games (close them), accounts (reset passwords, delete) |
| `PUBLIC_URL` | The site's address, e.g. `https://clocktower-nights.onrender.com` (used in Google and email links) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Sign in with Google" (a Google Cloud OAuth client; redirect URI `<PUBLIC_URL>/api/auth/google/callback`) |
| `RESEND_API_KEY`, `MAIL_FROM` | "Email me a login link" through [resend.com](https://resend.com) (`MAIL_FROM` like `Clocktower Nights <login@yourdomain>`) |

Name + password accounts work with no settings at all. Passwords are stored hashed (scrypt).

**Admin accounts:** sign in to `/admin` with `ADMIN_PASSWORD`, then press **👑 Make admin** next to an account. That account sees a **🛠 Admin** button in the lobby and opens the admin page with its normal sign-in (no password to share). Admin accounts can close games, moderate the lobby chat and manage ordinary accounts; only the owner (admin password) can change another admin's password, delete an admin or remove admin rights from one.

## Tests

```bash
npm test
```

```bash
npm run typecheck
```

The Vitest suite (`tests/game.test.ts`) covers the guarantees that matter most:

- No player's view contains another seat's true character or alignment, or any Grimoire data.
- A real ability use and a bluffed one produce **identical** public data and alerts. Only the Storyteller learns which is which.
- The Drunk sees a Townsfolk. The Lunatic gets a fake evil team in exactly the same shape as the real one.
- No evil info is given in 6-player games unless the house rule is on, and "(evil)" markers update live when an alignment changes.
- Joining players can't hear or be heard for 3 seconds, and only the room's occupants are alerted. The private-room cap is enforced. Night silences everyone. Storyteller mutes block voice and chat.
- Voting goes clockwise from the nominee, who votes last. The threshold, ghost votes, ties and the once-per-day nomination rules are all checked.
- LiveKit tokens are always minted deaf and mute, and permissions are raised only through the server API after the delay.

## How it works

```
shared/       characters, night order, setup counts, types (used by client and server)
server/src/
  game.ts     authoritative game engine (rooms, delay, phases, votes, abilities, Grimoire)
  views.ts    per-viewer redaction: the only thing sent to clients
  voice.ts    LiveKit token minting and server-side permission control
  lobby.ts    game registry, socket binding, reconnection, action dispatch
  index.ts    Express + Socket.IO entry point
client/src/
  net.ts      socket and store, seat-token reconnection
  voice.ts    LiveKit client (joins only the room the server tells it to)
  components/ Lobby, GameScreen, TownSquare, Overlays, Storyteller (Grimoire/Setup/Night)
```

**Server-enforced audio:** each location (the Town Square, each side room, the Storyteller's Study, each night chamber) is its own LiveKit room. Tokens grant *no* publish or subscribe rights. The server raises them through LiveKit's RoomService API only when the game engine allows it, and removes the participant from their previous room when they move. A modified client can't listen in anywhere. Room chat goes through the same checks.

**Hidden information:** the full game state never leaves the server. `views.ts` builds one view per seat. The Storyteller gets a separate view with the Grimoire, the bluff/real flag on ability uses, and the log.

**Reconnection:** each seat has a secret token in `localStorage`, so reloading or reconnecting puts you back in the same seat with the same character. If the Storyteller disconnects, the game pauses, freezing timers and votes, and resumes when they return.

## Playing

1. **The Storyteller** creates the game, shares the code, and picks characters, timers, house rules and Fabled in **Setup**. A *Random recommended bag* button fills the official counts.
2. **Deal characters** gives the Storyteller a private review in the Grimoire (Drunk, Lunatic, bluffs). **Reveal** then shows players their characters and starts the private-question queue.
3. **Night:** clicking an avatar (or using the Night order tab) wakes that player into a private chamber with the Storyteller. Players click avatars to choose targets. *Send info card* shows them players, tokens or text. Deaths entered at night are announced at dawn.
4. **Day:** Gather → Open side rooms → Open nominations. A player clicks an avatar to nominate. Then come the accusation and the defence (timed), then the vote, where the clock hand moves round and each player gets 3 seconds. **End day** executes whoever is on the block.
5. **Abilities:** players with a day ability get **Use Ability**. Anyone can **Claim Ability** to bluff a public one (Slayer, Gossip, Juggler). Both look identical to everyone else, and the Storyteller resolves them from a panel that shows real vs. bluff and a suggested outcome.
6. **End the game** from the Grimoire. Every character is revealed to everyone.

During the day, the Storyteller can click any avatar to mute or unmute that player.

## Known limitations (see the Phase 2/3 plan in DESIGN.md)

- Games are saved every few seconds (to Upstash Redis on the hosted site when it is configured, otherwise to a local `.data` folder) and come back paused after a restart.
- Per-character automation is deliberately light, as at a real table. The Virgin and Butler are checked automatically and Klutz/Moonchild have public flows; most other triggered abilities and Traveller vote modifiers (Bureaucrat, Thief, Voudon) are handled by the Storyteller through the Grimoire.
- No user accounts. Identity is per seat token, and *My games* history is stored in each browser.
