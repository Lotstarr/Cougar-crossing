# Cougar Crossing 🏈

A BYU football-themed multiplayer crossing game for up to **40 players per room**. Return the football through rival defenders, ride rafts across rivers, and stay ahead of the pressure line.

Play alone, invite your team into a private room, or join the public game.

## Features

- **Solo and multiplayer:** independent solo games, private rooms with four-digit codes, and a public room.
- **Up to 40 players:** fill empty spots with server-controlled practice bots.
- **Two game modes:** a 1,200-yard course or an endless return.
- **Three difficulty settings:** Easy, Normal, and Hard.
- **100-yard stages:** opponents and difficulty change as you advance. Endless mode continues increasing the pressure on later laps.
- **One life per round:** avoid defenders, water, sidelines, blocking sleds, blitzes, and the advancing pressure line.
- **Manual starts and restarts:** read the instructions and invite teammates before pressing **Play**.
- **Find yourself:** a small course map marks your position with a white YOU marker alongside other runners.
- **Full room leaderboard:** see every entrant after elimination or finishing; standings update while the round continues and become final when the last runner is done.
- **Game-day atmosphere:** BYU uniforms, kickoff animation, stadium crowds, optional audio, touchdown celebrations, and final standings.
- **Mixed-length rafts:** slogans include “Go Cougs,” “Kiss Me Cosmo,” “Down Utes,” and “Rise & Shout.”
- **Desktop and mobile controls:** keyboard, on-screen buttons, and field gestures. Mobile rounds tuck away the header and room controls to maximize the playfield.

## How to play

1. Enter **Your name** above the game (it is remembered on this device). Choose **Solo**, **Host**, or enter a room code or paste an invite link and tap **Join**. You can also stay in the public game.
   New team codes are four digits. Tap the large room code to copy it, or use **Copy invite link** so teammates can open the room directly.
2. Open **Settings** to choose difficulty, game mode, or practice bots.
3. If playing with friends, select **Copy invite link** in your private room and share the invitation.
4. The host presses **Play**. Extra room options and the roster are available in Settings.
5. Cross lanes, ride rafts, and keep moving forward. The pressure line keeps closing in when you pause.

| Control | Action |
| --- | --- |
| ↑ or W | Move forward |
| ← or A | Move left |
| → or D | Move right |
| On-screen arrows | Touch movement controls |
| Settings | Change game options or manage your room |
| Sound | Mute or enable audio |

Backward movement is disabled. There are no extra lives. Finishers become safe spectators while the remaining runners keep playing. A course round ends only after everyone has finished or been knocked out, including the last active runner. Finishers rank by completion time; non-finishers rank by distance. Final standings show every entrant. After elimination or finishing, the full live leaderboard is available immediately, with your row highlighted and your place pinned above the list. Use Spectate to return to spectating and the course map. Eliminated players watch the leading remaining runner; a spectator panel shows their name, remaining runners, and finished count. New arrivals during a round wait for the next kickoff.

Audio begins after your first tap or keypress. The mute setting is remembered on your device.

## Run on your computer

Install a supported Node.js release, then run these commands from the project folder:

```sh
npm ci
npm start
```

Open **http://localhost:3001** in your browser.

Opening `public/index.html` directly will not start the game. Multiplayer requires the Node.js server.

The server uses the `PORT` environment variable when provided; otherwise it listens on port `3001`.

## Deploy on Render — Free plan

Upload the project to a GitHub repository, preserving this structure:

```text
cougar-crossing/
├── server.js
├── game.js
├── package.json
├── package-lock.json
└── public/
    └── index.html
```

Do not upload `node_modules`. Render installs the dependencies during deployment.

1. Sign in to [Render](https://dashboard.render.com/).
2. Select **New → Web Service**.
3. Connect GitHub and select this repository.
4. Configure the service:

   | Setting | Value |
   | --- | --- |
   | Language / Runtime | Node |
   | Branch | Your repository's default branch, usually `main` |
   | Root Directory | Leave blank when `package.json` is at the repository root |
   | Build Command | `npm ci --omit=dev` |
   | Start Command | `npm start` |
   | Instance Type | Free |
   | Health Check Path | `/health` |

5. Create the service and wait for the deployment to show **Live**.
6. Open the generated `onrender.com` link and create a game.

If Render detects Docker because your repository includes the optional Dockerfile, choose **Node** to use the commands above.

No database or API keys are required. Keep one service instance: rooms currently live in that server's memory.

Free hosting has resource and bandwidth limits and can sleep when idle. Rooms reset when the server restarts or redeploys. Test your intended player count on the deployed service before a team event. See [Render's current free-plan limits](https://render.com/docs/free).

## Optional Docker setup

If Docker and Docker Compose are installed, the included configuration can run the game with:

```sh
docker compose up -d --build
```

Open **http://localhost:3001**. The Compose configuration restarts the service after it exits or the host restarts. Public hosting still requires a server and appropriate HTTPS/network configuration.

## Project structure

| File or folder | Purpose |
| --- | --- |
| `server.js` | Express and Socket.io server, rooms, bots, and authoritative game loop |
| `game.js` | Shared seeded generation, movement, collisions, and compact snapshots |
| `public/index.html` | HTML, styling, Canvas renderer, audio, and client networking |
| `scripts/` | Shared-physics synchronization and multiplayer checks |
| `test/` | Automated checks for game rules and networking |
| `docs/DEVELOPMENT.md` | Detailed implementation notes and historical playtest results |

The server runs at **20 updates per second**. Both client and server generate obstacles from the same seed and clock, so full obstacle arrays do not need to be sent each update.

When editing shared physics, synchronize the embedded client copy before deploying:

```sh
npm run sync-physics
```

## Current limitations

- Room codes and active rounds are temporary and are lost when the server restarts.
- Best distance is stored in the player's browser; there are no accounts or permanent online leaderboards.
- The 40-player room limit is enforced by the server. Actual performance depends on hosting resources and players' networks.
- Temporary Mac-hosted tunnel links require the Mac and server to stay running and may expire.

## Fan project

Cougar Crossing is an unofficial fan-made game. It is not affiliated with or endorsed by Brigham Young University, BYU Athletics, or the featured opponents. Team names are used for the football theme; artwork and audio are generated in code.

### Joining and player names

The name field is visible in the lobby on desktop and mobile. Names update automatically, are limited to 16 characters, and follow the player through room changes and reconnects. Blank names use Cougar Fan. No account is needed. Room-code joining accepts lowercase codes, spaced codes, or a full invite link. Joining progress and errors appear beside the room controls; a failed join keeps an existing game intact. Players arriving after kickoff wait for the next round.

### Settings and reconnect behavior

Opening Settings clears movement input and disables the on-screen arrows; live multiplayer play and pressure continue. A reconnect action reconnects the existing session instead of starting another round. The default screen shows only the field, alive count, yards, opponent, movement arrows, and a Settings icon. Solo starts with one click; the host can start the next round with Play again. Extra controls and instructions remain in Settings. Each tab remembers its own player name, while the last chosen name remains the default for new tabs. Renaming on the results screen updates both the standings and the winner announcement.

## Latest multiplayer checks

On October 20, 2026, a 30-second test against the Render deployment connected 40 simulated WebSocket players in a separate private room. The slowest client received 19.66 snapshots/second; 95th-percentile round-trip latency was 157 ms. All clients moved, a full-room session reconnected successfully, and a 41st player was rejected. An initial production mixed-transport check exposed dropped polling updates during long HTTP round trips; polling now uses a bounded batch queue. A local mixed-transport run also passed with 32 WebSocket and eight polling clients, with no server ticks exceeding 50 ms. These are short automated checks, not a guarantee for 40 physical devices or every network.

Mobile layouts are reviewed at 320×568, 390×844, and 844×390. Real iOS/Android keyboard and background-app behavior should still be checked on devices before an event. Reconnecting never pauses the round or grants another life.
