import {setLauncherKit,sizeWinder} from './launcher.js';
import {FlexibleRipcord} from './flexible-ripcord.js';
import {LaunchScreenGate} from './launch-screen.js';
import {LauncherPreview} from './parts.js';
import {appendRipcordEvent} from './ripcord.js';
import {measurePracticePull} from './pull-input.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),session=params.get('session'),token=params.get('token');
const valid=!!session&&!!token;let online=false,locked=false,gesture=null,stroke=1,timer;
const preview=new LauncherPreview($('loaded-top'));preview.set({blade:0,ratchet:0,bit:0},'#ff486a');setLauncherKit($('ripcord'),'#ff486a');
const cord=new FlexibleRipcord($('ripcord'));
const gate=new LaunchScreenGate({onchange:ready=>{if(!ready)cancel();draw();}});
function canPull(){return innerWidth>innerHeight&&valid&&online&&gate.ready&&!locked;}
function draw(){const ready=canPull();$('handle').setAttribute('aria-disabled',String(!ready));$('ripcord').classList.toggle('active',ready);$('launch-readiness-label').textContent=!online?'等待連線':locked?'已發射':ready?'向右抽出':'準備中';$('launch-readiness-code').textContent=!online?'SYNC':locked?'LAUNCHED':ready?'SHOOT':'READY';$('launch-help').textContent=!valid?'請從電腦主畫面的 QR 碼開啟這個手機控制器。':!online?'等待主畫面連線；請保持電腦測試頁開啟。':locked?'陀螺已入場，請看主畫面。':'隨時可拉；拉完自動裝填，請看主畫面。';}
function size(){stroke=sizeWinder($('ripcord'));}
function cancel(reset=true){const old=gesture;gesture=null;if(old&&$('handle').hasPointerCapture(old.id))$('handle').releasePointerCapture(old.id);$('ripcord').classList.remove('dragging');if(reset&&!locked){$('ripcord').style.setProperty('--pull','0px');$('ripcord').style.setProperty('--pull-y','0px');}}
function rearm(){locked=false;$('ripcord').classList.remove('released');$('ripcord').style.setProperty('--pull','0px');$('ripcord').style.setProperty('--pull-y','0px');draw();}
async function launch(result){
 if(!canPull())return;locked=true;cancel(false);$('ripcord').classList.add('released');$('player-error').textContent='';draw();navigator.vibrate?.(15);
 try{const response=await fetch('/api/practice-session/pull',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,token,power:result.power,angle:result.angle,speed:result.speed})});const data=await response.json();if(!response.ok)throw Error(data.error||'拉環沒有送出');$('launch-status').textContent='第 '+data.count+' 次發射已送到主畫面。';}
 catch(error){$('player-error').textContent=error.message+'；連線恢復後可再試。';}
 finally{clearTimeout(timer);timer=setTimeout(rearm,350);}
}
$('handle').addEventListener('pointerdown',event=>{if(!canPull()||gesture||!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0))return;event.preventDefault();size();gesture={id:event.pointerId,x:event.clientX,y:event.clientY,stroke,points:[]};appendRipcordEvent(gesture.points,event);$('handle').setPointerCapture(event.pointerId);$('ripcord').classList.add('dragging');});
function move(event){if(!canPull()){cancel();return;}if(!gesture||event.pointerId!==gesture.id)return;event.preventDefault();appendRipcordEvent(gesture.points,event);const limit=Math.max(0,($('ripcord').clientHeight-$('handle').offsetHeight)/2-12);$('ripcord').style.setProperty('--pull',Math.max(0,Math.min(gesture.stroke,event.clientX-gesture.x))+'px');$('ripcord').style.setProperty('--pull-y',Math.max(-limit,Math.min(limit,event.clientY-gesture.y))+'px');const result=measurePracticePull(gesture.points,gesture.stroke);if(result.accepted)launch(result);}
$('handle').addEventListener('pointermove',move);$('handle').addEventListener('pointerup',event=>{if(gesture?.id!==event.pointerId)return;move(event);cancel();});$('handle').addEventListener('pointercancel',()=>cancel());$('handle').addEventListener('lostpointercapture',()=>cancel());
$('handle').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&!event.repeat){event.preventDefault();launch({power:.5,angle:0,speed:null});}});$('handle').addEventListener('click',event=>{if(event.detail===0)launch({power:.5,angle:0,speed:null});});
new ResizeObserver(()=>{cancel();size();}).observe($('ripcord'));
gate.setActive(valid);draw();
if(valid){const url=new URL('/api/practice-session/events',location.origin);url.search=new URLSearchParams({session,token,role:'phone'});const source=new EventSource(url);source.onmessage=event=>{try{const packet=JSON.parse(event.data);if(packet.type==='connection'){online=packet.hostOnline;if(!online)cancel();else $('player-error').textContent='';draw();}}catch{}};source.onerror=()=>{online=false;cancel();draw();};}
