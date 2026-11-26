'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const G=require('../game');
const {createGameServer}=require('../server');
const {io}=require('socket.io-client');
const player=(x,y,at=1000)=>({x,y,score:y,alive:true,lives:1,nextStep:0,simAt:at,hop:null,lastStarRow:-1,invincibleUntil:0});
test('stars are deterministic, reachable, collectible once per runner, and last exactly fifteen seconds',()=>{
 for(const seed of [0,1,42,12345])for(const mode of ['easy','normal','hard']){
  const rules=G.withDifficulty(mode,'endless');
  for(let section=0;section<12;section++){
   const star=rules.starFor(seed,section);assert.ok(star);assert.deepEqual(star,rules.starFor(seed,section));
   assert.equal(rules.lane(seed,star.y).type,'safe');assert.equal(rules.blocked(seed,star.x,star.y),false);
   const a=player(star.x,star.y),b=player(star.x,star.y);
   assert.equal(rules.simulate(a,1000,seed,0,-100),null);assert.equal(a.invincibleUntil,16000);
   rules.simulate(a,1100,seed,0,-100);assert.equal(a.invincibleUntil,16000);
   assert.equal(rules.collectStar(b,seed),true);assert.equal(rules.invincible(a,15999),true);assert.equal(rules.invincible(a,16000),false);
   a.simAt=17000;assert.equal(rules.collectStar(a,seed),false);
  }
 }
 assert.equal(G.starFor(1,3),null);
});
test('protection bypasses defenders, water, sleds and blitzes but expires at the exact collision boundary',()=>{
 const rules=G.withDifficulty('hard');const seed=42;
 for(const reason of ['tackle','water','blocking sled','blitz']){
  let spot;
  for(let t=1;t<90&&!spot;t+=.5)for(let y=5;y<240&&!spot;y++)for(let x=.5;x<12;x+=.5)
   if(rules.danger(seed,x,y,t)===reason){spot={x,y,t};break;}
  assert.ok(spot,`fixture ${reason}`);const at=spot.t*1000,p=player(spot.x,spot.y,at);p.invincibleUntil=at+15000;
  assert.equal(rules.simulate(p,at,seed,0,-100),null,reason);
  p.invincibleUntil=at;assert.equal(rules.simulate(p,at,seed,0,-100),reason,reason);
 }
 const p=player(-1,0);p.invincibleUntil=50000;assert.equal(rules.simulate(p,1000,seed,0,-100),'sideline');
 p.x=5.5;p.y=-5;assert.equal(rules.simulate(p,1000,seed,0,0),'scroll wall');
 let sled;for(let y=20;y<240&&!sled;y++)for(let x=1.5;x<12;x++)if(rules.blocked(seed,x,y)&&!rules.blocked(seed,x-1,y)){sled={x,y};break;}
 assert.ok(sled);const normal=player(sled.x-1,sled.y),immune=player(sled.x-1,sled.y);immune.invincibleUntil=16000;
 assert.equal(rules.beginHop(normal,1,0,1000,seed),false);assert.equal(rules.beginHop(immune,1,0,1000,seed),true);
});
test('version three snapshots preserve powerups and version two remains compatible',()=>{
 const p=player(5.5,10);p.ack=0;p.reason='';p.invincibleUntil=16000;p.lastStarRow=8;
 const packet={t:1000,round:{minY:-1},self:p,players:[['id',p.x,p.y,1,'#fff','Cougar',16000]]};
 const setup={revision:1,roster:[['id','#fff','Cougar']],round:{}};
 const bytes=G.encodeSnapshot(packet,1,3),result=G.decodeSnapshot(bytes,setup);
 assert.equal(result.self.invincibleUntil,16000);assert.equal(result.self.lastStarRow,8);assert.equal(result.players[0][6],16000);
 assert.throws(()=>G.decodeSnapshot(bytes.subarray(0,-1),setup));assert.equal(G.decodeSnapshot(G.encodeSnapshot(packet,1),setup).self.alive,true);
});
test('server owns star pickup and a new round clears protection',async t=>{
 let at=100000;const game=createGameServer({clock:()=>at,autoTick:false});await game.listen(0,'127.0.0.1');
 const client=io(`http://127.0.0.1:${game.server.address().port}`,{autoConnect:false,transports:['websocket'],auth:{roomAction:'create',snapshotVersion:3}});
 t.after(async()=>{client.disconnect();await game.close();});
 const init=await new Promise(resolve=>{client.once('init',resolve);client.connect();});const room=game.rooms.get(init.room.id),p=room.players.get(init.id);
 client.emit('restart');await new Promise(r=>setTimeout(r,30));at=room.round.startedAt+50;
 const star=G.starFor(room.round.seed,0);Object.assign(p,{x:star.x,y:star.y,simAt:at,pressureAt:at});game.tick();assert.equal(p.invincibleUntil,at+15000);
 const expires=p.invincibleUntil;game.tick();assert.equal(p.invincibleUntil,expires);
 client.emit('restart');await new Promise(r=>setTimeout(r,30));assert.equal(p.invincibleUntil,0);assert.equal(p.lastStarRow,-1);
});
