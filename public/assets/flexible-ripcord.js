let sequence=0;
export function cordCurve(anchor,grip){
 const dx=Math.max(0,grip.x-anchor.x),lead=Math.min(38,Math.max(4,dx*.32)),tail=Math.min(32,dx*.2);
 return 'M '+anchor.x+' '+anchor.y+' C '+(anchor.x+lead)+' '+anchor.y+' '+(grip.x-tail)+' '+grip.y+' '+grip.x+' '+grip.y;
}
export class FlexibleRipcord{
 constructor(root){
  this.root=root;this.body=root.querySelector('.launcher-body');this.grip=root.querySelector('#handle');
  const ns='http://www.w3.org/2000/svg',id='cord-metal-'+(++sequence);this.svg=document.createElementNS(ns,'svg');this.svg.classList.add('flexible-cord');this.svg.setAttribute('aria-hidden','true');
  this.svg.innerHTML='<defs><linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ff8392"/><stop offset=".42" stop-color="#e3213d"/><stop offset="1" stop-color="#730a20"/></linearGradient></defs><path class="cord-edge"/><path class="cord-surface" stroke="url(#'+id+')"/><path class="cord-teeth"/>';
  root.append(this.svg);this.paths=[...this.svg.querySelectorAll('path')];this.until=0;this.frame=0;
  this.observer=new MutationObserver(()=>this.refresh());this.observer.observe(root,{attributes:true,attributeFilter:['style','class']});
  this.resize=new ResizeObserver(()=>this.refresh());this.resize.observe(root);this.resize.observe(this.body);this.resize.observe(this.grip);this.refresh();
 }
 refresh(){this.until=performance.now()+400;if(!this.frame)this.frame=requestAnimationFrame(()=>this.tick());}
 tick(){this.frame=0;this.draw();if(performance.now()<this.until)this.frame=requestAnimationFrame(()=>this.tick());}
 draw(){
  const box=this.root.getBoundingClientRect(),body=this.body.getBoundingClientRect(),grip=this.grip.getBoundingClientRect();if(!box.width||!box.height)return;
  this.svg.setAttribute('viewBox','0 0 '+box.width+' '+box.height);
  // The line starts inside the mouth by 2px; the body above it occludes that overlap.
  const size=Math.min(grip.width,grip.height),anchor={x:body.right-box.left-2,y:body.top+body.height/2-box.top},end={x:grip.left-box.left+(grip.width-size)/2+size*17/180,y:grip.top+grip.height/2-box.top};
  const curve=cordCurve(anchor,end);if(curve!==this.lastCurve){this.lastCurve=curve;for(const path of this.paths)path.setAttribute('d',curve);}
 }
}
