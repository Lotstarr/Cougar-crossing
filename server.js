'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');
const { performance } = require('perf_hooks');
const Game = require('./game');

function createGameServer({ clock, autoTick = true, transports = ['polling','websocket'] } = {}) {
  const epoch = Date.now(), origin = performance.now();
  const now = clock || (() => epoch + performance.now() - origin);
  const app = express(), server = http.createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: 4096, pingTimeout: 10000, transports,
    // Reuse a small compression window for repeated snapshots; auth tokens bypass compression.
    perMessageDeflate: { threshold: 1024, serverMaxWindowBits: 12, clientNoContextTakeover: true,
      concurrencyLimit: 4, zlibDeflateOptions: { level: 1, memLevel: 4 } },
    httpCompression: { threshold: 1024, level: 1, memLevel: 4 }
  });
  const rooms = new Map();
  const tickStats = { ticks: 0, totalMs: 0, maximumMs: 0, overBudget: 0 };
  let timer;
  const cleanName=value=>typeof value==='string'?value.normalize('NFKC').replace(/[^\p{L}\p{M}\p{N} _.'’\-]/gu,'').replace(/\s+/g,' ').trim().slice(0,16)||'Cougar Fan':'Cougar Fan';
  function createRoom(code, kind) {
    const players = new Map();
    const MAX = 40, KICKOFF_MS = 4200, RECONNECT_MS = 15000;
    let round, botMode = false, teamMode = true;
    let selectedDifficulty = 'easy', selectedGameMode = 'course', rules = Game;
    let wallAt = 0, entrantRecords = new Map();
    let setupSignature = '', setupRevision = 0, latestSetup;
    const humans = () => [...players.values()].filter(p => !p.bot);
    const connectedHumans = () => humans().filter(p => p.connected);
    const hostId = () => connectedHumans()[0]?.id || '';
    const alive = () => [...players.values()].filter(p => p.alive);

    function scheduleKickoff(at) {
      round.kickoffAt = at; round.startedAt = at + KICKOFF_MS;
      const receiver = connectedHumans().find(p => p.alive);
      round.kickoff = { receiverId: receiver?.id || '', x: receiver?.x ?? 5.5, y: receiver?.y ?? 0,
        kickAt: at + 1200, catchAt: at + 3100, team: 0 };
    }
    function reset() {
      if (botMode) fill();
      const at = now(); rules = Game.withDifficulty(selectedDifficulty, selectedGameMode);
      wallAt = at;
      round = { id: crypto.randomUUID(), seed: crypto.randomBytes(4).readUInt32LE(0),
        phase: players.size ? teamMode ? 'lobby' : 'kickoff' : 'waiting', minY: -4, difficulty: selectedDifficulty, gameMode: selectedGameMode,
        winner: '', winnerId: '', finishReason: '', entrants: 0, pressureStage: 0, finishers: [] };
      entrantRecords = new Map();
      let index = 0;
      for (const p of players.values()) spawn(p, index++, at);
      round.entrants = alive().length;
      scheduleKickoff(at);
    }
    function spawn(p, index, at) {
      const startY = -(Math.floor(index / 12)) || 0;
      Object.assign(p, { pressureY: startY - 1.5, pressurePeak: startY, pressureAt: at, x: ((index * 7 + 5) % 12) + 0.5, y: startY,
        ready: !!p.bot, alive: p.bot || p.connected, lives: 1, score: 0, hop: null, nextStep: at, simAt: at,
        ack: 0, queued: null, reason: '', finishedAt: null, aiAt: at + 200 + Math.random() * 400 });
      if (p.alive && !['running','over'].includes(round.phase)) entrantRecords.set(p.id,p);
    }
    function add(id, name, bot) {
      const p = { id, name: cleanName(name), bot, connected: true, socketId: bot ? null : id,
        session: bot ? null : crypto.randomBytes(16).toString('hex'), disconnectedAt: null,
        color: bot ? ['#e6eef7','#2375c9','#82a8d3','#a6bdd6'][players.size % 4] : '#ffffff',
        lastAction: -Infinity, inputBudget: 20, budgetAt: now() };
      players.set(id, p); spawn(p, players.size - 1, now());
      if (round.phase === 'running' || round.phase === 'over') { p.alive = false; p.reason = 'Joining next kickoff'; }
      else round.entrants = alive().length;
      return p;
    }
    function fill() {
      while (players.size < MAX) add(`bot-${crypto.randomUUID().slice(0, 8)}`, `Cougar ${players.size + 1}`, true);
    }
    function rename(p,value) {
      p.name=cleanName(value);
      const result=round.standings?.find(row=>row[0]===p.id);if(result)result[1]=p.name;
      if(round.winnerId===p.id)round.winner=p.name;
    }
    function eliminate(p, reason, at) {
      p.alive = false; p.lives = 0; p.hop = null; p.queued = null; p.reason = reason; p.simAt = at;
    }
    function compareResults(a,b) {
      const aFinished=a.finishedAt!==null,bFinished=b.finishedAt!==null;
      if(aFinished!==bFinished)return aFinished?-1:1;
      return aFinished ? a.finishedAt-b.finishedAt || a.id.localeCompare(b.id)
        : b.score-a.score || a.id.localeCompare(b.id);
    }
    function finish(at) {
      round.phase = 'over'; round.frozenAt = at;
      const ranked=[...entrantRecords.values()].sort(compareResults),winner=ranked[0];
      round.winner=winner?.name||'';round.winnerId=winner?.id||'';
      round.finishReason=rules.endless?'endless':round.finishers.length?'course':'survival';
      round.winnerYards=Math.max(0,winner?.score||0)*Game.YARDS_PER_ROW;
      round.standings=ranked.map(p=>[p.id,p.name,Math.max(0,p.score),p.finishedAt!==null?1:0,
        p.finishedAt===null?null:Math.max(0,p.finishedAt-round.startedAt)]);
    }
    function completeCourse(p) {
      p.finishedAt=p.simAt;p.score=Game.FINISH_ROW;p.y=Game.FINISH_ROW;
      p.alive=false;p.hop=null;p.queued=null;p.reason='finished';
      round.finishers=[...entrantRecords.values()].filter(player=>player.finishedAt!==null)
        .sort(compareResults).map(player=>[player.id,Math.max(0,player.finishedAt-round.startedAt)]);
    }
    function playerWall(p) { return Math.max(round.minY, p.pressureY); }
    function advancePressure(p, at) {
      // Each runner brings their own trailing pressure: leaders cannot drag it into teammates.
      const elapsed = Math.max(0, at - Math.max(p.pressureAt, round.startedAt + rules.profile.wallDelay)) / 1000;
      p.pressureAt = at;
      p.pressurePeak = Math.max(p.pressurePeak, p.y);
      if (!elapsed) return;
      const speed = rules.difficulty(round.pressureStage * Game.ROWS_PER_STAGE).wallSpeed;
      const target = p.pressurePeak - 2.5;
      // Close large gaps smoothly, then keep advancing even if the runner stands still.
      p.pressureY = Math.max(p.pressureY + elapsed * speed,
        target - (target - p.pressureY) * Math.exp(-2 * elapsed));
    }
    function simulate(p, at) {
      const hazard = rules.simulate(p, at, round.seed, round.startedAt, playerWall(p));
      if (hazard) eliminate(p, hazard, at);
      else if (p.alive && !rules.endless && p.score >= Game.FINISH_ROW) completeCourse(p);
    }
    function think(p, at) {
      if (!p.alive || p.hop || at < p.aiAt) return;
      p.aiAt = at + 210 + Math.random() * 190;
      const landTime = (at + Game.HOP_MS - round.startedAt) / 1000;
      const candidates = [[0,1],[-1,0],[1,0]].filter(([dx,dy]) => {
        const y = Math.round(p.y) + dy;
        const x = (rules.lane(round.seed, y).type === 'river' ? p.x : Math.floor(p.x) + 0.5) + dx;
        return x >= 0.5 && x <= 11.5 && y > round.minY + 0.4 && !rules.danger(round.seed, x, y, landTime);
      });
      candidates.sort((a,b) => b[1] - a[1] || Math.abs(p.x + a[0] - 6) - Math.abs(p.x + b[0] - 6));
      if (candidates.length) rules.beginHop(p, ...candidates[0], at, round.seed);
    }
    function prune(at) {
      for (const [id,p] of players) if (!p.bot && !p.connected && at - p.disconnectedAt >= RECONNECT_MS) players.delete(id);
    }
    function state(at) {
      return { t: at, round: { ...round }, count: players.size, alive: alive().length, botMode, teamMode,
        members: [...players.values()].map(p => [p.id, +p.bot, +p.connected, +(p.ready || p.id === hostId())]),
        room: info(), hostId: hostId(), humanCount: connectedHumans().length, selectedDifficulty, selectedGameMode,
        players: [...players.values()].map(p => [p.id, +p.x.toFixed(4), +p.y.toFixed(4), +p.alive, p.color, p.name]) };
    }
    function self(p) {
      return { x: p.x, y: p.y, alive: p.alive, lives: p.lives, score: p.score, hop: p.hop, queued: p.queued,
        nextStep: p.nextStep, simAt: p.simAt, ack: p.ack, reason: p.reason };
    }
    function metadata(packet) {
      const {players,t,alive,round:details,...settings}=packet;
      const {minY,pressureStage,...roundInfo}=details;
      const setup={...settings,round:roundInfo,roster:players.map(p=>[p[0],p[4],p[5]])};
      const signature=JSON.stringify(setup);
      if(signature!==setupSignature){setupSignature=signature;setupRevision=(setupRevision+1)>>>0;latestSetup={...setup,revision:setupRevision};}
      return latestSetup;
    }
    function sendState(socket,packet,p,setup,reliable=false) {
      const viewed = p.alive ? p : alive().sort((a,b)=>b.y-a.y)[0] || p;
      const local={...packet,round:{...packet.round,minY:playerWall(viewed)},self:self(p)};
      // Polling needs a small batch between HTTP requests. Volatile delivery discards
      // every intervening tick on distant networks. Bound the queue during stalls.
      const polling=socket.conn.transport.name==='polling';
      const deliver=reliable||polling;
      if(!reliable&&polling&&socket.conn.writeBuffer.length>=12)return;
      if(socket.data.snapshotVersion!==2){if(deliver)socket.emit('state',local);else socket.volatile.emit('state',local);return;}
      if(socket.data.snapshotRoom!==code||socket.data.setupRevision!==setup.revision){
        socket.data.snapshotRoom=code;socket.data.setupRevision=setup.revision;
        socket.compress(false).emit('snapshotSetup',setup);
      }
      const encoded=Game.encodeSnapshot(local,setup.revision);
      if(deliver)socket.compress(false).emit('snapshot',encoded);else socket.compress(false).volatile.emit('snapshot',encoded);
    }
    function tick() {
      const at = now(); prune(at);
      if (!humans().length) {
        if (players.size) players.clear();
        botMode = false; teamMode = true; selectedDifficulty = 'easy'; selectedGameMode = 'course';
        if (round.phase !== 'waiting') reset();
        if (code !== 'PUBLIC') rooms.delete(code);
        return;
      }
      if (round.phase === 'kickoff' && at >= round.startedAt) {
        round.phase = 'running';
        entrantRecords = new Map([...players].filter(([,p])=>p.alive));
        for (const p of players.values()) p.simAt = at;
      }
      if (round.phase === 'running') {
        if (rules.endless) {
          const leaderStage = Math.floor(Math.max(0, ...[...players.values()].map(p => p.score)) / Game.ROWS_PER_STAGE);
          // Room pressure only advances; a leader's elimination never slows the wall again.
          const elapsed = Math.max(0, at - Math.max(wallAt, round.startedAt + rules.profile.wallDelay)) / 1000;
          round.minY += elapsed * rules.difficulty(round.pressureStage * Game.ROWS_PER_STAGE).wallSpeed;
          round.pressureStage = Math.max(round.pressureStage, leaderStage);
          wallAt = at;
        } else {
          round.minY = -4 + Math.max(0, at - round.startedAt - rules.profile.wallDelay) / 1000 * rules.profile.wallSpeed;
        }
        for (const p of players.values()) {
          if (!p.alive) continue;
          advancePressure(p, at);
          simulate(p, at);
          if (p.bot && p.alive) think(p, at);
        }
        // Finishers are safe spectators; the final active runner gets to complete their run.
        if (!alive().length) finish(at);
      }
      const packet = state(at),setup=metadata(packet);
      for (const p of connectedHumans()) {
        const socket = io.sockets.sockets.get(p.socketId);
        if (socket) sendState(socket,packet,p,setup);
      }
    }
    reset();
    function accept(socket) {
      const at = now(); prune(at);
      const session = socket.handshake.auth?.session;
      let p = typeof session === 'string' && /^[a-f0-9]{32}$/.test(session)
        ? humans().find(player => player.session === session) : null;
      const resumed = !!p;
      if (!p) {
        if (players.size >= MAX) {
          const bot = [...players.values()].find(player => player.bot);
          if (bot) players.delete(bot.id);
          else { socket.emit('full'); return; }
        }
        const first = humans().length === 0;
        p = add(socket.id, socket.handshake.auth?.name, false);
        if (first) reset();
      } else {
        if (p.connected && p.socketId !== socket.id) {
          const previous = io.sockets.sockets.get(p.socketId);
          if (previous) { previous.emit('sessionReplaced'); previous.disconnect(true); }
        }
        p.connected = true; p.socketId = socket.id; p.disconnectedAt = null; p.queued = null;
        if (!p.alive && p.lives > 0 && ['lobby','kickoff'].includes(round.phase)) spawn(p, [...players.keys()].indexOf(p.id), at);
      }
      if(resumed&&typeof socket.handshake.auth?.name==='string')rename(p,socket.handshake.auth.name);
      socket.data.playerId = p.id; socket.data.roomCode = code; socket.join(code);
      socket.compress(false).emit('init', { id: p.id, name: p.name, session: p.session, resumed, ack: p.ack, maxPlayers: MAX, room: info() });
      const packet=state(at);sendState(socket,packet,p,metadata(packet),true);
      socket.on('move', input => {
        if (round.phase !== 'running' || !p.alive || !input || typeof input !== 'object') return;
        if (input.roundId !== undefined && input.roundId !== round.id) return;
        const {dx,dy,seq} = input, at = now();
        if (!Number.isSafeInteger(seq) || seq <= p.ack || seq > p.ack + 10000 || !Number.isInteger(dx) || !Number.isInteger(dy) || dy < 0 || Math.abs(dx) + Math.abs(dy) !== 1 || p.queued && seq <= p.queued.seq) return;
        p.inputBudget = Math.min(20, p.inputBudget + (at - p.budgetAt) * .04); p.budgetAt = at;
        if (p.inputBudget < 1) return; p.inputBudget--;
        simulate(p, at); if (!p.alive) return;
        p.queued = { dx, dy, seq, at };
        simulate(p, at);
      });
      socket.on('name', (value,reply) => {
        if(typeof value!=='string')return;rename(p,value);socket.handshake.auth.name=p.name;
        if(typeof reply==='function')reply(p.name);
      });
      socket.on('ready', value => { if (round.phase === 'lobby' && typeof value === 'boolean') p.ready = value; });
      function captainAction(action) {
        if (p.id !== hostId()) { socket.emit('notice','The team captain controls the next kickoff.'); return; }
        if (now() - p.lastAction < 750) { socket.emit('notice','Please wait a moment before the next kickoff action.'); return; }
        p.lastAction = now(); action();
      }
      socket.on('difficulty', value => {
        if (p.id !== hostId() || typeof value !== 'string' || !Object.hasOwn(Game.MODES, value)) return;
        selectedDifficulty = value;
        if (round.phase === 'lobby') { round.difficulty = value; rules = Game.withDifficulty(value, round.gameMode); }
        socket.emit('notice', `${Game.MODES[value].label} difficulty ${round.phase === 'lobby' ? 'selected' : 'set for the next kickoff'}.`);
      });
      socket.on('gameMode', value => {
        if (p.id !== hostId() || !['course','endless'].includes(value)) return;
        selectedGameMode = value;
        if (round.phase === 'lobby') { round.gameMode = value; rules = Game.withDifficulty(round.difficulty, value); }
        socket.emit('notice', `${value === 'endless' ? 'Endless' : '1,200-yard course'} mode ${round.phase === 'lobby' ? 'selected' : 'set for the next kickoff'}.`);
      });
      socket.on('fillBots', () => captainAction(() => {
        botMode = true;
        if (connectedHumans().length === 1 || !['kickoff','running'].includes(round.phase)) { fill(); reset(); }
        else socket.emit('notice','Bots will fill the field at the next kickoff.');
      }));
      socket.on('restart', () => captainAction(() => {
        if (connectedHumans().length > 1 && round.phase !== 'over' && round.phase !== 'lobby') return;
        if (round.phase === 'lobby') { round.phase = 'kickoff'; round.entrants = alive().length; scheduleKickoff(now()); }
        else reset();
      }));
      socket.on('lobby', () => captainAction(() => {
        if (connectedHumans().length > 1 && ['kickoff','running'].includes(round.phase)) return;
        teamMode = !teamMode; reset();
      }));
      socket.on('leave', (_data, reply) => {
        players.delete(p.id); if (typeof reply === 'function') reply(true); socket.disconnect(true);
      });
      socket.on('disconnect', () => {
        if (players.has(p.id) && p.socketId === socket.id) { p.ready = false; p.connected = false; p.disconnectedAt = now(); p.queued = null; }
      });
    }

    function info() { return { code: kind === 'solo' ? '' : code, id: code, kind, label: kind === 'solo' ? 'Solo game' : kind === 'private' ? `Room ${code}` : 'Public game' }; }
    function remove(socket) {
      const p = players.get(socket.data.playerId);
      if (p && p.socketId === socket.id) players.delete(p.id);
      socket.leave(code);
      for (const name of ['move','name','ready','difficulty','gameMode','fillBots','restart','lobby','leave','disconnect']) socket.removeAllListeners(name);
      if (!humans().length && code !== 'PUBLIC') { players.clear(); rooms.delete(code); }
    }
    return { code, kind, players, tick, accept, remove, info, get round() { return round; } };
  }
  const mainRoom = createRoom('PUBLIC', 'public'); rooms.set('PUBLIC', mainRoom);
  function tick() {
    const began = performance.now();
    for (const room of [...rooms.values()]) room.tick();
    const elapsed = performance.now() - began;
    tickStats.ticks++; tickStats.totalMs += elapsed;
    tickStats.maximumMs = Math.max(tickStats.maximumMs, elapsed);
    if (elapsed > 50) tickStats.overBudget++;
  }
  function newRoom(kind) {
    if (rooms.size >= 64) return null;
    let code;
    do { code = String(crypto.randomInt(1000, 10000)); } while (rooms.has(code));
    const room = createRoom(code, kind); rooms.set(code, room); return room;
  }
  function route(socket, request = {}, initial = false) {
    if (!request || typeof request !== 'object') return;
    if (!initial && now() - (socket.data.lastRoomAction || 0) < 750) return socket.emit('roomError', { message:'Please wait a moment before switching rooms again.' });
    socket.data.lastRoomAction = initial ? -Infinity : now();
    const fail = message => socket.emit('roomError', { message, initial });
    const action = request.action || 'public';
    if (!['public','solo','create','join','resume'].includes(action)) return fail('Choose Solo, Create room, or Join room.');
    let destination;
    if (action === 'public') destination = mainRoom;
    else if (action === 'solo' || action === 'create') destination = newRoom(action === 'solo' ? 'solo' : 'private');
    else {
      const code = typeof request.code === 'string' ? request.code.trim().toUpperCase() : '';
      destination = rooms.get(code);
      let freshSolo = false;
      if (!destination && action === 'resume' && socket.handshake.auth?.roomKind === 'solo') {
        destination = newRoom('solo'); freshSolo = true;
      }
      if (!destination) return socket.emit('roomError', { code: 'ROOM_EXPIRED', initial, message: 'This room has closed or expired. Create a new room, join another code, or play Solo.' });
      if (destination.kind === 'solo' && !freshSolo) {
        const owner = [...destination.players.values()].find(p => !p.bot && p.session === socket.handshake.auth?.session);
        if (!owner) return fail('Solo games are private. Create a room to play with friends.');
      }
    }
    if (!destination) return fail('All room slots are in use. Try again shortly.');
    const current = rooms.get(socket.data.roomCode);
    if (current === destination) return fail('You are already in this room.');
    const session = socket.handshake.auth?.session;
    const resume = [...destination.players.values()].find(p => !p.bot && p.session === session);
    if (!resume && destination.players.size >= 40 && ![...destination.players.values()].some(p => p.bot)) {
      if (initial) socket.emit('full');
      return fail('That room is full. Try Solo or create your own room.');
    }
    if(typeof request.name==='string')socket.handshake.auth.name=cleanName(request.name);
    if (current) {
      if(typeof request.name!=='string')socket.handshake.auth.name = current.players.get(socket.data.playerId)?.name || socket.handshake.auth.name;
      current.remove(socket);
    }
    destination.accept(socket);
  }
  app.disable('x-powered-by');
  app.use(express.static(path.join(__dirname, 'public'), { etag: true, setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  } }));
  app.get('/health', (_req,res) => res.json({ ok: true, players: mainRoom.players.size, phase: mainRoom.round.phase, rooms: rooms.size, totalPlayers: [...rooms.values()].reduce((sum,r) => sum + r.players.size, 0) }));
  io.on('connection', socket => {
    socket.data.snapshotVersion=socket.handshake.auth?.snapshotVersion===2?2:1;
    socket.on('clock', (_data, reply) => { if (typeof reply === 'function') reply(now()); });
    socket.on('room', request => route(socket, request));
    const auth = socket.handshake.auth || {};
    route(socket, { action: auth.roomAction || 'public', code: auth.roomCode }, true);
  });
  if (autoTick) timer = setInterval(tick, 50);
  return { app, server, io, tick, rooms, tickStats, players: mainRoom.players, get round() { return mainRoom.round; },
    listen: (port, host = '0.0.0.0') => new Promise((resolve,reject) => { server.once('error',reject); server.listen(port,host,() => {server.off('error',reject);resolve();}); }),
    close: () => new Promise(resolve => { clearInterval(timer); io.close(resolve); }) };
}
if (require.main === module) {
  const game = createGameServer(), port = Number(process.env.PORT) || 3001;
  game.listen(port).then(() => console.log(`Cougar Crossing running at http://localhost:${port}`)).catch(err => {console.error(`Unable to start game: ${err.message}`);game.close().then(()=>process.exit(1));});
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => game.close().then(() => process.exit(0)));
}
module.exports = { createGameServer };
