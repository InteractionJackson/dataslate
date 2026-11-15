# dataslate

Keep score in your Warhammer 40k games. A mobile-first score keeper built from the Figma frame `data-slate-1` (node 1:124).
Plain HTML/CSS/JS with no build step and no npm dependencies. Two-player rooms and the spectator display use Firebase, loaded from its CDN only when a room is used.

## Run

```bash
python3 -m http.server 8000
# open http://localhost:8000 (or your machine's LAN IP from a phone)
```

On a phone, use "Add to Home Screen" to run it full screen.

When you change `styles.css`, `app.js`, `fx.js`, `display.js` or `firebase-config.js`, bump the `?v=` number on its link in `index.html` and `display.html`. Otherwise browsers can pair the new page with a cached old stylesheet or script. (`room.js` is loaded with `import()`, so it has no `?v=`.)

## Behaviour

- Round runs 1–5. Command points, Primary and Secondary run 0–99. Buttons disable at the limits.
- Total = Primary + Secondary. It is calculated, so it has no buttons.
- State is saved to `localStorage`, so a reload or a locked phone keeps the score.
- The skull glitches when the round changes, when command points go up, on any Primary or Secondary change, and on Reset and Undo. Scoring Primary or Secondary also makes it happy (+) or angry (−) for about a second.
- Reset clears everything back to round 1 and zero points. An Undo toast stays for 5 seconds in case it was a mis-tap. Reset is disabled when there is nothing to clear.

## Rooms and the display

Two players can share a game from their own phones, and anyone can watch it on a TV, tablet or laptop.

- **Room** (top left) → type your name → **Create room**. You get a 4-character code, such as `K7QX`, shown in the pill.
- The other player taps **Room** and enters the code, or opens the invite link (`/?room=K7QX`), which only asks for their name.
- Each phone scores its own CP, Primary and Secondary. **Round is shared**: either player can move it and both phones follow.
- A line under the skull shows the opponent's total and CP, and says when they're offline.
- **Reset in a room clears only your own scores**, never the shared round. Undo works as in solo play.
- Tap the room pill for **Invite player**, **Copy display link** and **Leave room**. Leaving has an Undo, and your solo game is waiting when you leave.
- A reload, or a phone that was locked, drops straight back into the room and the same seat.
- A third person who tries to join is told the room is full, and can watch instead.

**The display** is `display.html?room=K7QX`. It shows both players side by side (player 1 left), the round, and each player's Total, Primary, Secondary and CP. There is nothing to tap, and it keeps the screen awake. An empty seat shows the join code. A disconnected player's column dims and says Offline. If the display loses its own connection, a Reconnecting banner shows until it's back.

**View-only is enforced by the database, not by hiding buttons.** Only the two seated players can write, each only to their own scores plus the round, and only within the counters' limits. See `database.rules.json`.

### How it works

- Rooms use the [Firebase Realtime Database](https://firebase.google.com/docs/database) with anonymous sign-in. No server code, no build step: `room.js` imports the Firebase SDK (pinned to 13.1.0) from `www.gstatic.com`.
- `room.js` is the only file that talks to Firebase. `app.js` and `display.js` import it lazily, so solo play never loads Firebase and still works offline and from disk.
- Rooms need the page served over http(s). Opened from `file://`, the Room button stays hidden.
- Each device signs in anonymously and its seat stores that uid, which is how the rules tell the players apart and how a reload gets its seat back.
- Writes apply on the phone straight away and sync when the connection allows, so scoring still works on patchy venue Wi-Fi.
- Data shape:

  ```
  rooms/{CODE}
    createdAt
    round                       1–5, shared
    players/p1, players/p2      { uid, name, cp, primary, secondary, online }
  ```

  Codes use A–Z and 2–9, minus I, O, 0 and 1. Total is not stored; it's always Primary + Secondary.

### Rooms setup (one time)

Until `firebase-config.js` has an `apiKey`, the Room button stays hidden and Data Slate is a solo scorer.

1. Create a project in the [Firebase console](https://console.firebase.google.com/). Analytics isn't needed.
2. **Build → Authentication → Get started → Sign-in method**: enable **Anonymous**. Under **Settings → Authorized domains**, add your GitHub Pages domain (e.g. `yourname.github.io`).
3. **Build → Realtime Database → Create database**. Pick a location, then start in **locked mode**.
4. In the database's **Rules** tab, paste the contents of `database.rules.json` and **Publish**. (Or, with the Firebase CLI: `firebase deploy --only database`.)
5. **Project settings → Your apps → Web app (`</>`)**: register an app (no Hosting needed), then copy `apiKey`, `authDomain`, `databaseURL`, `projectId` and `appId` into `firebase-config.js`. These values identify the project; they are not secrets. The rules are what protect the data.
6. Bump `firebase-config.js?v=` in both HTML files, commit, and push.

Rooms are never deleted automatically. Each one is well under 1 KB, so the free Spark plan holds many thousands. Clear out old ones from the console's Data tab if you ever want to.

### Local development with the emulators

Add `?emulator=1` to any URL, e.g. `http://localhost:8000/?emulator=1`, to use the local Firebase emulators instead of the real project. The Room button appears even without a config, and invite and display links keep the flag.

```bash
npx firebase-tools emulators:start --only auth,database --project demo-dataslate
```

`firebase.json` points the emulators at `database.rules.json`, so the rules are tested locally too.

## Assets

`assets/` holds these exports from the Figma file. The add and subtract icons are inlined in `index.html` with `fill="currentColor"`, so they work when the page is opened from disk and take their colour from the button (#949494 on the dark minus button, as its Figma instance is). The skull is inlined too (top of `<body>` in `index.html` and `display.html`), so `fx.js` can swap its eyes for the happy and angry faces from the interactionjackson.com skull. If you replace one of these files, update its inline copy too.

| File           | Figma node                                           |
| -------------- | ---------------------------------------------------- |
| `skull.svg`    | 1:127 `ij-skull-neutral`                             |
| `add.svg`      | 1:36 `Interface-Essential / Remove/Add / add`        |
| `subtract.svg` | 1:40 `Interface-Essential / Remove/Add / subtract`   |

`favicon-32.png` (browser tab) and `apple-touch-icon.png` (180px, iPhone home screen) are resized from a 400px skull icon on `#181818`. Regenerate both if the skull changes.

