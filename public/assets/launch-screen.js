export function launchScreenReady({mobile,landscape,fullscreen,standalone=false}){return !mobile||(landscape&&(fullscreen||standalone));}
export class LaunchScreenGate{
 constructor({onchange=()=>{}}={}){
  this.active=false;this.onchange=onchange;this.ready=true;this.mobile=matchMedia('(pointer:coarse)').matches||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  this.overlay=document.createElement('div');this.overlay.className='launch-screen-gate';this.overlay.hidden=true;this.overlay.setAttribute('role','dialog');this.overlay.setAttribute('aria-modal','true');this.overlay.setAttribute('aria-label','橫向全螢幕拉環');
  this.overlay.innerHTML='<div class="launch-gate-content"><svg viewBox="0 0 96 64" aria-hidden="true"><rect x="12" y="12" width="72" height="40" rx="5"/><path d="M20 24v-4h8m40 0h8v4M20 40v4h8m40 0h8v-4"/></svg><h2>橫放手機，準備拉環</h2><p class="launch-gate-message"></p><button type="button">進入全螢幕</button><p class="launch-gate-error" role="status"></p><small>直向或退出全螢幕時，拉環會立即鎖定。</small></div>';
  document.body.append(this.overlay);this.button=this.overlay.querySelector('button');this.message=this.overlay.querySelector('.launch-gate-message');this.error=this.overlay.querySelector('.launch-gate-error');this.button.onclick=()=>this.enter();
  this.overlay.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();this.button.focus();}});
  this.refresh=()=>this.update();for(const type of ['resize','orientationchange','fullscreenchange','webkitfullscreenchange','pageshow'])window.addEventListener(type,this.refresh);document.addEventListener('fullscreenchange',this.refresh);document.addEventListener('visibilitychange',this.refresh);screen.orientation?.addEventListener('change',this.refresh);queueMicrotask(this.refresh);
 }
 get fullscreen(){return !!(document.fullscreenElement||document.webkitFullscreenElement);}
 get standalone(){return matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;}
 setPreparation(step){if(this.preparation!==step)this.error.textContent='';this.preparation=step;this.update();}
 get landscape(){
  if(this.mobile){
   if(screen.orientation?.type)return screen.orientation.type.startsWith('landscape');
   if(Number.isFinite(window.orientation))return Math.abs(window.orientation)%180===90;
   if(screen.width>0&&screen.height>0)return screen.width>screen.height;
  }
  return innerWidth>innerHeight;
 }
 setActive(active){this.active=!!active;this.update();}
 update(){
  const was=this.ready,landscape=this.landscape,preparing=this.mobile&&!!this.preparation;
  document.body.classList.toggle('portrait-preparation',preparing);
  document.body.classList.toggle('desktop-preparation',!this.mobile&&!!this.preparation);
  document.body.classList.toggle('preparation-landscape',preparing&&landscape);
  const portrait=!!document.querySelector('body > .rotate-phone')&&!landscape&&(!this.preparation||this.mobile);
  this.ready=preparing?!landscape:!portrait&&(!this.active||launchScreenReady({mobile:this.mobile,landscape,fullscreen:this.fullscreen,standalone:this.standalone}));
  const blocked=!this.ready,wasHidden=this.overlay.hidden;this.overlay.hidden=!blocked;document.body.classList.toggle('launch-screen-blocked',blocked);
  this.message.textContent=this.fullscreen||this.standalone?'若裝置未自動轉向，請手動將手機橫放；橫放後會自動繼續。':'按下按鈕進入全螢幕，並嘗試切換橫向。部分瀏覽器仍需手動將手機橫放。';
  this.button.textContent=this.fullscreen||this.standalone?'嘗試切換橫向':'全螢幕並嘗試橫向';
  this.overlay.querySelector('small').textContent=this.active&&this.mobile?'直向或退出全螢幕時，拉環會立即鎖定。':'直向時暫停操作，橫放後繼續。';
  this.overlay.querySelector('h2').textContent=preparing?(this.preparation==='name'?'請直向輸入名字':'請直向組裝陀螺'):'橫放手機，準備拉環';
  if(preparing){
   this.message.textContent='請將手機直拿。若已鎖定橫向，可按下按鈕解除方向鎖定並退出全螢幕，再手動轉回直向。';
   this.button.textContent='解除鎖定並返回直向';
   this.overlay.querySelector('small').textContent='完成名字與組裝後，再切換橫向發射。';
  }
  if(blocked&&wasHidden)this.button.focus({preventScroll:true});
  if(was!==this.ready){this.onchange(this.ready);if(this.ready&&this.active&&!preparing)document.getElementById('handle')?.focus({preventScroll:true});}
 }
 async enter(){
  this.error.textContent='';this.button.disabled=true;
  try{
   if(this.mobile&&this.preparation){
    try{screen.orientation?.unlock?.();}catch{}
    try{const exit=document.exitFullscreen||document.webkitExitFullscreen;if(this.fullscreen&&exit)await exit.call(document);}catch{this.error.textContent='無法退出全螢幕，請使用瀏覽器的退出全螢幕操作。';}
    if(!this.error.textContent)this.error.textContent='請關閉裝置的方向鎖定，再手動將手機轉回直向。';
    return;
   }
   if(!this.fullscreen&&!this.standalone){
    const enter=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;
    if(!enter){this.error.textContent='此瀏覽器不支援網頁全螢幕。iPhone／iPad 請在 Safari 的分享選單選擇「加入主畫面」，從主畫面開啟後手動橫放；或改用支援全螢幕的瀏覽器。';return;}
    try{await enter.call(document.documentElement,{navigationUI:'hide'});}catch{this.error.textContent='無法進入全螢幕。請再按一次按鈕並允許全螢幕；若仍無法開啟，請改用支援的瀏覽器，或加入主畫面後開啟並橫放。';return;}
   }
   if(screen.orientation?.lock){try{await screen.orientation.lock('landscape');}catch{this.error.textContent='瀏覽器未允許自動轉向。請關閉裝置的直向鎖定，再手動將手機橫放。';}}
   else this.error.textContent='此瀏覽器不支援自動轉向。請關閉裝置的直向鎖定，再手動將手機橫放。';
  }finally{this.button.disabled=false;this.update();}
 }
}
