# Cougar Crossing 🏈

A BYU football-themed multiplayer crossing game for up to **40 players per room**. Return the football through rival defenders, ride rafts across rivers, and stay ahead of the pressure line.

Play alone, invite your team into a private room, or join the public game.

## Features

- **Solo and multiplayer:** independent solo games, private rooms with six-character codes, and a public room.
- **Up to 40 players:** fill empty spots with server-controlled practice bots.
- **Two game modes:** a 1,200-yard course or an endless return.
- **Three difficulty settings:** Easy, Normal, and Hard.
- **100-yard stages:** opponents and difficulty change as you advance. Endless mode continues increasing the pressure on later laps.
- **One life per round:** avoid defenders, water, sidelines, blocking sleds, blitzes, and the advancing pressure line.
- **Manual starts and restarts:** read the instructions and invite teammates before pressing **Start game**.
- **Game-day atmosphere:** BYU uniforms, kickoff animation, stadium crowds, optional audio, touchdown celebrations, and final distance rankings.
- **Mixed-length rafts:** slogans include “Go Cougs,” “Kiss Me Cosmo,” “Down Utes,” and “Rise & Shout.”
- **Desktop and mobile controls:** keyboard, on-screen buttons, and field gestures.

## How to play

1. Choose **Play solo**, **Create team**, or enter a room code and select **Join**. You can also stay in the public game.
2. Open **Settings** to choose your name, difficulty, game mode, or practice bots.
3. If playing with friends, select **Invite teammates** in your private room and share the invitation.
4. The captain presses **Start game** when everyone is ready.
5. Cross lanes, ride rafts, and keep moving forward. The pressure line keeps closing in when you pause.

| Control | Action |
| --- | --- |
| ↑ or W | Move forward |
| ← or A | Move left |
| → or D | Move right |
| On-screen arrows | Touch movement controls |
| Settings | Change game options or manage your room |
| Sound | Mute or enable audio |

Backward movement is disabled. There are no extra lives. Eliminated players watch the remaining runners. New arrivals during a round wait for the next kickoff.

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
