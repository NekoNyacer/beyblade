import { serverClockOffset } from './server-clock.js';
import { $, esc, api, connect, phaseText } from './net.js';
import { createMatchAudio, launchCue } from './match-audio.js';
import { Arena } from './arena.js';
import { renderBracket } from './bracket.js';
import { renderVersus, assemblyArtPath } from './versus.js';
import { createSpinReadout } from './spin-readout.js';
import { partDefinition } from './part-catalog.js';
try{sessionStorage.removeItem("beyblade-admin");}catch{}
if(location.hash&&!/^#(match|players|schedule|settings)$/.test(location.hash))history.replaceState(null,"",location.pathname+location.search);
const arena = new Arena($('arena')), sound = createMatchAudio();let state, link, lastFrame, base=location.origin, offset=null;
const spinReadout=createSpinReadout(), reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const pan=x=>Math.max(-1,Math.min(1,(x??0)/(lastFrame?.arenaRadius||5.6)));
arena.onImpact=e=>{if(e.type==='hit')sound.impact(e.power/10,{pan:pan(e.x)});};
arena.onRail=e=>{if(e.phase==='enter')sound.impact(.08+.16*Math.min(1,(e.speedBefore??0)/14),{pan:pan(e.x)});else if(e.reason==='port')sound.play('dash',{pan:pan(e.x)});};
arena.onRingout=e=>sound.play('out',{pan:pan(e.x)});
arena.onOut=e=>{if(e.reason!=='ringout')sound.play('out',{pan:pan(e.x)});};
arena.onReplayChange=()=>updateClock();
let event;try{event=JSON.parse(localStorage.getItem('beyblade-host')||'null');}catch{}
function error(message){$('error').textContent=message;$('error').hidden=false;clearTimeout(error.timer);error.timer=setTimeout(()=>$('error').hidden=true,7000);}
function act(action,value){try{link.send({type:'action',action,value});}catch(e){error(e.message);}}
function startEvent(saved){event=saved;localStorage.setItem('beyblade-host',JSON.stringify(event));$('setup').hidden=true;$('desk').hidden=false;link?.close();link=connect(event.roomId,'host',event.hostToken,message=>{if(message.type==='state'){state=message.state;offset=serverClockOffset(offset,state.serverTime);render();}if(message.type==='frame'){lastFrame=message.frame;arena.update(lastFrame);}if(message.type==='error')error(message.message);},(online,code)=>{if(code===4001){authenticated=false;showPairing('主持登入已到期或被撤銷，請重新申請。');pollAuth();}$('connection').textContent=online?'主機已連線':'連線中斷，正在重連…';$('connection').classList.toggle('online',online);document.querySelectorAll('#next-actions button').forEach(b=>b.disabled=!online);});loadNetwork();}
async function loadNetwork(){try{const {urls}=await api('/api/network');const preferred=localStorage.getItem('beyblade-network');base=urls.includes(preferred)?preferred:(urls.find(u=>!u.includes('localhost'))||location.origin);$('network').innerHTML=urls.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join('');$('network').value=base;invitation();}catch(e){error(e.message);}}
function invitation(){if(!event)return;const url=new URL('/play',base);url.searchParams.set('room',event.roomId);url.searchParams.set('invite',event.accessToken);$('qr').src='/api/qr?text='+encodeURIComponent(url.href);$('join-url').href=url.href;$('join-url').textContent=url.href;$('network-hint').textContent=base.startsWith('https:')?'雲端模式：手機可用不同網路。只分享選手連結，勿分享私人主持入口。':'本機模式：手機與主機需同一 Wi-Fi。若只有 localhost，請先連接區域網路。';}
function name(id){return state.players.find(p=>p.id===id)?.name||'待定';}
function renderFeatured(){
 const active = state.round?.playerIds?.map(id => state.players.find(p => p.id === id)).filter(Boolean);
 const players = active?.length ? active : state.players;
 $('matchup-title').textContent = active?.length ? '本場對決' : '已加入選手';
 $('featured-players').innerHTML = [0,1].map(i => {
   const p = players[i], side = i ? 'blue' : 'red';
   const parts = p?.parts ? ['blade','ratchet','bit'].map(kind => partDefinition(kind,p.parts[kind]).name).join(' / ') : '';
   const subtitle = p ? (parts || '尚未確認組合') : '掃描 QR Code 加入';
   return `<article class="fighter-card fighter-${i+1}${p?'':' empty-fighter'}">
     <img class="fighter-art" src="${assemblyArtPath(p?.parts||{},side)}" alt="">
     <div class="fighter-heading"><span class="fighter-label">P${i+1}</span><strong class="fighter-name">${p?esc(p.name):'等待選手'}</strong></div>
     <div class="fighter-speed"><span data-speed-id="${p?esc(p.id):''}">${p?'0':'—'}</span><small>RPM</small></div>
     <span class="fighter-parts">${esc(subtitle)}</span></article>`;
 }).join('<span class="matchup-vs" aria-hidden="true">VS</span>');
 $('strip-count').textContent=state.players.length;
 $('roster-preview').innerHTML=state.players.slice(0,4).map((p,i)=>`<li><b style="--player-color:${esc(p.color)}">${i+1}</b><span>${esc(p.name)}</span><small>${p.connected?'已連線':'未連線'}</small></li>`).join('')+(state.players.length>4?`<li>＋${state.players.length-4}</li>`:'');
}
function updateFeaturedSpeeds(){
 const frame=arena.playbackFrame || lastFrame;
 for(const el of document.querySelectorAll('#featured-players [data-speed-id]')){
  const live=['running','result','finished','shoot'].includes(state.phase);
  const top=live && frame?.tops.find(t=>t.id===el.dataset.speedId);
  const value=el.dataset.speedId?spinReadout.text(top,frame,{reducedMotion:reducedMotion.matches,replaying:!!arena.replaying}):'—';
  if(el.textContent!==value)el.textContent=value;
 }
}
function render(){
 spinReadout.update(state);
 document.body.classList.toggle('tournament-mode',state.mode==='tournament');
 $('phase-heading').textContent=phaseText[state.phase]||state.phase;$('room-code').textContent=state.roomId;$('mode-label').textContent=state.mode==='brawl'?'全員混戰':'一對一淘汰賽';$('switch-mode').value=state.mode;$('player-count').textContent=state.players.length;$('live-badge').textContent=phaseText[state.phase];renderFeatured();arena.roster(state.players);arena.activeIds=state.phase==="lobby"?null:state.round?.playerIds;if(['lobby','ready','countdown'].includes(state.phase)&&!state.recovered){arena.idle();lastFrame=null;}
 const hints={lobby:'確認選手到齊後，按「準備本場」。示範選手請在正式活動前移除。',ready:'請選手完成零件組裝。倒數後 SHOOT 亮起才開放拉環，未操作者採標準力道。',shoot:'SHOOT！陀螺立即落入戰鬥盤，手機向右抽出拉環。',countdown:'倒數進行中，手機操作已鎖定。',running:'比賽由主機統一運算。請勿關閉服務視窗或讓電腦休眠。',result:state.mode==='brawl'?'冠軍已產生。可保留結果，或回到大廳再戰。':'確認本場結果後，手動準備下一場。',finished:'賽事完成！保留投影畫面，邀請冠軍上台。'};$('host-hint').textContent=hints[state.phase];
 let actions='';if(state.phase==='lobby')actions='<button class="primary" data-action="prepare">準備本場 →</button>';if(state.phase==='ready')actions='<button class="primary" data-action="start">開始開場倒數</button>';if(['countdown','shoot'].includes(state.phase))actions='<button class="primary" disabled>準備發射…</button>';if(state.phase==='running')actions='<button class="primary" disabled>比賽進行中</button>';if(state.phase==='result'&&state.mode==='tournament')actions='<button class="primary" data-action="advance">準備下一場 →</button>';if(['result','finished'].includes(state.phase))actions+='<button data-action="rematch">回大廳，再戰一輪</button>';$('next-actions').innerHTML=actions;for(const b of $('next-actions').querySelectorAll('[data-action]'))b.onclick=()=>act(b.dataset.action);if(state.players.length<2)$('next-actions').querySelector('[data-action="prepare"]')?.setAttribute('disabled','');
 $('lock').textContent=state.locked?'重新開放加入':'停止加入';for(const id of ['lock','demo','change-mode','switch-mode'])$(id).disabled=state.phase!=='lobby';$('demo').disabled||=state.locked||state.players.length>=10;
 $('recovery').hidden=!state.recovered;$('recovery').textContent='已復原中斷進度。確認現場準備好，再按開始倒數續賽。';
 $('roster').innerHTML=state.players.length?state.players.map((p,i)=>`<div class="player-row"><span class="player-number" style="--player-color:${esc(p.color)}">${i+1}</span><div class="name">${esc(p.name)}<small>${p.connected?'手機已連線':'未連線，仍可標準發射'}${state.round?.pulledIds.includes(p.id)?' · 已拉環':''}</small></div>${state.phase==='lobby'?`<button data-remove="${esc(p.id)}" aria-label="移除 ${esc(p.name)}">移除</button>`:''}</div>`).join(''):'<p class="empty">還沒有選手。請先選擇正確的區網網址，再掃描 QR Code。</p>';for(const b of $('roster').querySelectorAll('[data-remove]'))b.onclick=()=>{if(confirm(`移除「${name(b.dataset.remove)}」？`))act('remove',b.dataset.remove);};
 $('winner-strip').hidden=!['result','finished'].includes(state.phase);$('winner-strip').textContent=(state.phase==='finished'||state.mode==='brawl'?'冠軍：':'本場勝出：')+name(state.championId||state.round?.winnerId);
 if(state.mode==='tournament'){$('schedule-title').textContent='淘汰賽晉級圖';renderBracket($('schedule'),state);}else{$('schedule-title').textContent='全員混戰名次';$('schedule').innerHTML=state.round?.rankings?.map((id,i)=>`<div class="match"><span class="round">第 ${i+1} 名</span><span class="${i===0?'winner':''}">${esc(name(id))}</span></div>`).join('')||'<p class="empty">最後仍在旋轉的陀螺獲勝。勝負與畫面使用同一份模擬結果。</p>';}
 updateClock();
}
function updateClock(){
 if(!state)return;
 updateFeaturedSpeeds();
 const now=Date.now()+offset;
 const showIntro=state.phase==='countdown'&&state.mode==='tournament'&&state.round?.playerIds.length===2&&now<state.round.countdownAt;
 const intro=$('host-versus');intro.hidden=!showIntro;
 if(showIntro){const players=state.round.playerIds.map(id=>state.players.find(p=>p.id===id));if(players.every(Boolean))renderVersus(intro,players,'host-vs');}
 let text='';
 const cue=launchCue(state,now);
 if(showIntro)text='對戰介紹';
 else if(cue==='SHOOT!')text=state.phase==='running'?'全員發射！':'SHOOT！現在拉環';
 else if(cue)text='倒數 '+cue;
 else if(state.phase==='running'&&lastFrame)text='經過 '+lastFrame.t.toFixed(1)+' 秒 · 場上剩 '+lastFrame.tops.filter(t=>t.alive).length+' 人';
 sound.updateClock(state,now,!!arena.renderer&&(arena.replaying||!!(lastFrame?.done&&!arena.playbackFrame?.done)));
 $('pull-count').textContent=text;
}
setInterval(updateClock,40);
$('create-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const result=await api('/api/create',{mode:$('mode').value});startEvent({roomId:result.roomId,hostToken:result.hostToken,accessToken:result.accessToken});}catch(e){error(e.message);}finally{b.disabled=false;}};
$('network').onchange=()=>{base=$('network').value;localStorage.setItem('beyblade-network',base);invitation();};
$('open-display').onclick=()=>{const u=new URL('/display',location.origin);u.searchParams.set('room',event.roomId);u.searchParams.set('invite',event.accessToken);u.searchParams.set('base',base);window.open(u.href,'beyblade-display');};
$('sound').onclick=async()=>{try{await sound.enable();updateClock();if(!launchCue(state,Date.now()+offset)&&!['result','finished'].includes(state?.phase))sound.play('confirm');$('sound').textContent='戰鬥音效已開啟';}catch{error('無法啟動音效，請確認瀏覽器音訊權限。');}};
$('copy-url').onclick=async()=>{try{await navigator.clipboard.writeText($('join-url').href);$('copy-url').textContent='已複製';setTimeout(()=>$('copy-url').textContent='複製選手連結',2000);}catch{error('無法自動複製，請直接選取上方連結複製。');}};
$('lock').onclick=()=>act('lock',!state.locked);$('demo').onclick=()=>act('demo');$('change-mode').onclick=()=>act('mode',$('switch-mode').value);
$('reset').onclick=()=>{if(confirm('回到大廳會清除目前對戰、名次與賽程，保留選手。確定重置？'))act('reset');};
$('new-event').onclick=()=>{if(confirm('離開後不會刪除既有活動，但此瀏覽器將不再保留它的主持入口。確定？')){link?.close();event=null;localStorage.removeItem('beyblade-host');location.reload();}};
let publicMode=true,authenticated=false,authTimer,pairExpires=0;
function showPairing(message){link?.close();link=null;$('desk').hidden=true;$('setup').hidden=true;$('pairing').hidden=false;$('logout').hidden=true;if(message)$('pair-status').textContent=message;}
function enterHost(){const shouldOpen=!authenticated;authenticated=true;$('pairing').hidden=true;$('logout').hidden=!publicMode;if(shouldOpen){if(event?.roomId&&event?.hostToken&&event?.accessToken)startEvent(event);else $('setup').hidden=false;}}
async function pollAuth(){clearTimeout(authTimer);try{const info=await api('/api/pair/status');publicMode=info.publicMode===true&&!info.allowPublicCreate;$('pair-retry').hidden=true;if(!publicMode||info.authenticated){enterHost();authTimer=setTimeout(pollAuth,30000);return;}authenticated=false;showPairing();const pending=info.status==='pending';$('pair-form').hidden=pending;$('pair-code-panel').hidden=!pending;pairExpires=info.expiresAt||info.expires||0;if(pending){$('pair-code').textContent=info.code;$('pair-status').textContent='正在等待管理者核對與批准。此頁會自動更新。';}else{$('pair-status').textContent=info.status==='expired'?'配對已過期，請重新申請。':'尚未取得主持權限。請先申請配對。';}authTimer=setTimeout(pollAuth,pending?2000:15000);}catch(e){authenticated=false;showPairing('無法確認主持登入。請確認網路，再按重新確認。');$('pair-retry').hidden=false;authTimer=setTimeout(pollAuth,10000);}}
$('pair-form').onsubmit=async e=>{e.preventDefault();$('pair-request').disabled=true;try{const info=await api('/api/pair/request',{label:$('device-label').value.trim()||'主持瀏覽器'});$('pair-code').textContent=info.code;pairExpires=info.expiresAt||info.expires;$('pair-form').hidden=true;$('pair-code-panel').hidden=false;$('pair-status').textContent='申請已送出，等待管理者核對這個裝置。';await pollAuth();}catch(e){$('pair-status').textContent=e.message;}finally{$('pair-request').disabled=false;}};
async function logout(){link?.close();link=null;await api('/api/pair/logout',{});authenticated=false;pairExpires=0;$('pair-code-panel').hidden=true;$('pair-form').hidden=false;await pollAuth();}
$('pair-cancel').onclick=()=>logout().catch(e=>error(e.message));$('logout').onclick=()=>logout().catch(e=>error(e.message));$('pair-retry').onclick=pollAuth;
setInterval(()=>{if(pairExpires)$('pair-countdown').textContent='配對有效時間：'+Math.max(0,Math.ceil((pairExpires-Date.now())/1000))+' 秒';},1000);
pollAuth();
