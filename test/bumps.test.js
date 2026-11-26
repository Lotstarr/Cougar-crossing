'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const G=require('../game');
const {createGameServer}=require('../server');
const {io}=require('socket.io-client');
const pause=()=>new Promise(r=>setTimeout(r,30));
function player(id,x,y){return{id,x,y,alive:true,lives:1,score:y,simAt:1000,nextStep:0,ack:0,hop:null,queued:null,bumpUntil:0,bumpRevision:0};}
function impact(dx,dy,target={x:5.5,y:5}){
 const a=player('a',target.x-dx*.4,target.y-dy*.4),b=player('b',target.x,target.y);
 const before=new Map([[a.id,{x:a.x-dx*.1,y:a.y-dy*.1,dx,dy,hopAt:900}],[b.id,{x:b.x,y:b.y,dx:0,dy:0}]]);
 return{a,b,before,hit:()=>G.resolveBumps([a,b],before,1000)};
}
test('rear and side impacts push the victim one intended cell in the direction of contact',()=>{
 for(const [dx,dy] of [[0,1],[1,0],[-1,0],[0,-1]]){
  const f=impact(dx,dy);const origin={x:f.b.x,y:f.b.y};assert.equal(f.hit().length,1);
  assert.equal(f.b.hop.tx,origin.x+dx);assert.equal(f.b.hop.ty,origin.y+dy);assert.equal(f.b.bumpRevision,1);assert.equal(f.b.bumpUntil,1160);
  G.simulate(f.b,1160,0,0);assert.equal(f.b.x,origin.x+dx);assert.equal(f.b.y,origin.y+dy);
 }
});
test('separation, idle overlaps and distant players do not shove; cooldown and each-hop limits prevent pileup loops',()=>{
 const f=impact(0,1);f.b.queued={dx:1,dy:0,seq:8,at:990};f.hit();assert.equal(f.b.queued,null);assert.equal(f.b.ack,8);assert.equal(f.hit().length,0);
 const g=impact(1,0);g.b.bumpCooldownUntil=1300;assert.equal(g.hit().length,0);
 const idle=impact(1,0);idle.before.get('a').dx=0;assert.equal(idle.hit().length,0);
 const away=impact(1,0);away.before.get('a').x=away.a.x+.1;assert.equal(away.hit().length,0);
 const far=impact(1,0);far.b.y+=1;assert.equal(far.hit().length,0);
 const ghost=impact(1,0);ghost.b.alive=false;assert.equal(ghost.hit().length,0);
});
test('head-on contacts resolve consistently regardless of roster order and forced hops never cause chain attacks',()=>{
 function duel(reverse){
  const a=player('a',5.3,5),b=player('b',5.7,5);
  const before=new Map([['a',{x:5.2,y:5,dx:1,dy:0,hopAt:900}],['b',{x:5.8,y:5,dx:-1,dy:0,hopAt:900}]]);
  const hits=G.resolveBumps(reverse?[b,a]:[a,b],before,1000);assert.equal(hits.length,1);return hits;
 }
 assert.deepEqual(duel(false),duel(true));
 const f=impact(1,0);f.a.bumpUntil=1000;assert.equal(f.hit().length,0);
});
test('a shove into open water or a defender is lethal, while a star still protects the victim',()=>{
 const seed=15,rules=G.withDifficulty('hard');
 for(const reason of ['water','tackle']){
  let dest;for(let y=5;y<220&&!dest;y++)for(let x=1.5;x<11;x++)if(rules.danger(seed,x,y,1.16)===reason){dest={x,y};break;}
  assert.ok(dest,reason);
  for(const immune of [false,true]){
   const f=impact(1,0,{x:dest.x-1,y:dest.y});if(immune)f.b.invincibleUntil=5000;f.hit();
   // The forced hop follows the normal collision path, including immunity and water landing.
   const hazard=rules.simulate(f.b,1160,seed,0,-100);
   if(immune)assert.equal(hazard,null);else assert.ok(hazard,reason);
  }
 }
 const edge=impact(1,0,{x:11.5,y:0});edge.hit();assert.equal(G.simulate(edge.b,1160,0,0,-100),'sideline');
});
test('version four snapshots preserve forced-hop corrections without breaking older clients',()=>{
 const f=impact(0,1);f.hit();const p=f.b;p.reason='';p.invincibleUntil=20000;p.lastStarRow=6;
 const packet={t:1000,round:{minY:-5},self:p,players:[['b',p.x,p.y,1,'#fff','Runner',20000]]};
 const setup={revision:1,roster:[['b','#fff','Runner']],round:{}};
 for(const version of [2,3,4]){
  const bytes=G.encodeSnapshot(packet,1,version),result=G.decodeSnapshot(bytes,setup);
  assert.deepEqual(result.self.hop,p.hop);if(version===4){assert.equal(result.self.bumpRevision,1);assert.equal(result.self.bumpUntil,1160);}
 }
});
test('live rooms resolve side contact authoritatively and send the forced hop and correction revision',async t=>{
 let at=100000;const game=createGameServer({clock:()=>at,autoTick:false});await game.listen(0,'127.0.0.1');const clients=[];
 t.after(async()=>{clients.forEach(s=>s.disconnect());await game.close();});
 async function join(auth){
  const socket=io(`http://127.0.0.1:${game.server.address().port}`,{autoConnect:false,transports:['websocket'],auth:{snapshotVersion:4,...auth}});clients.push(socket);
  let setup;socket.on('snapshotSetup',v=>setup=v);socket.on('snapshot',v=>{socket.state=G.decodeSnapshot(v,setup);});
  const init=await new Promise(resolve=>{socket.once('init',resolve);socket.connect();});return{socket,init};
 }
 const owner=await join({roomAction:'create'}),room=game.rooms.get(owner.init.room.id),guest=await join({roomAction:'join',roomCode:room.code});
 owner.socket.emit('restart');await pause();at=room.round.startedAt+50;game.tick();
 const a=room.players.get(owner.init.id),b=room.players.get(guest.init.id);
 Object.assign(a,{x:4.5,y:0,score:0,hop:null,queued:null,simAt:at,pressureAt:at,pressureY:-4,pressurePeak:0});
 Object.assign(b,{x:5.5,y:0,score:0,hop:null,queued:null,simAt:at,pressureAt:at,pressureY:-4,pressurePeak:0});
 owner.socket.emit('move',{dx:1,dy:0,seq:1,roundId:room.round.id});await pause();at+=100;game.tick();await pause();
 assert.equal(b.bumpRevision,1);assert.equal(b.hop.tx,6.5);assert.equal(b.hop.ty,0);
 assert.equal(guest.socket.state.self.bumpRevision,1);assert.equal(guest.socket.state.self.hop.tx,6.5);
 at+=200;game.tick();assert.equal(b.x,6.5);assert.equal(b.alive,true);
 a.x=-1;b.x=-1;at+=50;game.tick();assert.equal(room.round.phase,'over');
 at+=1000;owner.socket.emit('restart',{start:true});await pause();assert.equal(b.bumpRevision,0);assert.equal(b.bumpUntil,0);
});
