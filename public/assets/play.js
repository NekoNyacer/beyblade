import {appendRipcordEvent,measureRipcord} from './ripcord.js';
import { PartPreview, LauncherPreview } from './parts.js';
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const roomId = new URLSearchParams(location.search).get('room')?.trim().toUpperCase();
  const accessToken = new URLSearchParams(location.search).get('invite');
  const key = `arena-player:${roomId}`;
  let identity, state, socket, reconnectTimer, acknowledgementTimer, readyTimer;
  let serverOffset = 0;
  let attempts = 0, connecting = false, joined = false, pendingRound = null, gesture = null;
  let online = false, releasedRound = null, stroke = 0;
  const launcherPreview=new LauncherPreview($('loaded-top'));
  let launcherParts='';
  const setText = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
  const error = message => setText(joined ? 'player-error' : 'join-error', message || '');
  try { identity = JSON.parse(localStorage.getItem(key)); } catch { /* Private mode may disable storage. */ }
  if (!identity || typeof identity.token !== 'string' || typeof identity.playerId !== 'string') identity = null;
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
    return online && ['countdown','shoot','running'].includes(state?.phase) && now >= state.round.shootAt && !deadlinePassed() && !state.round.launchResumed
      && state.round?.playerIds?.includes(identity?.playerId) && !state.round.pulledIds?.includes(identity.playerId)
      && pendingRound !== state.round.id && releasedRound !== state.round.id;
  }
  function stopGesture(reset=true) {
    const previous=gesture;gesture=null;
    if(previous && $('handle').hasPointerCapture(previous.id))$('handle').releasePointerCapture(previous.id);
    $('ripcord').classList.remove('dragging');
    if(reset)$('ripcord').style.setProperty('--pull','0px');
  }
  function sizeLauncher(){
    if($('launcher-screen').hidden)return;
    const width=$('ripcord').clientWidth, assembly=document.querySelector('.cord-assembly');
    stroke=Math.max(1,width-assembly.offsetLeft-assembly.offsetWidth-Math.max(18,width*.045));
    const exit=document.querySelector('.launcher-body').offsetLeft+document.querySelector('.launcher-body').offsetWidth;
    $('ripcord').style.setProperty('--stroke',stroke+'px');
    $('ripcord').style.setProperty('--cord-length',(assembly.offsetLeft+stroke-exit+7)+'px');
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
    let cue='';
    if(active&&state.phase==='countdown')cue=now<state.round.countdownAt+3000?String(Math.max(1,Math.ceil((state.round.countdownAt+3000-now)/1000))):now<state.round.shootAt?'GO':'SHOOT';
    if(active&&['shoot','running'].includes(state.phase)&&now<state.round.deadline)cue='SHOOT';
    setText('launch-cue',cue);
    const enabled=canPull();
    $('handle').setAttribute('aria-disabled',String(!enabled));
    if(enabled&&gesture&&!gesture.armed){gesture.armed=true;gesture.points=[{x:gesture.start,y:gesture.startY,t:performance.now()}];}
    if(active&&['shoot','running'].includes(state.phase)&&deadlinePassed())releaseLauncher();
  }
  function render() {
    if(!joined)return;
    const me=state?.players?.find(p=>p.id===identity.playerId);
    renderAssembly(me);
    const parts=JSON.stringify([me?.parts,me?.color]);
    if(parts!==launcherParts){launcherParts=parts;launcherPreview.set(me?.parts||{blade:0,ratchet:0,bit:0},me?.color||'#55d882');}
    const launchMode=$('assembly').hidden;
    document.body.classList.toggle('launch-mode',launchMode);
    document.querySelector('meta[name="theme-color"]').content=launchMode?'#080f1c':'#101728';
    $('launcher-screen').hidden=!launchMode;
    $('ripcord').classList.toggle('active',canPull());
    const accepted=state?.round?.pulledIds?.includes(identity.playerId);
    if(accepted)releaseLauncher();
    if(!online)stopGesture();
    if(launchMode){sizeLauncher();launcherPreview.render();}
    launchClock();
  }
  let draft={blade:0,ratchet:0,bit:0},editing=true,assemblyPending=false,lastParts=null;
  const previews=[];
  for(const [k,label] of [['blade','Blade'],['ratchet','Ratchet'],['bit','Bit']]){
    const row=document.createElement('div');row.className='part-row';
    row.innerHTML=`<h2>${label}</h2><div class="part-selector"><button type="button" aria-label="上一個 ${label}">‹</button><div class="part-view"></div><button type="button" aria-label="下一個 ${label}">›</button></div><output></output>`;
    $('part-rows').append(row);const preview=new PartPreview(row.querySelector('.part-view'),k);previews.push({k,row,preview});
    row.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>{draft[k]=(draft[k]+(i?1:2))%3;drawParts();});
    let down;row.querySelector('.part-view').onpointerdown=e=>{down=e.clientX;};row.querySelector('.part-view').onpointerup=e=>{if(down!=null&&Math.abs(e.clientX-down)>30){draft[k]=(draft[k]+(e.clientX<down?1:2))%3;drawParts();}down=null;};
  }
  function drawParts(){for(const {k,row,preview} of previews){preview.set(draft[k]);row.querySelector('output').textContent=String(draft[k]+1).padStart(2,'0')+' / 03';}}
  function renderAssembly(me){
    const signature=JSON.stringify(me?.parts);
    if(assemblyPending&&signature===JSON.stringify(draft)){editing=false;assemblyPending=false;}
    if(signature!==lastParts){lastParts=signature;if(me?.parts){draft={...me.parts};editing=false;assemblyPending=false;drawParts();}}
    const allowed=online&&['lobby','ready','result'].includes(state?.phase);
    $('assembly').hidden=!(editing&&allowed);
    $('confirm-parts').disabled=assemblyPending||!allowed;$('assembly-status').textContent=assemblyPending?'正在確認組裝…':'';
  }
  $('random-parts').onclick=()=>{for(const k of Object.keys(draft))draft[k]=Math.floor(Math.random()*3);drawParts();};
  $('confirm-parts').onclick=()=>{if(socket?.readyState!==WebSocket.OPEN)return;assemblyPending=true;socket.send(JSON.stringify({type:'assemble',parts:draft}));render();};
  drawParts();
  function receiveState(next) {
    if (!next || next.roomId !== roomId || !Array.isArray(next.players)) return;
    const newRound=state?.round?.id!==next.round?.id;
    state=next;
    if(newRound){releasedRound=null;stopGesture();$('ripcord').classList.remove('released');}
    if(Number.isFinite(next.serverTime))serverOffset=next.serverTime-Date.now();
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
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws?${new URLSearchParams({ room: roomId, role: 'player', token: identity.token })}`);
    socket.addEventListener('open', () => {
      connecting = false; attempts = 0;
      error('');
      // Await a fresh state before re-enabling a previously open ripcord.
      setText('connection', '同步中…');
    });
    socket.addEventListener('message', event => {
      let packet;
      try { packet = JSON.parse(event.data); } catch { return; }
      if (packet.type === 'state') {
        receiveState(packet.state);
        connection(true, '已連線');
      } else if (packet.type === 'error') {
        assemblyPending=false;pendingRound = null; clearTimeout(acknowledgementTimer);
        error(typeof packet.message === 'string' ? packet.message : '操作沒有完成，請稍後再試。'); render();
      }
    });
    socket.addEventListener('close', () => {
      assemblyPending=false;connecting = false; pendingRound = null; clearTimeout(acknowledgementTimer);
      connection(false, '連線中斷');
      $('retry').hidden = false;
      reconnectTimer = setTimeout(connect, Math.min(15000, 800 * 2 ** Math.min(attempts++, 5)));
    });
    socket.addEventListener('error', () => { error('暫時連不上主機，正在重試。請保持此頁開啟。'); });
  }
  async function join(name) {
    if (connecting) return;
    if (!identity && !accessToken) {
      error('這個連結缺少入場邀請，請重新掃描大螢幕上的 QR 碼。');
      return;
    }
    connecting = true; $('join-button').disabled = true;
    setText('join-button', identity ? '恢復選手身分…' : '正在加入…'); error('');
    try {
      const response = await fetch('/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId, name, ...(identity ? {token: identity.token} : {accessToken}) }) });
      const result = await response.json();
      if (!response.ok) {
        const message = result.error || result.message || '暫時無法加入，請向主持人確認房間是否開放。';
        // Only an explicit server rejection invalidates a saved identity.
        if (identity && message === '連線身分已失效，請重新加入') {
          identity = null;
          try { localStorage.removeItem(key); } catch { /* Retry still uses the cleared in-memory identity. */ }
          $('name').focus();
        }
        throw new Error(message);
      }
      if (!result.playerId || !result.token) throw new Error('主機回覆不完整，請向主持人確認名單後再試。');
      identity = { playerId: result.playerId, token: result.token, name };
      let storageFailed = false;
      try { localStorage.setItem(key, JSON.stringify(identity)); } catch { storageFailed = true; }
      joined = true; $('join-panel').hidden = true; $('player-panel').hidden = false;
      receiveState(result.state);
      connecting = false;
      connect();
      if (storageFailed) error('瀏覽器無法保存選手身分，請不要重新整理或關閉此頁。');
    } catch (err) {
      error(err.message || '連線失敗，請確認 Wi-Fi 後再試。');
      connecting = false;
    } finally {
      $('join-button').disabled = false;
      setText('join-button', identity ? '恢復連線' : '加入競技場 ↗');
    }
  }
  function pull(power,angle=0) {
    if (!canPull() || socket?.readyState !== WebSocket.OPEN) return;
    pendingRound = state.round.id;
    releaseLauncher();
    error('');
    try { socket.send(JSON.stringify({ type: 'pull', roundId: state.round.id, power: Math.max(0, Math.min(1, power)), angle })); }
    catch { pendingRound = null; error('拉環未送出，請重新連線後再試。'); }
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
  $('retry').addEventListener('click',connect);
  $('handle').addEventListener('pointerdown',event=>{
    const active=state?.round?.playerIds?.includes(identity?.playerId);
    const canHold=online&&active&&(['ready','countdown'].includes(state.phase)||canPull());
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
