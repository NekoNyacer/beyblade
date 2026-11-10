import { $, esc, connect, audio, phaseText } from './net.js';
import {spinSpeed} from './rail-config.js';
import { Arena } from './arena.js';
import { FrameCursor } from './motion.js';
const arena=new Arena($('arena')),sound=audio(),params=new URLSearchParams(location.search),room=params.get('room'),preview=params.get('preview');
if(params.has('lab'))document.body.classList.add('launch-test-display');
let state,frame,offset=0,lastCount,lastResultRound,fixture,cursor,paused=false,elapsed=0,lastTick=performance.now();
const pan=x=>Math.max(-1,Math.min(1,x/(frame?.arenaRadius||5.6)));
arena.onImpact=e=>sound.impact(e.power,pan(e.x));
arena.onRail=e=>sound.rail(e.phase,e.speedAfter??e.speedBefore??0,pan(e.x),e.reason);
arena.onRingout=e=>{$('commentary').textContent=name(e.id)+' 出界！';};
arena.onOut=e=>{$('commentary').textContent=name(e.id)+(e.reason==='pocket'?' 在坑洞中停轉！':' 停轉！');};
arena.onPocket=e=>{$('commentary').textContent=name(e.id)+(e.phase==='enter'?' 落入坑洞，轉速下降！':' 重返戰鬥場！');};
arena.onShield=e=>{$('commentary').textContent=name(e.id)+' 撞上護罩！反彈耗損轉速';};
arena.onReplayChange=()=>clock();
function name(id){return state?.players.find(p=>p.id===id)?.name||'待定';}
function deferResult(){return !!arena.renderer&&(arena.replaying||!!(frame?.done&&!arena.playbackFrame?.done));}
function receive(msg){
 if(msg.type==='state'){state=msg.state;offset=state.serverTime-Date.now();render();}
 if(msg.type==='frame'){frame=msg.frame;arena.update(frame);updateFrame();}
 if(msg.type==='error'){$('error').hidden=false;$('error').textContent=msg.message;}
}
let base=location.origin;try{const u=new URL(params.get('base')||base);if(['http:','https:'].includes(u.protocol))base=u.origin;}catch{}
if(preview){
 document.body.classList.add('preview-mode');$('room-code').textContent='PREVIEW';$('qr').hidden=true;$('join-short').textContent='示範資料，不連接真實房間';
 import('./fixtures.js').then(async({getScenario})=>{fixture=await getScenario(preview);receive({type:'state',state:fixture.state});cursor=new FrameCursor(fixture.frames);if(fixture.frame)receive({type:'frame',frame:fixture.frame});$('connection').textContent='示範畫面';$('connection').classList.add('online');}).catch(()=>{$('error').hidden=false;$('error').textContent='情境載入失敗，請重新整理';});
 window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='scenario-control')return;paused=e.data.action==='pause';lastTick=performance.now();arena.setPaused(paused);});
}else{
 const join=new URL('/play',base);join.searchParams.set('room',room||'');join.searchParams.set('invite',params.get('invite')||'');$('qr').src='/api/qr?text='+encodeURIComponent(join.href);$('room-code').textContent=room||'缺少活動代碼';$('join-short').textContent=join.host;
 if(base.startsWith('https:'))document.querySelector('#invite p').textContent='掃碼加入活動，準備拉環';
 if(room)connect(room,'display',params.get('invite'),receive,online=>{$('connection').textContent=online?'現場連線':'訊號中斷，正在重新連線';$('connection').classList.toggle('online',online);});else $('center-message').textContent='請從主持控制台開啟投影';
}
function render(){
 arena.waitingForLaunch=['lobby','ready','countdown','shoot'].includes(state.phase);
 const active=['ready','countdown','shoot','running','result','finished'].includes(state.phase);document.body.classList.toggle('battle',active);$('invite').hidden=active;$('phase-heading').textContent=phaseText[state.phase];$('mode-label').textContent=state.mode==='brawl'?'全員混戰 · 最後一人勝出':'一對一淘汰賽 · 勝者晉級';arena.roster(state.players);arena.activeIds=state.phase==='lobby'?null:state.round?.playerIds;
 if(['lobby','ready','countdown'].includes(state.phase)&&!state.recovered){arena.idle();frame=null;}
 const shown=active&&state.round?state.players.filter(p=>state.round.playerIds.includes(p.id)):state.players;
 $('roster').classList.toggle('dense',shown.length>10);document.body.classList.toggle('many-players',shown.length>10);$('roster').innerHTML=shown.map(p=>`<div id="player-${p.id}" class="display-player" style="--player-color:${esc(p.color)}"><span class="player-number">${state.players.indexOf(p)+1}</span><span class="name">${esc(p.name)}</span><span class="status">${state.round?.pulledIds.includes(p.id)?'已拉環':p.connected?'就緒':'標準發射'}</span></div>`).join('');
 const results=['result','finished'].includes(state.phase);$('result').hidden=!results||deferResult();
 if(results){const champion=state.championId,winner=champion||state.round.winnerId;$('result').innerHTML=`<h2>${champion?'今晚的冠軍':'本場勝者'}</h2><h3>${esc(name(winner))}</h3><p>${champion?'把掌聲，獻給最後仍在旋轉的人！':'晉級下一輪，繼續開戰。'}</p>${state.mode==='brawl'?`<div class="podium">${(state.round.rankings||[]).slice(1,3).map((id,i)=>`<span>第 ${i+2} 名<br>${esc(name(id))}</span>`).join('')}</div>`:''}`;}
 const match=state.matches.find(m=>m.id===state.round?.matchId);$('round-label').textContent=match?`第 ${match.stage} 輪 · ${state.matches.filter(m=>m.winnerId&&m.playerIds.length===2).length} 場完成`:state.players.length?`${state.players.length} 位選手`:'等待選手加入';
 const commentary={lobby:'準備好，一起開戰！',ready:'確認零件組裝，準備倒數。',shoot:'SHOOT！現在拉環！',countdown:'3、2、1，發射！',running:'碰撞！旋轉！堅持到最後！',result:'勝負已定，掌聲給每一位選手。',finished:'冠軍誕生！'};$('commentary').textContent=commentary[state.phase];updateFrame();clock();
}
function updateFrame(){
 const shown=arena.playbackFrame||frame;if(!shown||!state)return;
 for(const top of shown.tops){const el=$('player-'+top.id);if(!el)continue;el.classList.toggle('out',!top.alive);el.classList.toggle('in-pocket',!!top.pocketActive&&top.alive);el.querySelector('.status').textContent=top.alive?(shown.done?'勝出':Math.round((top.angularSpeed??spinSpeed(top.energy))*60/(Math.PI*2)).toLocaleString()+' RPM'):top.outReason==='pocket'?'坑洞停轉':top.outReason==='ringout'?'出界':'停轉';}
 if(state.phase==='running'){$('phase-heading').textContent=`剩 ${shown.tops.filter(t=>t.alive).length} 人`;$('round-label').textContent=`${shown.t.toFixed(1)} 秒`;}
}
function clock(){
 if(!state||paused||document.hidden)return;updateFrame();let html='',cue='';const now=Date.now()+offset;
 if(state.phase==='ready')html='準備開戰<small>確認組裝 · 等待主持人倒數</small>';
 if(state.phase==='countdown'){cue=now<state.round.countdownAt+3000?String(Math.max(1,Math.ceil((state.round.countdownAt+3000-now)/1000))):'GO——';html=cue;}
 if(state.phase==='shoot'||state.phase==='running'&&now<state.round.shootAt+1200){cue='SHOOT!';html='SHOOT!';}
 if(cue!==lastCount){if(cue)sound.tone(cue==='SHOOT!'?880:cue==='GO——'?440:600,cue==='GO——'?1.8:.25,.1,'triangle');lastCount=cue;}
 const results=['result','finished'].includes(state.phase);
 if(arena.renderer&&arena.replaying){html='<small>出界重播 · 慢動作</small>';$('result').hidden=true;}else if(results){$('result').hidden=deferResult();if(!deferResult()&&lastResultRound!==state.round.id){lastResultRound=state.round.id;sound.tone(523,.2);setTimeout(()=>sound.tone(659,.2),150);setTimeout(()=>sound.tone(784,.65),300);}}
 const el=$('center-message');el.classList.toggle('launch-cue',!!cue);el.classList.toggle('go-cue',cue==='GO——');if(el.innerHTML!==html)el.innerHTML=html;
}
function playPreview(time){const next=cursor.advance(time);if(next.reset){arena.idle();frame=null;$('commentary').textContent='碰撞！旋轉！堅持到最後！';}for(const snapshot of next.frames)receive({type:'frame',frame:snapshot});}
setInterval(()=>{
 const now=performance.now();
 if(fixture&&!paused&&!document.hidden&&fixture.animated){
  elapsed+=(now-lastTick)/1000;
  if(fixture.name==='countdown'){
   const at=elapsed%(5+fixture.frames.at(-1).t+3),phase=at<5?'countdown':'running';
   state.round.countdownAt=Date.now()-at*1000;state.round.shootAt=state.round.countdownAt+5000;state.round.startsAt=state.round.shootAt;state.round.deadline=state.round.shootAt+1200;offset=0;
   if(state.phase!==phase){state.phase=phase;if(phase==='countdown')cursor.reset();render();}
   if(phase==='running')playPreview(at-5);
  }else playPreview(elapsed%(fixture.frames.at(-1).t+3));
 }
 lastTick=now;clock();
},40);
document.addEventListener('visibilitychange',()=>{lastTick=performance.now();});
$('sound').onclick=async()=>{try{await sound.enable();sound.tone(660);$('sound').textContent='現場音效已開啟';}catch{$('sound').textContent='音效啟動失敗，請重試';}};
$('fullscreen').onclick=async()=>{try{await document.documentElement.requestFullscreen();}catch{$('fullscreen').textContent='請按 F11 全螢幕';}};
