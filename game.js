'use strict';
// This module is also embedded verbatim into index.html for identical prediction.
function createGameRules(mode = 'easy', gameMode = 'course') {
  const MAX_PLAYERS = 40;
  const endless = gameMode === 'endless';
  const MODES = Object.freeze({
    easy: Object.freeze({label:'Easy', speed:1, spacing:1, raft:1, gap:1, rest:0, wallDelay:5000, wallSpeed:.45}),
    normal: Object.freeze({label:'Normal', speed:1.25, spacing:.9, raft:.94, gap:1.12, rest:1, wallDelay:4000, wallSpeed:.6}),
    hard: Object.freeze({label:'Hard', speed:1.55, spacing:.8, raft:.86, gap:1.25, rest:2, wallDelay:3000, wallSpeed:.8})
  });
  const profile = Object.prototype.hasOwnProperty.call(MODES, mode) ? MODES[mode] : MODES.easy;
  const WIDTH = 12, HOP_MS = 160, STEP_MS = 190, RADIUS = 0.24;
  const STAGE_YARDS = 100, YARDS_PER_ROW = 5, ROWS_PER_STAGE = STAGE_YARDS / YARDS_PER_ROW;
  // Opponent schedule order supplied by the host; difficulty increases by stage.
  const OPPONENTS = [
    {name:'Utah Tech', short:'UT', color:'#ba1c35', accent:'#083454'},
    {name:'Arizona', short:'AZ', color:'#ab0520', accent:'#123255'},
    {name:'Colorado State', short:'CSU', color:'#27634b', accent:'#d8c391'},
    {name:'TCU', short:'TCU', color:'#633895', accent:'#e4d6ff'},
    {name:'Iowa State', short:'ISU', color:'#a71930', accent:'#ffd34d'},
    {name:'Notre Dame', short:'ND', color:'#c7a75d', accent:'#112852'},
    {name:'UCF', short:'UCF', color:'#252a30', accent:'#d8bf80'},
    {name:'Arizona State', short:'ASU', color:'#8c1d40', accent:'#ffc627'},
    {name:'Utah', short:'UTAH', color:'#cc1234', accent:'#fff'},
    {name:'Baylor', short:'BU', color:'#175b41', accent:'#f5c946'},
    {name:'Kansas', short:'KU', color:'#165fbe', accent:'#ee3c48'},
    {name:'Cincinnati', short:'CIN', color:'#b8223b', accent:'#1d2530'}
  ];
  const laneCache = new Map(), sledCache = new Map(), blitzCache = new Map();
  function memo(cache, key, create) {
    if (cache.has(key)) return cache.get(key);
    const value = create();
    if (cache.size >= 1024) cache.delete(cache.keys().next().value);
    cache.set(key, value); return value;
  }
  const FINISH_ROW = ROWS_PER_STAGE * OPPONENTS.length;
  const mod = (n, m) => ((n % m) + m) % m;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function hash32(value) {
    let h = 2166136261;
    for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function yardNumber(row) {
    if (row <= 0 || row % 2 !== 0) return null;
    const yards = mod(row * 5, 100);
    return yards === 0 ? null : Math.min(yards, 100 - yards);
  }
  function stageFor(row) {
    const yards = Math.max(0, row) * YARDS_PER_ROW;
    const stage = endless ? Math.floor(yards / STAGE_YARDS) : clamp(Math.floor(yards / STAGE_YARDS), 0, OPPONENTS.length - 1);
    const index = mod(stage, OPPONENTS.length);
    return { index, stage, lap: Math.floor(stage / OPPONENTS.length) + 1, team: OPPONENTS[index], startYards: stage * STAGE_YARDS,
      endYards: (stage + 1) * STAGE_YARDS, progress: clamp((yards - stage * STAGE_YARDS) / STAGE_YARDS, 0, 1) };
  }
  function difficulty(row) {
    const matchup = stageFor(row), index = Math.min(matchup.stage, OPPONENTS.length - 1);
    const finalPressure = index === 10 ? 0.10 : index === 11 ? 0.15 : 0;
    const overtime = endless ? Math.max(0, matchup.stage - 11) : 0;
    const trafficPressure = 1 + overtime * 0.035;
    return { index: matchup.index, pressureIndex: index, overtime, tier: matchup.stage + 1,
      roadSpeed: (0.35 + index * 0.12) * (1 + finalPressure) * profile.speed * (1 + overtime * 0.08),
      roadSpacing: Math.max(1.8, (6 - index * 0.24) * (1 - finalPressure * 0.8) * profile.spacing / trafficPressure),
      logSpeed: (0.18 + index * 0.035) * (1 + finalPressure * 0.6) * profile.speed * (1 + overtime * 0.035),
      // Keep later rafts large enough for a visible landing window on every setting.
      logWidth: Math.max(1.55, (2 - index * 0.015 - finalPressure * 0.15) * profile.raft),
      waterGap: (1.5 + index * 0.02 + finalPressure * 0.4) * profile.gap,
      restEvery: Math.min(endless ? 6 : 5, (index < 4 ? 2 : index < 8 ? 3 : 4) + profile.rest + Math.floor(overtime / 4)),
      // Increase the wall's velocity, never its accumulated distance: no milestone teleports.
      wallSpeed: profile.wallSpeed + (endless ? matchup.stage * 0.006 * profile.speed : 0)
        + (overtime * 0.035 + overtime * overtime * 0.0015) * profile.speed };
  }
  function isSledRow(row) {
    const stage = stageFor(row).index, local = mod(row, ROWS_PER_STAGE);
    return stage >= 3 && stage < 10 && (local === 6 || local === 14);
  }
  function generateSleds(seed, row) {
    if (!isSledRow(row)) return [];
    const r = random(hash32(`${seed}:${row}:sleds`)), width = stageFor(row).index >= 6 ? 2 : 1;
    return [{ x: 1 + Math.floor(r() * 3), width }, { x: 7 + Math.floor(r() * 3), width }];
  }
  function sledsFor(seed, row) {
    return memo(sledCache, `${seed}:${row}`, () => Object.freeze(generateSleds(seed, row).map(s => Object.freeze(s))));
  }
  function blocked(seed, x, y) {
    const row = Math.round(y);
    return Math.abs(y - row) < 0.43 && sledsFor(seed, row).some(s => x + RADIUS > s.x + 0.08 && x - RADIUS < s.x + s.width - 0.08);
  }
  function blitzes(seed, stageIndex, seconds) {
    const opponent = endless ? mod(stageIndex, OPPONENTS.length) : stageIndex;
    if (opponent !== 10 && opponent !== 11) return [];
    const pressure = 1 + (endless ? Math.max(0, stageIndex - 11) : 0) * 0.05;
    const warning = Math.max(0.7, (opponent === 10 ? 1.7 : 1.5) / profile.speed / Math.sqrt(pressure));
    const duration = Math.max(0.35, (opponent === 10 ? 1.4 : 1.25) / profile.speed / pressure);
    const period = Math.max(warning + duration + 1, (opponent === 10 ? 8 : 7) / profile.speed / Math.sqrt(pressure)), startRow = stageIndex * ROWS_PER_STAGE;
    return [0, 1].map(zone => {
      const offset = memo(blitzCache, `${seed}:${stageIndex}:${zone}:clock`, () => hash32(`${seed}:${stageIndex}:${zone}:blitz-clock`) / 4294967296 * period);
      const clock = Math.max(0, seconds) + offset, cycle = Math.floor(clock / period), phaseTime = mod(clock, period);
      const column = memo(blitzCache, `${seed}:${stageIndex}:${zone}:${cycle}:column`, () => hash32(`${seed}:${stageIndex}:${zone}:${cycle}:blitz-column`) % WIDTH);
      const fromRow = startRow + (zone === 0 ? 8 : 16), toRow = fromRow - 5;
      const phase = phaseTime < warning ? 'warning' : phaseTime < warning + duration ? 'charge' : 'cooldown';
      const progress = clamp((phaseTime - warning) / duration, 0, 1);
      return { phase, x: column + 0.5, y: fromRow + (toRow - fromRow) * progress,
        fromRow, toRow, stage: stageIndex, cycle, phaseTime, warning, duration, period,
        startsIn: Math.max(0, warning - phaseTime) };
    });
  }
  function baseLane(seed, row) {
    const r = random(hash32(`${seed}:${row}`)), d = difficulty(row);
    // Each opponent boundary has a two-row rest area; later opponents have fewer rest rows.
    const start = mod(row, ROWS_PER_STAGE) <= 1;
    if (row <= 4 || (!endless && row >= FINISH_ROW) || start || row % d.restEvery === 0 || isSledRow(row) || isSledRow(row + 1)) {
      return { type: 'safe', speed: 0, dir: 0, spacing: 0, width: 0, phase: 0, stage: d.index };
    }
    const type = r() < 0.58 + d.pressureIndex * 0.01 ? 'road' : 'river';
    const width = type === 'road' ? 0.85 : d.logWidth;
    const spacing = type === 'road' ? d.roadSpacing + r() * 1.5 : width + d.waterGap + r() * 0.25;
    const raftRandom = random(hash32(`${seed}:${row}:rafts`));
    const raftWidths = type === 'river' ? Object.freeze([
      Math.max(1.55,width-.3),width+.08,width+.65,Math.max(1.55,width-.1+raftRandom()*.2)
    ]) : undefined;
    // A seeded offset varies the order without changing the clear gap between rafts.
    return { type, spacing, width, ...(raftWidths ? {raftWidths,raftOffset:Math.floor(raftRandom()*4)} : {}), stage: d.index,
      speed: type === 'road' ? d.roadSpeed + r() * 0.12 : d.logSpeed + r() * 0.08,
      dir: r() < 0.5 ? -1 : 1, phase: r() * spacing };
  }
  function generateLane(seed, row) {
    // Inspect the unmodified previous row, keeping generation a bounded, pure function.
    // A river always exits onto a dry bank rather than another independently moving lane.
    if (row > 4 && baseLane(seed, row - 1).type === 'river') {
      return { type: 'safe', speed: 0, dir: 0, spacing: 0, width: 0, phase: 0, stage: stageFor(row).index };
    }
    return baseLane(seed, row);
  }
  function lane(seed, row) {
    return memo(laneCache, `${seed}:${row}`, () => Object.freeze(generateLane(seed, row)));
  }
  function obstacles(l, seconds, low = -2, high = WIDTH + 2) {
    if (l.type === 'safe') return [];
    if (l.type === 'river') return rafts(l,seconds,low,high).map(raft=>raft.x);
    const shift = mod(l.phase + l.dir * l.speed * seconds, l.spacing);
    const result = [];
    for (let i = Math.floor((low - shift - l.width) / l.spacing); i <= Math.ceil((high - shift) / l.spacing); i++) {
      result.push(shift + i * l.spacing);
    }
    return result;
  }
  function rafts(l, seconds, low = -2, high = WIDTH + 2) {
    if (l.type !== 'river') return [];
    const widths=l.raftWidths||[l.width],gap=l.spacing-l.width;
    const cycle=widths.reduce((total,width)=>total+width+gap,0);
    const travel=l.phase+l.dir*l.speed*seconds,result=[];
    // Unwrapped travel preserves raft identity and its slogan as it crosses the screen.
    const first=Math.floor((low-travel)/cycle)-1,last=Math.ceil((high-travel)/cycle);
    for(let group=first;group<=last;group++){
      let x=travel+group*cycle;
      for(let slot=0;slot<widths.length;slot++){
        const width=widths[mod(slot+(l.raftOffset||0),widths.length)];
        if(x+width>=low&&x<=high)result.push({x,width,id:group*widths.length+slot});
        x+=width+gap;
      }
    }
    return result;
  }
  function danger(seed, x, y, seconds, airborne = false) {
    if (x < RADIUS || x > WIDTH - RADIUS) return 'sideline';
    const row = Math.round(y), l = lane(seed, row);
    if (blocked(seed, x, y)) return 'blocking sled';
    if (blitzes(seed, stageFor(row).stage, seconds).some(b => b.phase === 'charge' && Math.abs(x - b.x) < RADIUS + 0.3 && Math.abs(y - b.y) < RADIUS + 0.32)) return 'blitz';
    if (l.type === 'road' && Math.abs(y - row) < 0.42) {
      if (obstacles(l, seconds).some(left => x + RADIUS > left && x - RADIUS < left + l.width)) return 'tackle';
    }
    if (l.type === 'river' && !airborne && !rafts(l, seconds).some(raft => x > raft.x - 0.08 && x < raft.x + raft.width + 0.08)) return 'water';
    return null;
  }
  function beginHop(p, dx, dy, now, seed = 0) {
    if (!p.alive || p.hop || now < p.nextStep || !Number.isInteger(dx) || !Number.isInteger(dy) || dy < 0 || Math.abs(dx) + Math.abs(dy) !== 1) return false;
    const y = Math.round(p.y) + dy;
    // River riders keep their continuous drift; every landing on land returns to a cell center.
    const x = (lane(seed, y).type === 'river' ? p.x : Math.floor(p.x) + 0.5) + dx;
    if (x < 0.5 || x > WIDTH - 0.5 || y < -3 || blocked(seed, x, y)) return false;
    p.hop = { x: p.x, y: p.y, tx: x, ty: y, at: now };
    p.nextStep = now + STEP_MS;
    return true;
  }
  function advance(p, now, seed, startedAt) {
    const old = p.simAt;
    if (now <= old || !p.alive) return;
    if (p.hop) {
      const hop = p.hop, amount = clamp((now - hop.at) / HOP_MS, 0, 1);
      p.x = hop.x + (hop.tx - hop.x) * amount;
      p.y = hop.y + (hop.ty - hop.y) * amount;
      if (amount === 1) {
        p.x = hop.tx; p.y = hop.ty; p.hop = null;
        const l = lane(seed, p.y);
        if (l.type === 'river') p.x += l.dir * l.speed * Math.max(0, now - Math.max(old, hop.at + HOP_MS)) / 1000;
        p.score = Math.max(p.score, p.y);
      }
    } else {
      const l = lane(seed, Math.round(p.y));
      if (l.type === 'river') p.x += l.dir * l.speed * (now - old) / 1000;
    }
    p.simAt = now;
  }
  // Physics runs in small increments even though network snapshots remain at 20 Hz.
  // Queue timestamps are authoritative receipt times, preventing commands from starting before arrival.
  function simulate(p, now, seed, startedAt, minY = null) {
    if (!p.alive || now < p.simAt) return null;
    const hazard = () => minY === null ? null : p.y < minY ? 'scroll wall' : danger(seed, p.x, p.y, (p.simAt - startedAt) / 1000, !!p.hop);
    if (now - p.simAt > 1000) advance(p, now - 1000, seed, startedAt);
    let hit = hazard(); if (hit) return hit;
    for (;;) {
      if (p.queued && !p.hop && p.simAt >= Math.max(p.nextStep, p.queued.at ?? p.simAt)) {
        const command = p.queued; p.queued = null; p.ack = Math.max(p.ack || 0, command.seq || 0);
        beginHop(p, command.dx, command.dy, p.simAt, seed);
      }
      if (p.simAt >= now) break;
      let next = Math.min(now, p.simAt + 12.5);
      if (p.hop) next = Math.min(next, p.hop.at + HOP_MS);
      else if (p.queued) {
        const ready = Math.max(p.nextStep, p.queued.at ?? p.simAt);
        if (ready > p.simAt) next = Math.min(next, ready);
      }
      if (next <= p.simAt) next = Math.min(now, p.simAt + 0.001);
      advance(p, next, seed, startedAt);
      hit = hazard(); if (hit) return hit;
      // Stop at the exact landing time so course finish order is authoritative.
      if (!endless && p.score >= FINISH_ROW) break;
    }
    return null;
  }
  function copy(p) { return { ...p, hop: p.hop ? { ...p.hop } : null, queued: p.queued ? { ...p.queued } : null }; }
  function predict(authoritative, pending, now, seed, startedAt) {
    const p = copy(authoritative);
    for (const command of pending) {
      if (command.seq <= p.ack || p.queued && command.seq <= p.queued.seq) continue;
      const at = Math.max(p.simAt, command.at);
      simulate(p, Math.min(now, at), seed, startedAt);
      p.queued = { ...command, at };
      simulate(p, Math.min(now, at), seed, startedAt);
    }
    simulate(p, now, seed, startedAt); return p;
  }
  function interpolationDelay(rtt, jitter = 0) { return clamp(70 + rtt / 2 + jitter * 2, 90, 260); }

  return { MAX_PLAYERS, MODES, profile, endless, withDifficulty: createGameRules, WIDTH, HOP_MS, STEP_MS, RADIUS, STAGE_YARDS, YARDS_PER_ROW, ROWS_PER_STAGE, OPPONENTS, FINISH_ROW, stageFor, difficulty, sledsFor, blocked, blitzes, mod, clamp, hash32, random, yardNumber, lane, obstacles, rafts, danger, beginHop, advance, simulate, predict, interpolationDelay, copy };
}
const Game = createGameRules();
if (typeof module !== 'undefined' && module.exports) module.exports = Game;

// Compact wire format: static roster/settings travel separately from 20 Hz movement.
// Remote positions use float32; authoritative local prediction keeps float64 precision.
const SNAPSHOT_REASONS = ['', 'tackle', 'water', 'sideline', 'scroll wall', 'blitz', 'blocking sled', 'Joining next kickoff', 'eliminated', 'finished'];
function encodeSnapshot(packet, revision) {
  const p=packet.self, count=packet.players.length;
  if(count>Game.MAX_PLAYERS)throw new Error('Too many snapshot players');
  const bytes=new Uint8Array(26+count*9+49+(p.hop?40:0)+(p.queued?14:0)),view=new DataView(bytes.buffer);let at=0;
  const u8=value=>{view.setUint8(at,value);at++;},i8=value=>{view.setInt8(at,value);at++;},u32=value=>{view.setUint32(at,value);at+=4;};
  const f32=value=>{view.setFloat32(at,value);at+=4;},f64=value=>{view.setFloat64(at,value);at+=8;};
  u8(2);u32(revision);f64(packet.t);f64(packet.round.minY);u32(packet.round.pressureStage||0);u8(count);
  for(const row of packet.players){f32(row[1]);f32(row[2]);u8(row[3]?1:0);}
  f64(p.x);f64(p.y);u8(p.alive?1:0);u8(p.lives);f64(p.score);f64(p.nextStep);f64(p.simAt);u32(p.ack);
  const reason=SNAPSHOT_REASONS.indexOf(p.reason||'');u8(reason<0?8:reason);
  u8(p.hop?1:0);if(p.hop)for(const field of ['x','y','tx','ty','at'])f64(p.hop[field]);
  u8(p.queued?1:0);if(p.queued){i8(p.queued.dx);i8(p.queued.dy);u32(p.queued.seq);f64(p.queued.at);}
  return bytes;
}
function decodeSnapshot(data,setup) {
  const view=ArrayBuffer.isView(data)?new DataView(data.buffer,data.byteOffset,data.byteLength):new DataView(data);let at=0;
  const u8=()=>view.getUint8(at++),i8=()=>view.getInt8(at++),u32=()=>{const n=view.getUint32(at);at+=4;return n;};
  const f32=()=>{const n=view.getFloat32(at);at+=4;return +n.toFixed(4);},f64=()=>{const n=view.getFloat64(at);at+=8;return n;};
  if(view.byteLength<26||u8()!==2)throw new Error('Unsupported snapshot');
  const revision=u32();if(!setup||revision!==setup.revision)return null;
  const t=f64(),minY=f64(),pressureStage=u32(),count=u8();
  if(count!==setup.roster.length||count>Game.MAX_PLAYERS||view.byteLength<26+count*9+49)throw new Error('Invalid snapshot roster');
  const players=setup.roster.map(row=>[row[0],f32(),f32(),u8(),row[1],row[2]]);
  const self={x:f64(),y:f64(),alive:!!u8(),lives:u8(),score:f64(),nextStep:f64(),simAt:f64(),ack:u32(),reason:SNAPSHOT_REASONS[u8()]??'eliminated',hop:null,queued:null};
  if(u8())self.hop={x:f64(),y:f64(),tx:f64(),ty:f64(),at:f64()};
  if(u8())self.queued={dx:i8(),dy:i8(),seq:u32(),at:f64()};
  if(at!==view.byteLength)throw new Error('Invalid snapshot length');
  const {roster,revision:ignored,...state}=setup;
  return {...state,t,round:{...setup.round,minY,pressureStage},count,alive:players.reduce((sum,p)=>sum+p[3],0),players,self};
}
Object.assign(Game,{encodeSnapshot,decodeSnapshot});
