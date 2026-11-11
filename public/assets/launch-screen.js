export function launchScreenReady({mobile,landscape,fullscreen,standalone=false}){return !mobile||(landscape&&(fullscreen||standalone));}
export class LaunchScreenGate{
 constructor({onchange=()=>{}}={}){
  this.active=false;this.onchange=onchange;this.ready=true;this.mobile=matchMedia('(pointer:coarse)').matches||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  this.overlay=document.createElement('div');this.overlay.className='launch-screen-gate';this.overlay.hidden=true;this.overlay.setAttribute('role','dialog');this.overlay.setAttribute('aria-modal','true');this.overlay.setAttribute('aria-label','橫向全螢幕拉環');
  this.overlay.innerHTML='<div class="launch-gate-content"><svg viewBox="0 0 96 64" aria-hidden="true"><rect x="12" y="12" width="72" height="40" rx="5"/><path d="M20 24v-4h8m40 0h8v4M20 40v4h8m40 0h8v-4"/></svg><h2>橫放手機，準備拉環</h2><p class="launch-gate-message"></p><button type="button">進入全螢幕</button><p class="launch-gate-error" role="status"></p><small>直向或退出全螢幕時，拉環會立即鎖定。</small></div>';
  document.body.append(this.overlay);this.button=this.overlay.querySelector('button');this.message=this.overlay.querySelector('.launch-gate-message');this.error=this.overlay.querySelector('.launch-gate-error');this.button.onclick=()=>this.enter();
  this.overlay.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();this.button.focus();}});
  this.refresh=()=>this.update();for(const type of ['resize','orientationchange','fullscreenchange','webkitfullscreenchange','pageshow'])window.addEventListener(type,this.refresh);document.addEventListener('fullscreenchange',this.refresh);document.addEventListener('visibilitychange',this.refresh);
 }
 get fullscreen(){return !!(document.fullscreenElement||document.webkitFullscreenElement);}
 get standalone(){return matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;}
 setActive(active){this.active=!!active;this.update();}
 update(){
  const was=this.ready,landscape=innerWidth>innerHeight;
  this.ready=!this.active||launchScreenReady({mobile:this.mobile,landscape,fullscreen:this.fullscreen,standalone:this.standalone});
  const blocked=this.active&&!this.ready,wasHidden=this.overlay.hidden;this.overlay.hidden=!blocked;document.body.classList.toggle('launch-screen-blocked',blocked);
  this.message.textContent=this.fullscreen||this.standalone?'請將手機轉成橫向，橫放後會自動開放操作。':'請先橫放手機，再點下方按鈕。進入全螢幕後才會開放拉環。';
  this.button.textContent=this.fullscreen||this.standalone?'檢查橫向狀態':'進入全螢幕';
  if(blocked&&wasHidden)this.button.focus({preventScroll:true});
  if(was!==this.ready){this.onchange(this.ready);if(this.ready&&this.active)document.getElementById('handle')?.focus({preventScroll:true});}
 }
 async enter(){
  this.error.textContent='';
  try{
   if(!this.fullscreen&&!this.standalone){const enter=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;if(!enter)throw Error('此瀏覽器不支援網頁全螢幕。請改用支援的瀏覽器，或從「加入主畫面」後開啟，再橫放手機。');await enter.call(document.documentElement,{navigationUI:'hide'});}
   if(screen.orientation?.lock){try{await screen.orientation.lock('landscape');}catch{/* Manual rotation is required when orientation lock is unavailable. */}}
  }catch(error){this.error.textContent=error.message||'無法進入全螢幕，請再次點擊按鈕。';}
  this.update();
 }
}
