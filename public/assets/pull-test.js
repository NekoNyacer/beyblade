import {setLauncherKit,sizeWinder} from './launcher.js';
import {FlexibleRipcord} from './flexible-ripcord.js';
import {LaunchScreenGate} from './launch-screen.js';
import {appendRipcordEvent} from './ripcord.js';
import {measurePracticePull} from './pull-input.js';
import {rpmText} from './spin-readout.js';
if(matchMedia('(pointer:coarse)').matches||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)){location.replace('/pull-phone'+location.search);}else{
const [{Arena},{LauncherPreview}]=await Promise.all([import('./arena.js'),import('./parts.js')]);
const $=id=>document.getElementById(id),arena=new Arena($('feel-arena')),preview=new LauncherPreview($('loaded-top'));
if(arena.renderer){arena.renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));arena.renderer.shadowMap.enabled=false;}
preview.set({blade:0,ratchet:0,bit:0},'#ff486a');setLauncherKit($('ripcord'),'#ff486a');
let practicePair=null,practiceSource=null;
let gesture=null,stroke=1,locked=false,request=0,count=0,rearmTimer,frames=[],index=0,elapsed=0,last=performance.now();
const screenGate=new LaunchScreenGate({onchange:ready=>{if(!ready)cancel();$('handle').setAttribute('aria-disabled',String(!ready||locked));}});screenGate.setActive(true);
const flexibleCord=new FlexibleRipcord($('ripcord'));
const setStatus=text=>$('feel-status').textContent=text;
function size(){stroke=sizeWinder($('ripcord'));}
function cancel(){const old=gesture;gesture=null;if(old&&$('handle').hasPointerCapture(old.id))$('handle').releasePointerCapture(old.id);$('ripcord').classList.remove('dragging');if(!locked){$('ripcord').style.setProperty('--pull','0px');$('ripcord').style.setProperty('--pull-y','0px');}}
function rearm(){locked=false;$('ripcord').classList.remove('released');$('ripcord').style.setProperty('--pull','0px');$('ripcord').style.setProperty('--pull-y','0px');$('handle').setAttribute('aria-disabled',String(!screenGate.ready));}
async function launch(result){
 if(locked||!screenGate.ready)return;
 locked=true;cancel();clearTimeout(rearmTimer);$('ripcord').classList.add('released');$('handle').setAttribute('aria-disabled','true');
 $('feel-error').textContent='';setStatus('拉環已抽出，正在發射…');navigator.vibrate?.(15);
 const serial=++request;frames=[];index=0;
 $('speed').textContent=result.speed===null?'標準':result.speed.toFixed(2)+' 趟/s';
 $('angle').textContent=(result.angle<-.5?'上 ':result.angle>.5?'下 ':'平 ')+Math.abs(result.angle).toFixed(1)+'°';
 try{
  if(!practicePair)throw Error('主畫面正在建立手機連線，請稍候');
  const response=await fetch('/api/practice-session/pull',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:practicePair.session,token:practicePair.phoneToken,power:result.power,angle:result.angle,speed:result.speed})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'發射失敗');if(serial!==request)return;
 }catch(error){if(serial===request){$('feel-error').textContent=error.message+'；請確認連線後再拉一次。';setStatus('拉環已重新裝填。');}}
 finally{rearmTimer=setTimeout(rearm,260);}
}
$('handle').addEventListener('pointerdown',event=>{
 if(!screenGate.ready||locked||gesture||!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0))return;
 event.preventDefault();size();gesture={id:event.pointerId,x:event.clientX,y:event.clientY,stroke,points:[]};appendRipcordEvent(gesture.points,event);$('handle').setPointerCapture(event.pointerId);$('ripcord').classList.add('dragging');
});
function move(event){
 if(!screenGate.ready){cancel();return;}if(!gesture||event.pointerId!==gesture.id)return;event.preventDefault();appendRipcordEvent(gesture.points,event);
 const limit=Math.max(0,($('ripcord').clientHeight-$('handle').offsetHeight)/2-6);
 const dx=Math.max(0,Math.min(gesture.stroke,event.clientX-gesture.x)),dy=Math.max(-limit,Math.min(limit,event.clientY-gesture.y));
 $('ripcord').style.setProperty('--pull',dx+'px');$('ripcord').style.setProperty('--pull-y',dy+'px');
 const result=measurePracticePull(gesture.points,gesture.stroke);if(result.accepted)launch(result);
}
$('handle').addEventListener('pointermove',move);
$('handle').addEventListener('pointerup',event=>{if(event.pointerId!==gesture?.id)return;move(event);if(gesture){setStatus('還沒抽到底，向右拉完整段即可發射。');cancel();}});
$('handle').addEventListener('pointercancel',cancel);$('handle').addEventListener('lostpointercapture',cancel);
$('handle').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&!event.repeat){event.preventDefault();launch({power:.5,angle:0,speed:null});}});
$('handle').addEventListener('click',event=>{if(event.detail===0)launch({power:.5,angle:0,speed:null});});
function renderSpeeds(frame) {
  for (const id of ['pull', 'reference']) {
    const value = rpmText(frame?.tops.find(top => top.id === id));
    const readout = $(id + '-live-rpm');
    if (readout.textContent !== value) readout.textContent = value;
  }
}
$('reset-pull').onclick=()=>{request++;clearTimeout(rearmTimer);frames=[];index=0;cancel();rearm();arena.idle();for(const top of arena.tops.values())top.group.visible=false;renderSpeeds(null);setStatus('戰鬥場已清空，握住拉環再試。');};
new ResizeObserver(()=>{cancel();size();}).observe($('ripcord'));
function tick(now) {
  const delta = Math.min(.1, (now - last) / 1000);
  last = now;
  if (!document.hidden) {
    elapsed += delta;
    const previous = index;
    while (index < frames.length && frames[index].t <= elapsed) arena.update(frames[index++]);
    if (index !== previous) renderSpeeds(frames[index - 1]);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
function showLaunch(packet){
 const data=packet.run,result=packet.input;request++;frames=[];index=0;arena.idle();arena.roster(data.players);frames=data.frames;elapsed=0;last=performance.now();arena.update(frames[index++]);
 renderSpeeds(frames[0]);
 $('speed').textContent=result.speed===null?'標準':result.speed.toFixed(2)+' 趟/s';$('angle').textContent=(result.angle<-.5?'上 ':result.angle>.5?'下 ':'平 ')+Math.abs(result.angle).toFixed(1)+'°';
 $('velocity').textContent=data.initial.speed.toFixed(1)+' 場地/s';$('rpm').textContent=Math.round(data.initial.rpm)+' rpm';count=packet.count;$('attempt').textContent='第 '+count+' 次發射';setStatus('手機拉環已入場；可在手機繼續拉下一次。');
}
async function sharing(){try{
 const post=async body=>{const response=await fetch('/api/practice-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error);return data;};
 let saved;try{saved=JSON.parse(localStorage.getItem('pull-practice-pair')||'null');}catch{}
 try{practicePair=await post(saved?{session:saved.session,hostToken:saved.hostToken}:{});}catch{practicePair=await post({});}
 try{localStorage.setItem('pull-practice-pair',JSON.stringify(practicePair));}catch{}
 const eventUrl=new URL('/api/practice-session/events',location.origin);eventUrl.search=new URLSearchParams({session:practicePair.session,token:practicePair.hostToken,role:'host'});practiceSource=new EventSource(eventUrl);
 practiceSource.onmessage=event=>{try{const packet=JSON.parse(event.data);if(packet.type==='launch')showLaunch(packet);if(packet.type==='connection')$('feel-connection').textContent=packet.phones?'手機已連線，可直接拉環。':'主畫面已就緒，請用手機掃碼。';}catch(error){$('feel-error').textContent=error.message;}};
 practiceSource.onerror=()=>{$('feel-connection').textContent='主畫面重新連線中，手機暫時鎖定。';};
 const response=await fetch('/api/network');if(!response.ok)throw Error('無法取得連線網址');const network=await response.json();
 for(const origin of network.urls){const option=document.createElement('option');option.value=origin;option.textContent=origin;$('feel-network').append(option);}
 if(!$('feel-network').options.length)throw Error('無法取得區域網路網址');$('feel-network').value=network.urls.find(url=>!url.includes('localhost'))||location.origin;
 const update=()=>{const url=new URL('/pull-phone',$('feel-network').value);url.search=new URLSearchParams({session:practicePair.session,token:practicePair.phoneToken});$('feel-link').href=url.href;$('feel-link').textContent=url.href;$('feel-qr').onload=()=>{$('feel-qr').hidden=false;};$('feel-qr').onerror=()=>{$('feel-qr').hidden=true;};$('feel-qr').src='/api/qr?text='+encodeURIComponent(url.href);};$('feel-network').onchange=update;update();
 }catch(error){$('feel-error').textContent=error.message+'；請重新整理主畫面後再試。';$('feel-qr').hidden=true;}}
sharing();
}
