import {$,api,connect,esc,phaseText} from './net.js';
let event,state,link,online=false,wantsStart=false,needsBot=false,pendingRemove=null,generation=0;
const storageKey='beyblade-launch-test',idlePhases=['lobby','ready','result','finished'];
function fail(message){$('lab-error').textContent=message;}
function act(action,value){try{link.send({type:'action',action,value,...(action==='remove'?{reset:true}:{})});return true;}catch(e){fail(e.message);return false;}}
function invitation(){if(!event)return;const url=new URL('/play',$('lab-network').value||location.origin);url.searchParams.set('room',event.roomId);url.searchParams.set('invite',event.accessToken);$('lab-join').href=url.href;$('lab-join').textContent=url.href;$('lab-qr').onload=()=>{$('lab-qr').hidden=false;};$('lab-qr').onerror=()=>fail('QR 載入失敗，請使用選手連結或重新整理。');$('lab-qr').src='/api/qr?text='+encodeURIComponent(url.href);}
function render(){
 if(!state)return;
 const humans=state.players.filter(p=>!p.practice),ready=humans.some(p=>p.connected&&p.parts);
 const idle=idlePhases.includes(state.phase),canRemove=online&&idle&&!wantsStart&&!pendingRemove;
 $('lab-players').innerHTML=state.players.map(p=>'<div class="lab-player"><div class="lab-player-info">'+esc(p.name)+'<span>'+(p.practice?'標準力道':p.connected?(p.parts?'已就緒':'待組裝'):'已斷線')+'</span></div><button type="button" data-remove="'+esc(p.id)+'" aria-label="剔除 '+esc(p.name)+'"'+(canRemove?'':' disabled')+' title="'+(idle?'剔除玩家':'對戰中無法剔除')+'">'+(pendingRemove===p.id?'剔除中…':'剔除')+'</button></div>').join('');
 const canStart=online&&ready&&state.players.length>=2&&idle&&!pendingRemove&&!wantsStart;
 $('lab-start').disabled=!canStart;
 $('lab-start').textContent=!online?'主機連線中…':!idle?phaseText[state.phase]:wantsStart?'準備中…':canStart?(['result','finished'].includes(state.phase)?'再發射一次':'開始倒數與發射'):!humans.length?'等待手機加入':state.players.length<2?'等待第二位玩家':!humans.some(p=>p.connected)?'等待手機重新連線':'等待手機確認組裝';
 $('lab-status').textContent=online?'':'主機連線中…';
 if(needsBot&&online&&state.phase==='lobby'){needsBot=false;if(!state.players.some(p=>p.practice))act('practice');}
 if(wantsStart&&state.phase==='lobby'&&state.players.length>=2)act('prepare');
 else if(wantsStart&&state.phase==='ready'){wantsStart=false;act('start');}
}
async function init(fresh=false){
 const current=++generation;link?.close();state=null;online=false;pendingRemove=null;needsBot=false;
 $('lab-start').disabled=true;$('lab-new').disabled=true;$('lab-players').replaceChildren();$('lab-status').textContent='正在建立測試房間…';
 try{
  fail('');if(fresh){localStorage.removeItem(storageKey);event=null;}else{try{event=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{}}
  if(!event){const created=await api('/api/create',{mode:'brawl'});event={roomId:created.roomId,hostToken:created.hostToken,accessToken:created.accessToken};localStorage.setItem(storageKey,JSON.stringify(event));needsBot=true;}
  const network=await api('/api/network');$('lab-network').innerHTML=network.urls.map(url=>'<option value="'+esc(url)+'">'+esc(url)+'</option>').join('');$('lab-network').value=network.urls.find(url=>!url.includes('localhost'))||location.origin;invitation();$('lab-display').src='/display?lab=1&room='+encodeURIComponent(event.roomId)+'&invite='+encodeURIComponent(event.accessToken);
  link=connect(event.roomId,'host',event.hostToken,message=>{
   if(current!==generation)return;
   if(message.type==='state'){state=message.state;pendingRemove=null;render();}
   if(message.type==='error'){wantsStart=false;pendingRemove=null;fail(message.message);render();}
  },ok=>{if(current!==generation)return;online=ok;if(!ok){wantsStart=false;$('lab-status').textContent='主機連線中…';}render();});
 }catch(e){fail(e.message+'；可按「建立新的測試房間」重試。');$('lab-status').textContent='';}
 finally{$('lab-new').disabled=false;}
}
$('lab-players').onclick=e=>{
 const button=e.target.closest('[data-remove]');if(!button||button.disabled)return;
 const player=state.players.find(p=>p.id===button.dataset.remove);if(!player)return;
 const consequence=state.phase==='lobby'?'':'並清除本場結果';
 if(!confirm('剔除「'+player.name+'」'+consequence+'？'))return;
 fail('');pendingRemove=player.id;render();if(!act('remove',player.id)){pendingRemove=null;render();}
};
$('lab-network').onchange=invitation;
$('lab-new').onclick=()=>{wantsStart=false;init(true);};
$('lab-start').onclick=()=>{if($('lab-start').disabled)return;fail('');wantsStart=true;if(['result','finished'].includes(state.phase))act('rematch');render();};
$('lab-sound').onclick=async()=>{const button=$('lab-display').contentDocument?.getElementById('sound');if(button?.onclick){await button.onclick();$('lab-sound').textContent=button.textContent;}};
init();
