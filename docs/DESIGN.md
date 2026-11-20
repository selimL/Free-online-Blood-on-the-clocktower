# Design: Blood on the Clocktower Online

This covers deliverables 1–3: the ambiguities and the assumptions I made for each, the architecture and tech stack, the phased build plan, and the house-rule research. Deliverable 4 (the code) is in the repository. `README.md` explains how to run it.

> **Verification caveat.** The build environment's network policy blocked `wiki.bloodontheclocktower.com`, so I could not read the wiki during development. All rules, and the paraphrased ability descriptions, come from my knowledge of the official rules (Trouble Brewing, Bad Moon Rising and Sects & Violets, plus the official Travellers and Fabled). Check every line in `shared/characters.ts` and the rule points in §1.B against the wiki before you rely on them. The ability text sits in one data file so it is easy to fix.

---

## 1. Ambiguities and assumptions

### A. Contradictions and unclear points in the spec

| # | Requirement | Problem | Assumption made |
|---|---|---|---|
| 1 | "6–10 players" vs. Travellers | Officially, Travellers are extra seats on top of the 5–15 residents. The spec caps players at 10. | The **10-seat cap includes Travellers**. At least 6 non-Traveller players are needed to start. Travellers can join mid-game (house-rule toggle, on by default) only while fewer than 10 seats are taken. |
| 2 | "Name colours: Alive: black/dark" on a dark theme | Black text on a dark background can't be read. | Alive names use **dark ink on a parchment name-plate**. Dead names use light grey on a dark plate with a ghost icon. Both pass WCAG AA contrast. |
| 3 | "Private rooms: at least half the players, rounded up" | "At least" suggests there could be more. | Exactly `ceil(n/2)` private rooms, where n counts players (not the Storyteller). The number updates as players join. |
| 4 | Room cap `floor(n/2)` | Does a joining player (still in the 3-second delay) count? | **Yes.** Joining players count toward the cap, so two people can't race into the last slot. |
| 5 | "3-second join delay applies to every room change, including into the Town Square" | When everyone is pulled to the Square at once (dawn, nominations, an ability use) | Everyone gets the delay, and the alert goes to whoever is already there. On a mass pull, each player gets one "Everyone is gathering…" alert instead of N separate ones. |
| 6 | Where the Storyteller is | The Storyteller needs a location for voice. | The Storyteller is always in exactly one place: a room, the "Storyteller's Study" (private questions, Artist/Savant), or a woken player's night chamber. They move instantly, and other people are told. |
| 7 | Night: "No sleeping player can see or hear anything" vs. "waking a player … sees the other avatars" | Can two woken players hear each other? | **No.** Each woken player gets their own private night chamber with the Storyteller. If the Storyteller wakes several players at once, they can see and choose targets in parallel, but the Storyteller's voice is with one chamber at a time (the one most recently woken or selected). |
| 8 | "Voting… each player gets 3 seconds" | Can players raise a hand before their turn (as in person)? | Yes. Players can raise or lower their hand at any time until the "clock hand" reaches them. On their turn the choice locks after 3 seconds. A dead player who locks a Yes spends their ghost vote. Players who can't vote (dead with no ghost vote) are skipped instantly. |
| 9 | Accuser/accused speaking time | Should other players be muted automatically? | Not by default. The speaker is spotlighted. The house rule "Auto-mute during accusations" mutes everyone except the speaker and the Storyteller. The Storyteller can always mute by hand. |
| 10 | Execution timing | The spec doesn't say when the "about to die" player is executed. | Following the official rules, the player on the block is executed **when the Storyteller ends the day**. The Storyteller can also "Execute now" from the Grimoire (Virgin, Mastermind, and so on). Only one execution per day is allowed (the Butcher Traveller can override this through the Storyteller). |
| 11 | [Claim Ability] "identical to a real use" | Real and bluffed uses would have different results and different timing. | **Every** public ability use, real or bluffed, waits for the Storyteller to resolve it. The server sends exactly the same public event shape for both, and the only difference lives in a Storyteller-only channel. The one-use limits for bluffed claims are tracked the same way as for real uses. |
| 12 | Which day abilities get [Use Ability] | Only a few characters have a day-time ability. | Public, fakeable abilities: **Slayer** (target), **Gossip** (statement), **Juggler** (statement, day 1 only). Private abilities: **Artist**, **Savant**, which take you to a private session with the Storyteller. Claim Ability only offers the public ones. Triggered abilities (Virgin, Klutz, Moonchild, Gunslinger, and so on) are resolved by the Storyteller from the Grimoire. |
| 13 | How much the game automates | The spec says "the game applies the result", yet the Storyteller has full control. | Hybrid. The server automates bookkeeping: seats, votes, thresholds, ghost votes, "about to die", nominations once per day, room caps, timers, and audio. For the Slayer it **suggests** the correct outcome, factoring in drunk and poisoned reminders, the Drunk, and the Recluse/Spy "might register" cases. The Storyteller confirms with one click. Night abilities are run by the Storyteller (wake, choose, info card), as in the real game. |
| 14 | Lunatic's fake evil team | How many members, and are fake bluffs needed? | When characters are dealt, the server picks random players matching the number of Minions in play as fake Minions, plus 3 fake bluffs. The Storyteller can change them. The Lunatic's data is identical in shape to the real Demon's. |
| 15 | Alignment changes ("(evil)" must update) | Does a newly evil player learn the team? | The evil-team marker is **computed live** from current alignments, so the Goon or a Snake-Charmed player sees the team immediately, and the team sees them. Any Storyteller alignment change takes effect at once. |
| 16 | Hidden list count | "Whether the exact number is shown is the Storyteller's choice." | Either "+ N hidden characters" or "+ some hidden characters". |
| 17 | "Separate chat" | Text chat isn't otherwise described. | Room-scoped text chat follows the **same server routing as audio**: room membership, the join delay, mutes, and night. It's delivered as live events with no history, so a newcomer can't read earlier messages. |
| 18 | "Rejoin into the same seat" | How do we identify the player? | Each seat has a random secret token stored in `localStorage`. Rejoining with that token restores the seat. If you lose the token, the Storyteller can hand the seat over again (Phase 2). |
| 19 | Region selection | Nothing says who picks the region. | Each client pings every configured region. When the game starts, the server picks the region that **minimises the worst player RTT**. The Storyteller can override this in setup. |
| 20 | Showing a character to prove a claim | It's forbidden, but a browser can always be screenshotted. | Software can't stop screenshots. The house rule "Allow character reveals" adds a server-mediated reveal. It is off by default. The reveal shows the character the player *believes* they are, so a Drunk "proves" a false character, which matches the official rules. |
| 21 | Demon bluffs | The spec doesn't mention them. | Follow the official rule: the Demon gets 3 not-in-play good characters, chosen at random and editable by the Storyteller. They aren't given in games of 6 or fewer players unless the house rule turns them on. |

### B. Official-rule points I relied on (please verify on the wiki)

- **Teensyville (5–6 players):** Minion info and Demon info (including bluffs) are skipped. With 6 players, the "(evil)" markers and bluffs are therefore **not** shown unless the house rule "Evil info in small games" is on.
- **Setup counts** (Townsfolk/Outsiders/Minions/Demon): 5: 3/0/1/1, 6: 3/1/1/1, 7: 5/0/1/1, 8: 5/1/1/1, 9: 5/2/1/1, 10: 7/0/2/1. These are shown as a guide only.
- **Nominations:** only living players may nominate, each once per day. Each player may be nominated once per day. Self-nomination is allowed. Dead players may be nominated.
- **Votes:** voting starts with the player clockwise from the nominee, goes clockwise, and the nominee votes last. To be on the block, a nominee needs at least half the living players (rounded up) **and** more votes than the current highest. A tie clears the block. Each dead player has one ghost vote, spent when they vote Yes.
- **Exile (Travellers):** anyone, alive or dead, may call for an exile. The threshold is half of **all** players. Ghost votes aren't spent. An exile isn't an execution, abilities don't affect it, and any number may happen per day.
- **Travellers:** the player picks the Traveller; the Storyteller picks its alignment, which only the Traveller and (if evil) the Demon learn.
- **Resurrection:** a resurrected player regains their ability, even a used one.
- **Winning:** good wins when the Demon dies; evil wins when only two non-Traveller players are alive. Some characters add conditions (Saint, Mayor, Klutz, Evil Twin, Vortox, Mastermind).
- **Character tokens:** players may say anything, but may not show their character token.
- **Deaths:** the Storyteller announces who died, not how, and doesn't reveal characters until the game ends.

---

### C. Changes made to match the rules reference PDF

The user supplied `BotC_Rules_and_Characters.pdf` (a paraphrased rules and character reference). Most of it already matched this implementation: setup counts, first night, nominations, voting, the block, Teensyville and almost all ability descriptions. Only the points that differed were changed:

| Area | Before | Now (per the PDF) |
|---|---|---|
| Exile | Each Traveller could face exile once per day | Any number of exiles per day |
| Virgin | Storyteller used "Execute now" by hand | Checked automatically when nominated: a sober Virgin's first nomination by a Townsfolk executes the nominator at once and closes nominations. The Spy case is flagged to the Storyteller. The ability is spent either way |
| Butler | Honour system | Checked at tally time: a sober, living Butler's Yes only counts if their master (their latest night choice) also voted Yes |
| Lunatic | Demon not told | The Demon's notes get "The Lunatic is X" at reveal, and each Lunatic night choice |
| Resurrection | Used abilities stayed used | Reviving a player restores their day ability |
| Klutz, Moonchild | Storyteller only | Public "choose a player" flow once dead, through Use Ability or Claim Ability (bluffable); the Storyteller resolves, nothing dies on the spot |
| Travellers | Storyteller assigned the character; evil Travellers saw the whole evil team | The player picks the Traveller; the Storyteller sets alignment; only the Traveller and the Demon know an evil Traveller |
| Winning | Storyteller only | The Storyteller sees a win hint (Demon dead / two players left). The game still never ends on its own, so the Scarlet Woman, Zombuul and Mastermind work |
| Baron, Godfather | "+2 Outsiders", "−1 or +1 Outsider" | Setup notes say the Townsfolk count adjusts to keep the total |
| Setup warnings | — | Bad Moon Rising and Sects & Violets warn below 7 players; a Teensyville note shows at 6 |
| Custom scripts | Phase 2 | Import Script Tool JSON (`_meta`, objects, `fortune_teller` spellings). Unknown or Experimental ids are listed and skipped |
| Fabled | No Deus ex Fiasco; Duchess "visit you"; Djinn "special rule" | Deus ex Fiasco added; Duchess visits a chosen player; the Djinn announces jinxes (Storyteller-written text shown to all) |
| House rules | — | New toggles from the PDF, listed in §4 |

**Not implemented from the PDF:**
- Jinxes. No official jinx pairs apply within the three base editions; the Djinn text box covers custom scripts.
- PDF house rules that only concern Experimental characters (Hatter, Ogre, Poppy Grower, Marionette, Amnesiac, Cult Leader, Huntsman, Legion).
- "Pat-a-cake" and "Charmed Truly", which the Storyteller can already do by hand.

## 2. Architecture and tech stack

```
 Browser (React + Vite)                     Game server (Node 22, TypeScript)
 ┌───────────────────────────────┐   WSS    ┌─────────────────────────────────────┐
 │ socket.io-client  ────────────┼─────────▶│ Socket.IO gateway (auth by seat token)│
 │   receives ONLY its own view  │◀─────────┤ Lobby (many isolated Game instances)  │
 │ livekit-client (WebRTC)       │          │ Game: authoritative state machine     │
 │   joins 1 media room at a time│          │ views.ts: per-viewer redaction        │
 └──────────────┬────────────────┘          │ voice.ts: issues LiveKit tokens and   │
                │ WebRTC (UDP/TURN)         │   sets permissions through the server  │
                ▼                           │   API (RoomService)                   │
 ┌──────────────────────────────────┐       └──────────────┬──────────────────────┘
 │ LiveKit SFU — region EU / NA / AS │◀──── RoomService API ─┘
 │ (embedded TURN/TLS on 443)        │
 └──────────────────────────────────┘
```

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere. One `shared/` folder holds characters, types and rules. | Client and server share the rules data and types. |
| Realtime | **Socket.IO** over WebSocket | Rooms, acks, automatic reconnection and fallbacks. |
| Voice/video | **LiveKit** SFU (self-hosted or LiveKit Cloud) | Its server API can set **per-participant publish/subscribe permissions** and remove participants, which is what server-side enforcement needs. It has an embedded TURN server, multi-region support, and speaking detection. |
| Client | React 18 + Vite, with plain CSS for the theme and procedural SVG for the avatars and the town | No asset licensing problems, and it's light. |
| State | In-memory per game (MVP). Phase 3 adds Redis snapshots so the server can restart without ending games, plus sticky sessions. | 10-player games are tiny. |
| Tests | Vitest unit tests on the game engine and the redaction layer | Hidden-information leaks are the biggest risk. |

### How server-side audio enforcement works (spec §2, last bullet)

1. Each in-game location maps to its own LiveKit room, `"<gameId>__<location>"`: the Town Square, each private room, the Study, and each night chamber.
2. The server is the only thing that mints LiveKit tokens. **Every token grants `canPublish=false, canSubscribe=false`** and expires after 60 seconds. A modified client, or a replayed old token, gets into a room deaf and mute.
3. After the server's own checks pass (the player is in that location, the 3-second join delay is over, they're not muted by the Storyteller, it isn't night, and so on), it **raises the permissions through the LiveKit RoomService API**. When any of those facts changes, the server lowers them again.
4. When a player changes location, the server also calls `removeParticipant` on their old room, so a client can't "stay behind".
5. At night, sleeping players get *no* room. A woken player is moved to their own night chamber with the Storyteller.

The client can't change any of this, because the SFU enforces the permissions. Text chat goes through the same `canHear` / `canSpeak` checks on the server.

### Hidden information

`server/src/views.ts` builds one view per viewer. The full `Game` object never leaves the server. A player's view contains:

- public seats: name, avatar, alive status, ghost vote, claim label, location, mute flag;
- **their own** *perceived* character (the Drunk sees their fake Townsfolk, the Lunatic sees a Demon);
- their info cards;
- the evil-team list, only when allowed. For the Lunatic it is the fake list, which has the same shape as the real one.

Ability events have one public shape with no "bluff" field. The Storyteller receives a separate private resolution object. Unit tests check, for every seat, that no other player's true character, alignment or bluff status shows up in the serialised view.

### Multi-region

`LIVEKIT_REGIONS` holds a JSON list of `{name, url, apiKey, apiSecret}`. Clients measure RTT to each region. When a game starts, the server picks the region that minimises the worst RTT across players. With LiveKit Cloud, set a single region, because Cloud routes to the nearest edge on its own.

---

## 3. Phased build plan

**Phase 1 — MVP (implemented in this repository)**
1. Lobby: create a game (public or private), browse public games, join by code or link, invite links, isolated game instances, and rejoin with a seat token.
2. Avatar creator, seats, and the Storyteller reordering or kicking players.
3. Rooms: the Town Square plus `ceil(n/2)` private rooms with the `floor(n/2)` cap, a town map sidebar, the 3-second join delay with an alert, and instant (announced) Storyteller joins.
4. Voice: LiveKit with server-enforced permissions, an optional camera, a speaking indicator, Storyteller mutes, and night silence. Room chat follows the same rules.
5. Setup: characters from all three editions, a per-type toggle, recommended counts, public-list visibility and hiding, timers (each can be "manual"), house-rule toggles, Fabled, and Bootlegger text.
6. Dealing (including the Drunk's and Lunatic's shown characters, Demon bluffs and the Lunatic's fake team), and the Storyteller reviewing before revealing.
7. Private-question session with a queue, "Next player", and an "(x/y)" indicator.
8. Night: the darkened view, the Night Order panel (first night vs. other nights, filtered to characters in play), wake and sleep, players choosing targets by clicking avatars, info cards, and night deaths revealed at dawn.
9. Day: stages (discussion → private rooms → nominations), nominations, accuser and defence timers, sequential 3-second voting, a live tally, the threshold, "about to die", and execution at dusk.
10. Day abilities: [Use Ability] for Slayer, Gossip, Juggler, Artist and Savant; [Claim Ability] for bluffs; identical public flow; Storyteller resolution with a suggested outcome.
11. Grimoire: every true character and alignment, the perceived character, reminders, kill, revive and execute, the ghost vote, changing characters and alignments, the Lunatic's fake team, Storyteller notes, ending the game with a full reveal, and pausing when the Storyteller disconnects.
12. Gothic theme, day and night transitions, death effects, the P shortcut, and a simplified mobile layout.

**Phase 2 — Fuller rules**
- Traveller exile flow polish (implemented in basic form: nominating a Traveller starts an exile vote), with the Traveller's character shown publicly.
- Per-character helpers: Spy/Widow "show Grimoire" at night, Butler master marker on votes, vote-modifying Travellers (Bureaucrat, Thief, Voudon), Organ Grinder (secret votes).
- Automatic win-condition hints (Saint, Mayor, Demon dead, 2 alive).
- A script importer (official script JSON from the Script Tool).
- Handing over a seat when a player loses their token.

**Phase 3 — Operations and scale**
- Redis persistence and horizontal scaling (Socket.IO Redis adapter, games pinned to a node).
- Auth (OAuth or magic link), rate limits, reports and bans.
- A LiveKit webhook receiver as a second line of defence (kick any participant whose room doesn't match the server's state).
- Load tests (50 or more concurrent games), TURN-only network tests, and accessibility audits.
- Asset and licensing review before any public release (see §5).

---

## 4. House rules (research)

The game wiki and community sites were blocked during development, so I couldn't recheck the sources below live. Each item says where it comes from: the **official rules or wiki**, common **community practice** (r/BloodOnTheClocktower, the official Discord, clocktower.online's settings), or something **made up for this project**. Please spot-check them before you rely on them.

| Toggle | Default | Source / note |
|---|---|---|
| Ghosts may join private rooms | **On** | Official: the dead can still talk freely. Some groups restrict this. |
| Private rooms during nominations | **Off** | Community practice and clocktower.online convention: everyone stays in the Square for nominations. |
| Private rooms at night | **Off (not toggleable)** | Official: no talking at night. Kept out of the toggles so night silence is always enforced. |
| Allow character reveals ("show your sheet") | **Off** | Official rule forbids showing your character token. Some casual groups allow it. |
| Allow Travellers mid-game | **On** | Official (Travellers rules on the wiki). Some groups forbid them. |
| Private-room time cap per day (minutes) | **Off** | Community, used for online pacing. |
| Timers auto-advance phases (vs. advisory) | **On** | Community, used on online servers. Turn it off for Storyteller-controlled days. |
| Anonymous vote results | **Off** | Official votes are public hands. Anonymous voting resembles the official Organ Grinder minion. |
| Auto-mute others during accusation and defence | **Off** | Community etiquette from streamed games. |
| Evil info in small games (5–6 players) | **Off** | Official Teensyville rules skip Minion and Demon info. |
| Announce cause of death | **Off** | Official Storytellers don't say how someone died. Some casual groups do. |
| Reveal character on death | **Off** | Casual/beginner variant. Not official. |
| Whisper limit: side-room visits per day | **Off** | PDF: table/online convention ("Whisper limits") |
| Whisper limit: players per side room | **Off** (default cap is half the players) | PDF: table/online convention ("Whisper limits") |
| Speed round | **Off** | PDF: table/online convention. Adds a Storyteller stage: each living player gets a timed spotlight in seat order before nominations |
| Open vote record | **Off** | PDF: table/online convention. A "Vote record" tab for every nomination this game |
| Grimoire reveal at end | **Off** | PDF: table/online convention. Also reveals alignments, believed characters and reminders |
| Beginner mode | **Off** | PDF: adds the Toymaker, Angel and Buddhist Fabled |
| No oaths / No screenshots | **Off** | PDF: table/online conventions. Shown to players under "Table rules" |
| Travellers can't be changed | **Off** | PDF: community house rule (TPI-endorsed). Blocks Grimoire changes to a Traveller's character |
| Ability declaration limit | **Off** | PDF: community house rule (TPI-endorsed). Caps public ability uses (real or claimed) per day |
| Succor for Evil | **Off** | PDF: community house rule. The Demon is told every Traveller's alignment |
| Holy Spirit ruling | **Off** | PDF: community house rule. Shown to players as a table rule; the Storyteller applies it |
| Bootlegger (custom rules text) | Off (via the Fabled list) | Official Fabled: "This script has homebrew characters or rules." The Storyteller writes the rules, and every player sees them. |
| Buddhist / Hell's Librarian / other Fabled | Off | Official Fabled, available in the Fabled picker. These are table-etiquette modifiers that the Storyteller runs. |

---

## 5. Rights and public release

Blood on the Clocktower, its character names, ability text and night order are © The Pandemonium Institute. This project is for **private, non-commercial play among friends**. Before any public release you'd need permission for, or would have to replace, the following:
- the character names and the game-specific mechanics in `shared/characters.ts`. The ability descriptions there are my own paraphrases, not the official wording, but they still describe the publisher's characters;
- the "Blood on the Clocktower" name and any branding, and the edition names;
- any official token artwork. None is included, because avatars and icons are drawn procedurally.

The Pandemonium Institute also publishes its own official online platform. A public release should take that into account.
