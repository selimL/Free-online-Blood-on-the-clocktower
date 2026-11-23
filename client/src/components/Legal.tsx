// Privacy Policy (/privacy) and Terms (/terms), in plain English. They describe what the code
// actually does; keep them in step with the server when features change.

/** The site owner's contact line. Fill this in yourself (an email address or a Discord name). */
export const CONTACT = 'selimleventguvenilir@gmail.com';
const UPDATED = '23 November 2026';

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="legal-page">
      <article className="legal-card parchment">
        <a className="btn small ghost legal-back" href="/">← Back to the lobby</a>
        <h1>{title}</h1>
        <p className="muted small">Last updated: {UPDATED}</p>
        {children}
        <hr />
        <p className="small"><a href="/">← Back to the lobby</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
      </article>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <Page title="Privacy Policy">
      <p>Clocktower Nights is a free, non-commercial fan table for playing <i>Blood on the Clocktower</i> online with friends. This page explains, in plain words, what the site keeps, why, who can see it, and for how long. It is not affiliated with The Pandemonium Institute.</p>

      <h2>You can play without an account</h2>
      <p>You only need a name to join a game. An account is optional: it just lets your figure, finished games and saved scripts follow you to other devices.</p>

      <h2>What is stored, and why</h2>
      <h3>While a game is running</h3>
      <ul>
        <li><b>Your name and figure (avatar)</b>, so other players can see who you are.</li>
        <li><b>The game itself</b>: seats, characters, votes, deaths, timers, the Storyteller's notes and an event log, so the game can be played and survive a server restart.</li>
        <li><b>Game backups</b>: a Storyteller can download a game as a file to their own device and upload it later to carry on. That file stays with them; the site keeps it only as a normal running game.</li>
        <li><b>Whispers to the Storyteller</b>: private messages between you and the Storyteller.</li>
        <li><b>Word listening detections</b> (only in games with a character such as the Mezepheles, and only if you agreed): who said a secret word, when, in which room and who else was there. <b>What you actually said is never kept.</b></li>
        <li>A secret <b>seat code</b> in your browser, so you can rejoin your seat after a reload.</li>
      </ul>
      <h3>If you create an account</h3>
      <ul>
        <li><b>Name and password</b>: your account name and your password, stored only as a scrambled one-way "hash" (nobody, including the site owner, can read your password).</li>
        <li><b>Your display name and figure</b>, your <b>finished-game history</b> (game name, date, your character, team, result, MVP) and your <b>saved scripts</b>.</li>
        <li><b>Sign in with Google</b>: your Google account ID and your name. Google also tells us your email address during sign-in, but we do not save it.</li>
        <li><b>Email login link</b>: your email address.</li>
        <li>A <b>login session</b> code, so you stay signed in.</li>
      </ul>

      <h2>What is NOT stored</h2>
      <ul>
        <li><b>Voice audio.</b> Voice and video are live only and are never recorded.</li>
        <li><b>Room chat.</b> Messages are delivered to the people in the room and not kept; there is no chat history.</li>
        <li><b>Lobby chat history.</b> The public lobby chat keeps only the last 50 messages (name, text, time) in the server's memory; they vanish on a restart and are never saved to the database. Anyone visiting the lobby can read them, and the site owner can remove them.</li>
        <li><b>Speech transcripts.</b> With word listening, your browser turns speech into text, the server checks it for the secret words and immediately throws it away.</li>
        <li>Payment details: the site is free and never asks for them.</li>
      </ul>

      <h2>Services the site uses</h2>
      <ul>
        <li><b>Render</b> (hosting): runs the website and game server. Like any web host it sees your IP address and may keep short technical logs.</li>
        <li><b>Upstash</b> (database): stores saved games, accounts and login sessions.</li>
        <li><b>LiveKit</b> (voice): carries live voice (and video, if you turn your camera on) between players in the same room. Nothing is recorded. Your browser also measures how fast it can reach LiveKit's servers to pick the closest one.</li>
        <li><b>Your browser's speech service</b> (Google, in Chrome and Edge): only for players who agree to word listening, and only while their microphone is live; it receives the audio in order to turn it into text.</li>
        <li><b>Google sign-in</b>: only if you choose it. Google confirms who you are and shares your Google ID, name and email address with the site.</li>
        <li><b>Resend</b> (email): only if you use the email login link; it receives your email address to send you the link.</li>
        <li><b>Google Fonts</b>: the site's lettering is loaded from Google, so your browser contacts Google when the page opens.</li>
      </ul>

      <h2>How long it is kept</h2>
      <ul>
        <li><b>Games</b> (including whispers and word-listening detections): removed from the server after 1 hour once a game has ended, or after 2 hours with nobody connected. The saved copy is deleted at most 12 hours after the game last changed. Scheduled games are kept until a few hours after their planned start.</li>
        <li><b>Login sessions</b>: 90 days. Email login links work once, for 15 minutes.</li>
        <li><b>Accounts</b>: until the account is deleted.</li>
        <li><b>IP addresses</b> are kept in memory for about 15 minutes to stop people guessing passwords.</li>
        <li><b>Things saved only in your own browser</b> (your notes on players, private scribbles, volume, voice and alert settings, figure, game history and scripts if you are not signed in): they stay on your device until you clear your browser's site data. The site never sees your notes.</li>
      </ul>
      <p>The site uses your browser's local storage for these, not advertising or tracking cookies. There are no ads and no analytics.</p>

      <h2>Who can see what</h2>
      <ul>
        <li><b>Everyone in a game</b> sees names, figures, who is alive, public votes and announcements, and anything said in their own room.</li>
        <li><b>Only the Storyteller</b> (and any co-Storyteller they invite) sees the Grimoire (everyone's character), the whispers sent to them, and the word-listening detections. <b>Other players never see these</b>, until the end-of-game story reveals the characters and the event log to everyone.</li>
        <li><b>The site owner</b> (on the admin page) can see the list of running games and accounts (display name, account name or email, number of saved games), close games and reset passwords. They cannot see passwords.</li>
      </ul>

      <h2>Deleting your account, or questions</h2>
      <p>To delete your account and everything saved with it, or to ask anything about this policy, contact the site owner: <b>{CONTACT}</b>.</p>

      <h2>About this site</h2>
      <p>This is a non-commercial fan project for private play among friends. <i>Blood on the Clocktower</i> is © The Pandemonium Institute; this site is not made, endorsed or supported by them.</p>
    </Page>
  );
}

export function TermsPage() {
  return (
    <Page title="Terms of Use">
      <ul className="terms-list">
        <li><b>A free fan project.</b> Clocktower Nights is free and non-commercial, made for private games among friends.</li>
        <li><b>Be respectful.</b> No harassment, hate or abuse, in voice, chat or names.</li>
        <li><b>No cheating.</b> Don't share screenshots or screen-share your character card or night information, and don't use other tricks to see what you shouldn't.</li>
        <li><b>The site owner can step in.</b> The admin can close games and remove accounts, for example if they are misused or abandoned.</li>
        <li><b>No warranty.</b> The site is provided as it is. It may be down, lose a game or change at any time, and we can't promise it will always work.</li>
        <li><b>Your privacy</b> is described in the <a href="/privacy">Privacy Policy</a>.</li>
        <li><b>Questions:</b> {CONTACT}.</li>
      </ul>
      <p className="small"><i>Blood on the Clocktower</i> is © The Pandemonium Institute. This is an unofficial, non-commercial fan project for private play, not affiliated with or endorsed by The Pandemonium Institute.</p>
    </Page>
  );
}

/** Small "Privacy · Terms" links for footers and dialogs. */
export function LegalLinks({ className = '' }: { className?: string }) {
  return <span className={`legal-links ${className}`}><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></span>;
}
