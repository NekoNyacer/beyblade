import { serverClockOffset } from './server-clock.js';
import { $, esc, connect, phaseText } from './net.js';
import { createMatchAudio, launchCue } from './match-audio.js';
import { createSpinReadout } from './spin-readout.js';
import { Arena } from './arena.js';
import { FrameCursor } from './motion.js';
import { renderBracket } from './bracket.js';
import { renderVersus } from './versus.js';
import { resultMarkup } from './champion-result.js';
// Keep the practice camera at the selected angle when the viewport or stadium resizes.
class ProjectionArena extends Arena {
 fit(){
  super.fit();
  if(!this.overhead||!this.renderer)return;
  const distance=this.home.length();
  this.home.set(0,.996*distance,.089*distance);
  if(!this.replaying){this.camera.position.copy(this.home);this.camera.lookAt(0,0,0);}
 }
}
const arena=new ProjectionArena($('arena')),sound=createMatchAudio(),params=new URLSearchParams(location.search),room=params.get('room'),preview=params.get('preview'),practice=params.has('practice');
const spinReadout=createSpinReadout(), reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let practiceGame, showingFinalBracket=false, resultKey='';
if(params.has('lab')||practice)document.body.classList.add('launch-test-display');
let state,frame,offset=null,lastCount,fixture,cursor,paused=false,elapsed=0,lastTick=performance.now();
const pan=x=>Math.max(-1,Math.min(1,(x??0)/(frame?.arenaRadius||5.6)));
arena.onImpact=e=>{if(e.type==='hit')return sound.impact(e.power/10,{pan:pan(e.x)});};
arena.onRail=e=>{
 if(e.phase==='enter')return sound.impact(.08+.16*Math.min(1,(e.speedBefore??0)/14),{pan:pan(e.x)});
 if(e.reason==='port')return sound.play('dash',{pan:pan(e.x)});
};
arena.onRingout=e=>{sound.play('out',{pan:pan(e.x)});$('commentary').textContent=name(e.id)+' 出界！';};
arena.onOut=e=>{if(e.reason!=='ringout')sound.play('out',{pan:pan(e.x)});$('commentary').textContent=name(e.id)+(e.reason==='pocket'?' 在坑洞中停轉！':' 停轉！');};
arena.onPocket=e=>{$('commentary').textContent=name(e.id)+(e.phase==='enter'?' 落入坑洞，轉速下降！':' 重返戰鬥場！');};
arena.onShield=e=>{$('commentary').textContent=name(e.id)+' 撞上護罩！反彈耗損轉速';};
arena.onReplayChange=()=>clock();
function name(id){return state?.players.find(p=>p.id===id)?.name||'待定';}
function showVersus(show){
 const panel=$('versus');
 if(!show){panel.hidden=true;return;}
 const players=state.round.playerIds.map(id=>state.players.find(p=>p.id===id));
 if(players.some(p=>!p)){panel.hidden=true;return;}
 renderVersus(panel,players);
 panel.hidden=false;
}
function deferResult(){return !!arena.renderer&&(arena.replaying||!!(frame?.done&&!arena.playbackFrame?.done));}
function receive(msg){
 if(msg.type==='state'){state=msg.state;offset=serverClockOffset(offset,state.serverTime);render();}
 if(msg.type==='frame'){frame=msg.frame;arena.update(frame);updateFrame();}
 if(msg.type==='error'){$('error').hidden=false;$('error').textContent=msg.message;}
}
let base=location.origin;try{const u=new URL(params.get('base')||base);if(['http:','https:'].includes(u.protocol))base=u.origin;}catch{}
if(preview){
 document.body.classList.add('preview-mode');$('room-code').textContent='PREVIEW';$('qr').hidden=true;$('join-short').textContent='示範資料，不連接真實房間';
 import('./fixtures.js').then(async({getScenario})=>{fixture=await getScenario(preview);receive({type:'state',state:fixture.state});cursor=new FrameCursor(fixture.frames);if(fixture.frame)receive({type:'frame',frame:fixture.frame});$('connection').textContent='示範畫面';$('connection').classList.add('online');}).catch(()=>{$('error').hidden=false;$('error').textContent='情境載入失敗，請重新整理';});
 window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='scenario-control')return;paused=e.data.action==='pause';lastTick=performance.now();arena.setPaused(paused);});
}else if(practice){
 document.body.classList.add('practice-display');
 $('invite').hidden=true;$('connection').textContent='單機對戰';$('connection').classList.add('online');
 import('./practice.js').then(({practiceMatch})=>{
  practiceGame=practiceMatch(receive);
  window.addEventListener('message',event=>{
   if(event.origin!==location.origin||event.source!==parent)return;
   if(event.data?.type==='practice-view'&&['overhead','broadcast'].includes(event.data.view)){
    arena.overhead=event.data.view==='overhead';arena.fit();return;
   }
   if(event.data?.type!=='practice-launch')return;
   const {power,angle}=event.data;
   if(!Number.isFinite(power)||power<0||power>1||!Number.isFinite(angle)||angle<0||angle>25)return;
   frame=null;arena.idle();lastCount='';practiceGame.launch(power,angle);
  });
  parent.postMessage({type:'practice-ready'},location.origin);
 }).catch(()=>parent.postMessage({type:'practice-error'},location.origin));
}else{
 const join=new URL('/play',base);join.searchParams.set('room',room||'');join.searchParams.set('invite',params.get('invite')||'');$('qr').src='/api/qr?text='+encodeURIComponent(join.href);$('room-code').textContent=room||'缺少活動代碼';$('join-short').textContent=join.host;
 if(base.startsWith('https:'))document.querySelector('#invite p').textContent='掃碼加入活動，準備拉環';
 if(room)connect(room,'display',params.get('invite'),receive,online=>{$('connection').textContent=online?'現場連線':'訊號中斷，正在重新連線';$('connection').classList.toggle('online',online);});else $('center-message').textContent='請從主持控制台開啟投影';
}
function setText(element,value){if(element.textContent!==value)element.textContent=value;}
function renderRoster(shown,duel){
 const roster=$('roster');
 roster.classList.toggle('dense',shown.length>10);
 roster.classList.toggle('lobby-grid',shown.length>4);
 document.body.classList.toggle('many-players',shown.length>10);
 document.body.classList.toggle('duel',duel);
 roster.style.setProperty('--roster-rows',Math.max(1,Math.ceil(shown.length/2)));
 roster.innerHTML=shown.map((p,i)=>{
  const position=duel?i+1:state.players.indexOf(p)+1;
  const label=state.phase==='lobby'?'':state.round?.pulledIds?.includes(p.id)?'已拉環':p.connected?'就緒':'標準發射';
  const status='<strong class="status"><b class="rpm-value">0</b><small>RPM</small></strong><span class="spin-state">'+label+'</span>';
  const identity=`<span class="player-number">${duel?'P':''}${position}</span><span class="name" title="${esc(p.name)}">${esc(p.name)}</span>`;
  return `<div id="player-${esc(p.id)}" class="display-player" style="--player-color:${esc(p.color)}">${'<div class="score-identity">'+identity+'</div>'}${status}</div>`;
 }).join('');
}
function render(){
 spinReadout.update(state);
 $('display-schedule').classList.toggle('bracket-dense',state.players.length>8);
 if(state.mode==='tournament')renderBracket($('display-bracket'),state);
 arena.waitingForLaunch=['lobby','ready','countdown','shoot'].includes(state.phase);
 const active=state.phase!=='lobby'&&!!state.round;
 document.body.dataset.phase=state.phase;document.body.classList.toggle('battle',active);
 $('invite').hidden=active||practice||params.has('lab');$('phase-heading').textContent=phaseText[state.phase];
 const match=state.matches.find(m=>m.id===state.round?.matchId);
 const final=match&&state.matches.filter(m=>m.stage===match.stage).length===1;
 $('match-title').textContent=practice?'自由對戰':!active?'選手入場':final?'冠軍賽':state.mode==='brawl'?'全員混戰':match?'淘汰賽':'雙人對戰';
 $('mode-label').textContent=practice?'雙人練習':!active?(state.mode==='brawl'?'全員混戰':'一對一淘汰賽'):final?'決勝對戰':match?`第 ${match.stage} 輪`:state.mode==='brawl'?'生存對決':'一對一';
 $('air-label').textContent=practice?'PRACTICE':preview?'MATCH PREVIEW':!active?'MATCH LOBBY':['finished','result'].includes(state.phase)?'MATCH RESULT':'LIVE MATCH';
 const shown=active?state.round.playerIds.map(id=>state.players.find(p=>p.id===id)).filter(Boolean):state.players;
 const duel=active&&shown.length===2;
 arena.roster(duel?shown.map((p,i)=>({...p,color:i?'#167dff':'#f32744'})):state.players);
 arena.activeIds=active?state.round.playerIds:null;
 if(['lobby','ready','countdown'].includes(state.phase)&&!state.recovered){arena.idle();frame=null;}
 renderRoster(shown,duel);
 const results=['result','finished'].includes(state.phase);$('result').hidden=!results||deferResult();
 if(results){
  const key=JSON.stringify([state.round?.id,state.championId]);
  if(resultKey!==key){showingFinalBracket=false;resultKey=key;}
  $('result').innerHTML=resultMarkup(state,practice);
 }else{showingFinalBracket=false;resultKey='';}
 $('round-label').textContent=match?`第 ${match.stage} 輪 · ${state.matches.filter(m=>m.winnerId&&m.playerIds.length===2).length} 場完成`:state.players.length?`${state.players.length} 位選手`:'等待選手加入';
 const commentary={lobby:'報名開放中',ready:'選手確認組裝',countdown:'準備拉環',shoot:'現在拉環！'};
 $('commentary').textContent=commentary[state.phase]||'';updateFrame();clock();
}
function updateFrame(){
 if(!state)return;
 const shown=arena.playbackFrame||frame;
 const live=['running','result','finished'].includes(state.phase);
 for(const el of $('roster').querySelectorAll('.display-player')){
  const id=el.id.slice(7),top=live&&shown?.roundId===state.round?.id?shown.tops.find(t=>t.id===id):null;
  el.classList.toggle('out',!!top&&!top.alive);el.classList.toggle('in-pocket',!!top?.pocketActive&&top.alive);
  setText(el.querySelector('.rpm-value'),spinReadout.text(top,shown,{reducedMotion:reducedMotion.matches,replaying:!!arena.replaying}));
  const pulled=state.round?.pulledIds?.includes(id);
  const detail=top?(top.alive?(shown.done?'勝出':top.pocketActive?'坑洞減速':state.round?.autoReleasedIds?.includes(id)?'標準發射':''):top.outReason==='pocket'?'坑洞停轉':top.outReason==='ringout'?'出界':'停轉'):pulled?'已拉環 · 等待開戰':state.phase==='shoot'?'等待拉環':state.players.find(p=>p.id===id)?.connected?'準備發射':'標準發射';
  setText(el.querySelector('.spin-state'),state.phase==='lobby'?'':detail);
 }
 if(state.phase==='running'&&shown?.roundId===state.round?.id){setText($('phase-heading'),`剩 ${shown.tops.filter(t=>t.alive).length} 人`);setText($('round-label'),`${shown.t.toFixed(1)} 秒`);}
}
function clock(){
 if(!state||paused||document.hidden)return;updateFrame();let html='',cue='';const now=Date.now()+offset;
 const intro=state.phase==='countdown'&&state.mode==='tournament'&&state.round?.playerIds?.length===2&&now<state.round.countdownAt;
 showVersus(intro);
 if(state.phase==='ready')html=practice?'準備發射':'準備開戰<small>確認組裝 · 等待主持人倒數</small>';
 if(!intro){cue=launchCue(state,now);if(cue)html=practice?'':cue;}
 lastCount=sound.updateClock(state,now,deferResult());
 const results=['result','finished'].includes(state.phase);
 const visible=results&&!deferResult();
 const champion=visible&&!practice&&!!state.championId&&state.players.some(p=>p.id===state.championId);
 const bracketAvailable=visible&&state.mode==='tournament'&&state.matches.length>0;
 const showBracket=bracketAvailable&&(!champion||showingFinalBracket);
 document.body.classList.toggle('result-focus',visible&&!showBracket);
 document.body.classList.toggle('champion-result',champion&&!showBracket);
 $('result-bracket-toggle').hidden=!champion||!bracketAvailable;
 $('result-bracket-toggle').textContent=showBracket?'返回頒獎':'查看完整賽程';
 $('result-bracket-toggle').setAttribute('aria-expanded',String(showBracket));
 $('display-schedule').hidden=!showBracket;document.body.classList.toggle('bracket-results',showBracket);
 if(arena.renderer&&arena.replaying){html='<small>出界重播 · 慢動作</small>';$('result').hidden=true;}else if(results){$('result').hidden=deferResult();}
 const el=$('center-message');el.classList.toggle('launch-cue',!!cue);el.classList.toggle('go-cue',cue==='GO——');if(el.innerHTML!==html)el.innerHTML=html;
}
function playPreview(time){const next=cursor.advance(time);if(next.reset){arena.idle();frame=null;$('commentary').textContent='';}for(const snapshot of next.frames)receive({type:'frame',frame:snapshot});}
setInterval(()=>{
 const now=performance.now();
 if(fixture&&!paused&&!document.hidden&&fixture.animated){
  elapsed+=(now-lastTick)/1000;
  if(fixture.name==='countdown'){
   const at=elapsed%(4.2+fixture.frames.at(-1).t+3),phase=at<3?'countdown':at<4.2?'shoot':'running';
   state.round.countdownAt=Date.now()-at*1000;state.round.shootAt=state.round.countdownAt+3000;state.round.startsAt=state.round.shootAt+1200;state.round.deadline=state.round.shootAt+1200;offset=0;
   if(state.phase!==phase){state.phase=phase;if(phase==='countdown'){cursor.reset();sound.updateClock({phase:'ready'},Date.now());}render();}
   if(phase==='running')playPreview(at-4.2);
  }else playPreview(elapsed%(fixture.frames.at(-1).t+3));
 }
 if(practiceGame&&!document.hidden)practiceGame.step();
 lastTick=now;clock();
},40);
document.addEventListener('visibilitychange',()=>{lastTick=performance.now();});
$('result-bracket-toggle').onclick=()=>{showingFinalBracket=!showingFinalBracket;clock();};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&showingFinalBracket){showingFinalBracket=false;clock();$('result-bracket-toggle').focus();}});
$('sound').onclick=async()=>{try{
 await sound.enable();clock();
 if(!lastCount&&!['result','finished'].includes(state?.phase))sound.play('confirm');
 $('sound').textContent='現場音效已開啟';
}catch{$('sound').textContent='音效啟動失敗，請重試';}};
$('fullscreen').onclick=async()=>{try{await document.documentElement.requestFullscreen();}catch{$('fullscreen').textContent='請按 F11 全螢幕';}};
