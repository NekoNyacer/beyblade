import {serverClockOffset} from './server-clock.js';
import {setLauncherKit,sizeWinder} from './launcher.js';
import {FlexibleRipcord} from './flexible-ripcord.js';
import {LaunchScreenGate} from './launch-screen.js';
import {appendRipcordEvent,measureRipcord} from './ripcord.js';
import { PartPreview, LauncherPreview } from './parts.js';
import { partDefinition } from './part-catalog.js';
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const roomId = new URLSearchParams(location.search).get('room')?.trim().toUpperCase();
  const accessToken = new URLSearchParams(location.search).get('invite');
  const key = `arena-player:${roomId}`;
  let identity, state, socket, reconnectTimer, acknowledgementTimer, readyTimer;
  let serverOffset = null;
  let attempts = 0, connecting = false, joined = false, pendingRound = null, gesture = null;
  let online = false, releasedRound = null, stroke = 0;
  const screenGate=new LaunchScreenGate({onchange:ready=>{if(!ready)stopGesture();launchClock();}});
  const flexibleCord=new FlexibleRipcord($('ripcord'));
  const launcherPreview=new LauncherPreview($('loaded-top'));
  const combinationPreview=new LauncherPreview($('combination-preview'));
  if(combinationPreview.camera){
    combinationPreview.camera.position.set(0,1.6,2.05);
    combinationPreview.camera.lookAt(0,.35,0);
  }else{
    $('combination-preview').textContent='3D 預覽無法顯示';
    $('combination-preview').classList.add('preview-fallback');
  }
  let launcherParts='';
  const setText = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
  const error = message => setText(joined ? 'player-error' : 'join-error', message || '');
  try { identity = JSON.parse(localStorage.getItem(key)); } catch { /* Private mode may disable storage. */ }
  if (!identity || typeof identity.token !== 'string' || typeof identity.playerId !== 'string') identity = null;
  screenGate.setPreparation(identity?null:'name');
  $('room-label').textContent = roomId ? `競技場 ${roomId}` : '尚未指定競技場';
  if (!roomId || !/^[a-zA-Z0-9_-]{1,64}$/.test(roomId)) {
    error('這個連結沒有有效的房間編號，請重新掃描大螢幕上的 QR 碼。');
    $('join-button').disabled = true;
    return;
  }
  function connection(ok, message) {
    online = ok;
    setText('connection', message);
    $('connection').classList.toggle('online', ok);
    render();
  }
  function deadlinePassed() {
    return !Number.isFinite(state?.round?.deadline) || Date.now() + serverOffset >= state.round.deadline;
  }
  function canPull() {
    const now=Date.now()+serverOffset;
    return innerWidth > innerHeight && screenGate.ready && online && ['countdown','shoot'].includes(state?.phase) && now >= state.round.shootAt && !deadlinePassed() && !state.round.launchResumed
      && state.round?.playerIds?.includes(identity?.playerId) && !state.round.pulledIds?.includes(identity.playerId)
      && pendingRound !== state.round.id && releasedRound !== state.round.id;
  }
  function stopGesture(reset=true) {
    const previous=gesture;gesture=null;
    if(previous && $('handle').hasPointerCapture(previous.id))$('handle').releasePointerCapture(previous.id);
    $('ripcord').classList.remove('dragging');
    if(reset&&releasedRound!==state?.round?.id){$('ripcord').style.setProperty('--pull','0px');$('ripcord').style.setProperty('--pull-y','0px');}
  }
  function sizeLauncher(){
    if($('launcher-screen').hidden)return;
    stroke=sizeWinder($('ripcord'));
  }
  function releaseLauncher(){
    if(!state?.round||releasedRound===state.round.id)return;
    releasedRound=state.round.id;stopGesture(false);
    $('ripcord').classList.add('released');
    setText('launch-status','陀螺已發射，請看大螢幕。');
  }
  function launchClock(){
    if(!joined||!state)return;
    const active=state.round?.playerIds?.includes(identity.playerId),now=Date.now()+serverOffset;
    const round=state.round,launchPhase=['countdown','shoot'].includes(state.phase);
    const accepted=active&&round.pulledIds?.includes(identity.playerId);
    const closed=['running','result','finished'].includes(state.phase)||(launchPhase&&deadlinePassed());
    if(active&&(accepted||closed))releaseLauncher();
    else if(active&&online&&releasedRound===round.id&&pendingRound!==round.id){
      releasedRound=null;stopGesture();$('ripcord').classList.remove('released');
    }
    const enabled=canPull(),launched=!!round&&releasedRound===round.id;
    let cue='';
    if(online&&active&&state.phase==='countdown'&&now<round.shootAt)cue=now<round.countdownAt?'VS':String(Math.max(1,Math.ceil((round.shootAt-now)/1000)));
    setText('launch-cue',enabled?'SHOOT':cue);
    $('launch-cue').classList.toggle('shoot-signal',enabled);
    const status=!online?'連線中斷，正在重新連線':launched?(accepted||pendingRound===round.id?'已發射，請看大螢幕':'已用標準力道自動發射'):enabled?'SHOOT！向右抽到底':active&&round.launchResumed?'即將恢復對戰，請看大螢幕':active?'先握住拉環，看見 SHOOT 就向右抽到底':'已完成組裝，等待主持人安排對戰';
    setText('launch-help',status);setText('launch-status',status);
    setText('launch-readiness-label',!online?'連線中':launched?'已發射':enabled?'向右抽出':'待機');
    setText('launch-readiness-code',!online?'SYNC':launched?'LAUNCHED':enabled?'SHOOT':'READY');
    $('ripcord').classList.toggle('active',enabled);
    $('handle').setAttribute('aria-disabled',String(!enabled));
    if(enabled&&gesture&&!gesture.armed){gesture.armed=true;gesture.points=[{x:gesture.start,y:gesture.startY,t:performance.now()}];}
  }
  function render() {
    if(!joined)return;
    const me=state?.players?.find(p=>p.id===identity.playerId);
    renderAssembly(me);
    setLauncherKit($('ripcord'),me?.color);
    const parts=JSON.stringify([me?.parts,me?.color]);
    if(parts!==launcherParts){launcherParts=parts;launcherPreview.set(me?.parts||{blade:0,ratchet:0,bit:0},me?.color||'#55d882');}
    const launchMode=$('assembly').hidden;
    document.body.classList.toggle('launch-mode',launchMode);
    document.querySelector('meta[name="theme-color"]').content=launchMode?'#0b1019':'#10131a';
    $('launcher-screen').hidden=!launchMode;
    screenGate.setPreparation(launchMode?null:'assembly');
    screenGate.setActive(launchMode);
    $('ripcord').classList.toggle('active',canPull());
    const accepted=state?.round?.pulledIds?.includes(identity.playerId);
    if(accepted)releaseLauncher();
    if(!online)stopGesture();
    if(launchMode){sizeLauncher();launcherPreview.render();}
    launchClock();
  }
  let draft={blade:0,ratchet:0,bit:0},editing=true,assemblyPending=false,lastParts=null;
  const previews=[];
  const canEditParts=()=>online&&!assemblyPending&&['lobby','ready','result'].includes(state?.phase);
  let combinationSignature='';
  const partLabels={blade:'攻擊環',ratchet:'棘輪',bit:'軸心'};
  for(const [k,label] of Object.entries(partLabels)){
    const row=document.createElement('div');row.className='part-row';
    row.innerHTML=`<h2>${label}<small>${k.toUpperCase()}</small></h2><div class="part-selector"><button type="button" aria-label="上一個 ${label}"><svg viewBox="0 0 20 28" aria-hidden="true"><path d="m15 4-10 10 10 10"/></svg></button><div class="part-view" role="img"></div><button type="button" aria-label="下一個 ${label}"><svg viewBox="0 0 20 28" aria-hidden="true"><path d="m5 4 10 10L5 24"/></svg></button></div><output></output><p class="part-description"></p>`;
    $('part-rows').append(row);
    const preview=new PartPreview(row.querySelector('.part-view'),k);
    if(preview.camera)preview.camera.fov=29;
    previews.push({k,row,preview});
    const change=direction=>{if(!canEditParts())return;draft[k]=(draft[k]+direction+3)%3;drawParts();};
    row.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>change(i?1:-1));
    let down;
    const view=row.querySelector('.part-view');
    view.onpointerdown=e=>{down={x:e.clientX,y:e.clientY};};
    view.onpointerup=e=>{if(down&&Math.abs(e.clientX-down.x)>30&&Math.abs(e.clientX-down.x)>Math.abs(e.clientY-down.y)){change(e.clientX<down.x?1:-1);}down=null;};
    view.onpointercancel=()=>{down=null;};
  }
  function drawParts(){
    for(const {k,row,preview} of previews){
      preview.set(draft[k],state?.players?.find(p=>p.id===identity?.playerId)?.color||'#ed2340');
      const number=String(draft[k]+1).padStart(2,'0');
      row.querySelector('output').textContent=partDefinition(k,draft[k]).name+' · '+number+' / 03';
      row.querySelector('.part-description').textContent=partDefinition(k,draft[k]).description;
      row.querySelector('.part-view').setAttribute('aria-label',partLabels[k]+' '+partDefinition(k,draft[k]).name+'，'+number+'，共三款');
      if(!preview.renderer)row.querySelector('.part-view').textContent=partLabels[k]+' '+number;
    }
    drawCombination();
    $('combination-summary').innerHTML=Object.entries(partLabels).map(([k,label])=>'<span>'+label+' <b>'+partDefinition(k,draft[k]).shortName+'</b></span>').join('');
  }
  function drawCombination(){
    const color=state?.players?.find(p=>p.id===identity?.playerId)?.color||'#ed2340';
    const signature=JSON.stringify([draft,color]);
    if(signature!==combinationSignature){combinationSignature=signature;combinationPreview.set(draft,color);}
  }
  function renderAssembly(me){
    const signature=JSON.stringify(me?.parts);
    if(assemblyPending&&signature===JSON.stringify(draft)){editing=false;assemblyPending=false;}
    if(signature!==lastParts){lastParts=signature;if(me?.parts){draft={...me.parts};editing=false;assemblyPending=false;drawParts();}}
    const allowed=online&&['lobby','ready','result'].includes(state?.phase);
    $('assembly').hidden=!editing;
    if(editing)drawCombination();
    $('random-parts').disabled=assemblyPending||!allowed;
    for(const {row} of previews)row.querySelectorAll('button').forEach(button=>{button.disabled=assemblyPending||!allowed;});
    $('confirm-parts').disabled=assemblyPending||!allowed;$('assembly-status').textContent=assemblyPending?'正在確認組裝…':'';
  }
  $('random-parts').onclick=()=>{if(!canEditParts())return;for(const k of Object.keys(draft))draft[k]=Math.floor(Math.random()*3);drawParts();};
  $('confirm-parts').onclick=()=>{if(socket?.readyState!==WebSocket.OPEN)return;assemblyPending=true;socket.send(JSON.stringify({type:'assemble',parts:draft}));render();};
  drawParts();
  function clearIdentity(message) {
    releasedRound=null;stopGesture();clearTimeout(reconnectTimer);clearTimeout(acknowledgementTimer);clearInterval(readyTimer);
    $('ripcord').classList.remove('released');
    const previous=socket;socket=null;previous?.close();
    identity=null;state=null;joined=false;online=false;connecting=false;attempts=0;
    pendingRound=null;releasedRound=null;assemblyPending=false;editing=true;lastParts=null;draft={blade:0,ratchet:0,bit:0};
    try { localStorage.removeItem(key); } catch { /* The in-memory identity is still cleared. */ }
    $('join-panel').hidden=false;$('player-panel').hidden=true;$('launcher-screen').hidden=true;$('assembly').hidden=false;
    $('retry').hidden=true;$('join-button').disabled=false;setText('join-button-label','加入對戰');
    document.body.classList.remove('launch-mode');document.querySelector('meta[name="theme-color"]').content='#10131a';
    screenGate.setActive(false);screenGate.setPreparation('name');
    drawParts();connection(false,'尚未加入');error(message);$('name').focus();
  }
  function receiveState(next) {
    if (!next || next.roomId !== roomId || !Array.isArray(next.players)) return;
    if(identity&&!next.players.some(p=>p.id===identity.playerId)){clearIdentity('你已被主持人剔除，可重新輸入名字加入。');return false;}
    const newRound=state?.round?.id!==next.round?.id;
    state=next;
    if(newRound){releasedRound=null;stopGesture();$('ripcord').classList.remove('released');}
    if(Number.isFinite(next.serverTime))serverOffset=serverClockOffset(serverOffset,next.serverTime);
    clearInterval(readyTimer);
    if(['countdown','shoot','running'].includes(state.phase))readyTimer=setInterval(launchClock,50);
    if (pendingRound !== null && (state.round?.id !== pendingRound || state.round?.pulledIds?.includes(identity.playerId))) {
      pendingRound = null;
      clearTimeout(acknowledgementTimer);
    }
    render();
  }
  function connect() {
    if (!identity?.token || connecting || socket?.readyState === WebSocket.OPEN) return;
    clearTimeout(reconnectTimer);
    connecting = true;
    connection(false, '連線中…');
    $('retry').hidden = true;
    const current = socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws?${new URLSearchParams({ room: roomId, role: 'player', token: identity.token })}`);
    socket.addEventListener('open', () => {
      if(socket!==current)return;
      connecting = false; attempts = 0;
      error('');
      // Await a fresh state before re-enabling a previously open ripcord.
      setText('connection', '同步中…');
    });
    socket.addEventListener('message', event => {
      if(socket!==current)return;
      let packet;
      try { packet = JSON.parse(event.data); } catch { return; }
      if (packet.type === 'state') {
        if(receiveState(packet.state)===false)return;
        connection(true, '已連線');
      } else if (packet.type === 'error') {
        assemblyPending=false;pendingRound = null; clearTimeout(acknowledgementTimer);
        error(typeof packet.message === 'string' ? packet.message : '操作沒有完成，請稍後再試。'); render();
      }
    });
    socket.addEventListener('close', event => {
      if(socket!==current)return;
      if(event.code===1008&&event.reason==='Removed'){clearIdentity('你已被主持人剔除，可重新輸入名字加入。');return;}
      assemblyPending=false;connecting = false; pendingRound = null; clearTimeout(acknowledgementTimer);
      connection(false, '連線中斷');
      $('retry').hidden = false;
      reconnectTimer = setTimeout(()=>join(identity?.name), Math.min(15000, 800 * 2 ** Math.min(attempts++, 5)));
    });
    socket.addEventListener('error', () => { if(socket!==current)return;error('暫時連不上主機，正在重試。請保持此頁開啟。'); });
  }
  async function join(name) {
    if (connecting) return;
    if (!identity && !accessToken) {
      error('這個連結缺少入場邀請，請重新掃描大螢幕上的 QR 碼。');
      return;
    }
    clearTimeout(reconnectTimer);connecting = true; $('join-button').disabled = true;
    setText('join-button-label', identity ? '恢復選手身分…' : '正在加入…'); error('');
    try {
      const response = await fetch('/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId, name, ...(identity ? {token: identity.token} : {accessToken}) }) });
      const result = await response.json();
      if (!response.ok) {
        const message = result.error || result.message || '暫時無法加入，請向主持人確認房間是否開放。';
        // Only an explicit server rejection invalidates a saved identity.
        if (identity && message === '連線身分已失效，請重新加入') {
          clearIdentity('你已離開此房間，請重新輸入名字加入。');
        }
        throw new Error(message);
      }
      if (!result.playerId || !result.token) throw new Error('主機回覆不完整，請向主持人確認名單後再試。');
      identity = { playerId: result.playerId, token: result.token, name };
      let storageFailed = false;
      try { localStorage.setItem(key, JSON.stringify(identity)); } catch { storageFailed = true; }
      document.activeElement?.blur();
      joined = true; $('join-panel').hidden = true; $('player-panel').hidden = false;
      receiveState(result.state);
      connecting = false;
      connect();
      if (storageFailed) error('瀏覽器無法保存選手身分，請不要重新整理或關閉此頁。');
    } catch (err) {
      error(err.message || '連線失敗，請確認 Wi-Fi 後再試。');
      connecting = false;
      if(joined&&identity)reconnectTimer=setTimeout(()=>join(identity?.name),Math.min(15000,800*2**Math.min(attempts++,5)));
    } finally {
      $('join-button').disabled = false;
      setText('join-button-label', identity ? '恢復連線' : '加入對戰');
    }
  }
  function pull(power,angle=0) {
    if (!canPull() || socket?.readyState !== WebSocket.OPEN) return;
    pendingRound = state.round.id;
    error('');
    try { socket.send(JSON.stringify({ type: 'pull', roundId: state.round.id, power: Math.max(0, Math.min(1, power)), angle })); }
    catch { pendingRound = null; error('拉環未送出，請重新連線後再試。'); return; }
    releaseLauncher();
    render();
    clearTimeout(acknowledgementTimer);
    acknowledgementTimer = setTimeout(() => {
      if (pendingRound !== null) {
        error('尚未收到主機確認，正在重新同步，請稍候。');
        socket?.close();
      }
    }, 6000);
  }
  $('join-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('name').value.trim().slice(0, 16);
    if (!name) { error('請先輸入你的顯示名稱。'); $('name').focus(); return; }
    join(name);
  });
  $('retry').addEventListener('click',()=>join(identity?.name));
  $('handle').addEventListener('pointerdown',event=>{
    const active=state?.round?.playerIds?.includes(identity?.playerId);
    const canHold=innerWidth>innerHeight&&screenGate.ready&&online&&active&&!state.round.launchResumed&&releasedRound!==state.round.id&&(state.phase==='ready'||(state.phase==='countdown'&&Date.now()+serverOffset<state.round.shootAt)||canPull());
    if(!canHold||gesture||!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0))return;
    event.preventDefault();sizeLauncher();
    gesture={id:event.pointerId,start:event.clientX,startY:event.clientY,armed:canPull(),points:[],stroke};
    appendRipcordEvent(gesture.points,event);
    $('handle').setPointerCapture(event.pointerId);$('ripcord').classList.add('dragging');
  });
  function moveGesture(event){
    if(!gesture||gesture.id!==event.pointerId)return;
    if(!canPull()){
      gesture.start=event.clientX;gesture.startY=event.clientY;gesture.points=[];appendRipcordEvent(gesture.points,event);return;
    }
    appendRipcordEvent(gesture.points,event);
    const distance=Math.max(0,Math.min(gesture.stroke,event.clientX-gesture.start));
    $('ripcord').style.setProperty('--pull',distance+'px');
    const limit=Math.max(12,($('ripcord').clientHeight-document.querySelector('.cord-assembly').offsetHeight)/2-12);
    $('ripcord').style.setProperty('--pull-y',Math.max(-limit,Math.min(limit,event.clientY-gesture.startY))+'px');
    const result=measureRipcord(gesture.points,gesture.stroke);
    if(result.accepted){pull(result.power,result.angle);navigator.vibrate?.(18);}
  }
  $('handle').addEventListener('pointermove',moveGesture);
  $('handle').addEventListener('pointerup',event=>{moveGesture(event);if(gesture?.id===event.pointerId)stopGesture();});
  $('handle').addEventListener('pointercancel',()=>stopGesture());
  $('handle').addEventListener('lostpointercapture',()=>stopGesture());
  $('handle').addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.key===' ')&&!event.repeat&&canPull()){event.preventDefault();pull(.5);}
  });
  $('handle').addEventListener('click',event=>{if(event.detail===0&&canPull())pull(.5);});
  window.addEventListener('resize',()=>{stopGesture();sizeLauncher();});
  window.addEventListener('online', connect);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) connect(); });
  if (identity) { $('name').value = identity.name || ''; join(identity.name || '選手'); }
  else if (!accessToken) {
    error('這個連結缺少入場邀請，請重新掃描大螢幕上的 QR 碼。');
    $('join-button').disabled = true;
  }
})();
