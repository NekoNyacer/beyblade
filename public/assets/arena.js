import * as THREE from '/vendor/three.module.js';
import {FrameTimeline,RingoutReplay} from './motion.js';
import {makePart,metalEnvironment,dispose} from './parts.js';
import {assemblyOffsets} from './part-catalog.js';
import {railConfigForCount,shoulderHeight,surfaceHeight,surfaceGradient} from './rail-config.js';
import {buildStadium} from './stadium.js';
import {buildTopSupport,bowlSkinY,bowlSupportY,flatContactY,restingSupportY} from './top-support.js';
import {SPARK_CAPACITY,sparkColorsForEvent,SPARK_CLEARANCE,createSparkBurst,resetSparkBurst,advanceSparkBurst,sparkFloorHeight} from './collision-sparks.js';
import {createCollisionSparkMaterial} from './collision-spark-material.js';
const TRAIL_POINTS=22, EFFECT_LIMIT=16;
// Meet the lower disk (y=.27–.45), rather than suggesting contact at floor level.
const RAIL_CONTACT_HEIGHT=.35;
const clamp=THREE.MathUtils.clamp;
export class Arena {
  constructor(container) {
    this.container=container;this.tops=new Map();this.players=[];this.frame=null;this.playbackFrame=null;this.activeIds=null;
    this.timeline=new FrameTimeline({delay:.1});this.history=[];this.replay=null;this.pendingRingout=null;
    this.onImpact=null;this.onShield=null;this.onPocket=null;this.onRail=null;this.onRingout=null;this.onOut=null;this.onReplayChange=null;
    this.arenaRadius=5.6;this.railRadius=0;this.paused=false;this.clock=0;this.lastTick=performance.now();
    this.motionQuery=matchMedia('(prefers-reduced-motion: reduce)');this.reduced=this.motionQuery.matches;
    this.motionQuery.addEventListener('change',event=>{
      this.reduced=event.matches;this.clearEffects();if(this.reduced)this.endReplay();
    });
    document.addEventListener('visibilitychange',()=>{
      this.lastTick=performance.now();this.timeline.setPaused(this.paused||document.hidden,this.lastTick);
      this.clearEffects();
    });
    try {this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}
    catch {container.innerHTML='<p class="webgl-error">無法啟動 3D，請使用開啟硬體加速的 Chrome / Edge。</p>';return;}
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.setClearColor(0x070b11);
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.append(this.renderer.domElement);
    this.scene=new THREE.Scene();this.scene.fog=new THREE.Fog(0x070b11,60,150);this.env=metalEnvironment(this.renderer);this.scene.environment=this.env.texture;
    this.camera=new THREE.PerspectiveCamera(39,1,.1,100);this.home=new THREE.Vector3(0,12.5,11.5);
    this.focus=new THREE.Vector3();this.cameraGoal=new THREE.Vector3();this.camera.position.copy(this.home);
    this.bankAxis=new THREE.Vector3();this.rockEuler=new THREE.Euler();this.rockRotation=new THREE.Quaternion();
    this.floorRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0));
    this.scene.add(new THREE.HemisphereLight(0xd7ebff,0x111822,.65));
    const fill=new THREE.DirectionalLight(0x91bbde,1.15);fill.position.set(5,6,-6);this.scene.add(fill);
    const rim=new THREE.DirectionalLight(0xe2f3ff,1.8);rim.position.set(-5,3,-4);this.scene.add(rim);
    const key=new THREE.DirectionalLight(0xfff5e8,2.8);key.position.set(-4,10,5);key.castShadow=true;
    key.shadow.bias=-.00025;key.shadow.normalBias=.025;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-9,right:9,top:9,bottom:-9});this.scene.add(key);
    this.contactLight=new THREE.PointLight(0xffcf70,0,3.2,2);this.impactLight=new THREE.PointLight(0xffffff,0,4.4,2);
    this.scene.add(this.contactLight,this.impactLight);
    this.stage=new THREE.Group();this.rails=new THREE.Group();this.scene.add(this.stage,this.rails);this.railGeometryKey='';
    const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=64;const glowContext=glowCanvas.getContext('2d'),gradient=glowContext.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'#ffffffff');gradient.addColorStop(.2,'#ffffffc0');gradient.addColorStop(.55,'#ffffff38');gradient.addColorStop(1,'#ffffff00');glowContext.fillStyle=gradient;glowContext.fillRect(0,0,64,64);this.glowTexture=new THREE.CanvasTexture(glowCanvas);
    this.setArena(null);this.makeEffects();
    this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(container);this.fit();this.loop();
  }
  fit(){
    if(!this.renderer)return;
    const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;
    const zoom=Math.max(1,1.3/this.camera.aspect)*(this.arenaRadius+1.45)/5.9;
    this.home.set(0,12.2*zoom,13*zoom);
    if(!this.replaying){this.camera.position.copy(this.home);this.camera.lookAt(0,0,0);}
    this.camera.updateProjectionMatrix();
  }
  surfaceY(x,z){return surfaceHeight(x,z,this.arenaRadius);}
  setArena(frame){
    const config=railConfigForCount(frame?.tops?.length||this.players.length||2);
    const radius=Number.isFinite(frame?.arenaRadius)?frame.arenaRadius:config.arenaRadius;
    const railRadius=Number.isFinite(frame?.railRadius)?frame.railRadius:config.railRadius;
    const angles=frame?.exitAngles||config.exitAngles,half=frame?.exitHalfWidth??config.exitHalfWidth;
    const outer=frame?.ringOutAngles||config.ringOutAngles||[0,Math.PI*2/3,Math.PI*4/3];
    // Older replays specified a single opening width for the entire arena.
    const outerWidths=frame?.ringOutHalfWidths??(frame?.ringOutHalfWidth!=null
      ? outer.map(()=>frame.ringOutHalfWidth) : config.ringOutHalfWidths);
    this.arenaRadius=radius;this.railRadius=railRadius;this.pocketFloor=config.pocketFloor;
    const key=JSON.stringify([radius,railRadius,angles,half,outer,outerWidths]);if(key===this.railGeometryKey)return;
    this.railGeometryKey=key;
    for(const group of [this.stage,this.rails]){group.traverse(object=>{if(object.isInstancedMesh)object.dispose();});dispose(group);group.clear();}
    buildStadium(this.stage,this.rails,{...config,arenaRadius:radius,flatRadius:radius*.60,railRadius,exitAngles:angles,exitHalfWidth:half,ringOutAngles:outer,ringOutHalfWidths:outerWidths});this.fit();
  }

  makeTop(player,index) {
    const group=new THREE.Group(),pose=new THREE.Group(),rotor=new THREE.Group();
    group.add(pose);pose.add(rotor);const color=new THREE.Color(player.color||'#ffcf56');
    const parts=player.parts||{},bladeMaterials=[],offsets=assemblyOffsets(parts),bladeShift=offsets.blade-.62;
    for(const [kind,y] of Object.entries(offsets)){
      const part=makePart(kind,parts[kind]||0,player.color);part.position.y=y;rotor.add(part);if(kind==='blade')part.traverse(o=>{if(o.isMesh)bladeMaterials.push(o.material);});
    }
    const spinBlur=new THREE.Group(),blurMaterials=[];
    const blurPart=(geometry,material,y)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.y=y;mesh.castShadow=true;spinBlur.add(mesh);blurMaterials.push(material);return mesh;};
    blurPart(new THREE.CylinderGeometry(.49,.53,.11,80),new THREE.MeshPhysicalMaterial({color:0xc4d7e4,metalness:.92,roughness:.22,clearcoat:1,transparent:true,opacity:0}),.62);
    const band=blurPart(new THREE.RingGeometry(.30,.49,80),new THREE.MeshPhysicalMaterial({color,metalness:.65,roughness:.25,emissive:color,emissiveIntensity:.14,transparent:true,opacity:0,side:THREE.DoubleSide}),.686);band.rotation.x=-Math.PI/2;
    const inner=blurPart(new THREE.RingGeometry(.19,.30,64),new THREE.MeshStandardMaterial({color:0xe2edf4,metalness:.95,roughness:.25,transparent:true,opacity:0,side:THREE.DoubleSide}),.688);inner.rotation.x=-Math.PI/2;
    const support=buildTopSupport(rotor);
    spinBlur.position.y=bladeShift;rotor.add(spinBlur);
    rotor.position.y=-support.tipY;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),playerName=String(player.name||'選手 '+(index+1));
    ctx.font='600 44px sans-serif';canvas.width=Math.min(840,Math.max(240,Math.ceil(ctx.measureText(playerName).width)+124));canvas.height=144;
    ctx.fillStyle='#101728';ctx.strokeStyle=player.color||'#ffcf56';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(3,3,canvas.width-6,104,20);ctx.fill();ctx.stroke();
    ctx.fillStyle=player.color||'#ffcf56';ctx.beginPath();ctx.arc(50,55,32,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#101728';ctx.font='700 40px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(index+1),50,57);
    let fontSize=44;ctx.font='600 '+fontSize+'px sans-serif';while(ctx.measureText(playerName).width>canvas.width-112&&fontSize>24)ctx.font='600 '+(--fontSize)+'px sans-serif';
    ctx.fillStyle='#f7f4e8';ctx.textAlign='left';ctx.fillText(playerName,98,56,canvas.width-112);
    ctx.fillStyle=player.color||'#ffcf56';ctx.beginPath();ctx.moveTo(canvas.width/2-15,108);ctx.lineTo(canvas.width/2,140);ctx.lineTo(canvas.width/2+15,108);ctx.closePath();ctx.fill();
    const labelTexture=new THREE.CanvasTexture(canvas);labelTexture.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
    label.name='player-indicator';label.userData={playerId:player.id,playerName,number:index+1};label.scale.set(canvas.width/144*.55,.55,1);label.position.y=1.28;label.renderOrder=100;group.add(label);
    const trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array((TRAIL_POINTS-1)*18),3));
    const trail=new THREE.Mesh(trailGeometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false}));trail.frustumCulled=false;trail.visible=false;this.scene.add(trail);
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(1.8,1.8),new THREE.MeshBasicMaterial({map:this.glowTexture,color,transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));glow.rotation.x=-Math.PI/2;glow.position.y=.015;group.add(glow);
    const spinHalo=new THREE.Mesh(new THREE.TorusGeometry(.43,.012,5,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.32,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));spinHalo.rotation.x=Math.PI/2;spinHalo.position.y=.68+bladeShift;rotor.add(spinHalo);
    const contact=new THREE.Group();
    const pad=new THREE.Mesh(new THREE.CircleGeometry(.20,16),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));pad.rotation.x=-Math.PI/2;contact.add(pad);
    const sparks=[];const sparkGeometry=new THREE.BoxGeometry(.10,.025,.035);
    for(let i=0;i<3;i++){const spark=new THREE.Mesh(sparkGeometry,new THREE.MeshBasicMaterial({color:i===0?0xffffff:color,transparent:true,opacity:0}));contact.add(spark);sparks.push(spark);}
    contact.visible=false;this.scene.add(contact);
    const materials=[];group.traverse(o=>{if(o.isMesh||o.isSprite){o.material.transparent=true;materials.push({material:o.material,opacity:o.material.opacity});}});
    group.visible=false;this.scene.add(group);this.tops.set(player.id,{group,pose,rotor,support,label,trail,glow,spinHalo,spinBlur,blurMaterials,bladeMaterials,materials,index,contact,pad,sparks,signature:JSON.stringify([player.parts,player.color,player.name]),railBurst:null,history:[],lastTrail:-Infinity,outAt:null,recoil:null,spin:0});return this.tops.get(player.id);
  }
  removeTop(id,item){
    this.scene.remove(item.group,item.trail,item.contact);item.contact.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});item.trail.geometry.dispose();item.trail.material.dispose();
    item.group.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});this.tops.delete(id);
  }
  roster(players){
    this.players=players;if(!this.renderer)return;
    for(const [id,item] of this.tops)if(!players.some(p=>p.id===id))this.removeTop(id,item);
    players.forEach((p,i)=>{const old=this.tops.get(p.id);if(old&&(old.index!==i||old.signature!==JSON.stringify([p.parts,p.color,p.name])))this.removeTop(p.id,old);if(!this.tops.has(p.id))this.makeTop(p,i);});
  }
  update(frame){
    const previous=this.timeline.frames.at(-1),accepted=this.timeline.push(frame,performance.now());
    if(!accepted)return false;
    if(previous&&frame.roundId!==previous.roundId){
      this.history=[];this.endReplay();this.clearEffects();this.frame=null;this.playbackFrame=null;
      this.timeline.setPaused(this.paused||document.hidden,performance.now());
      for(const item of this.tops.values())item.outAt=null;
    }
    this.history.push(frame);if(this.history.length>100)this.history.shift();
    const out=frame.events?.find(event=>event.type==='ringout');
    if(out&&!this.reduced&&!this.replay&&!document.hidden)this.pendingRingout={...out,t:out.t??frame.t};
    return true;
  }
  get replaying(){return Boolean(this.replay||this.pendingRingout);}
  setPaused(paused){
    this.paused=Boolean(paused);this.lastTick=performance.now();this.timeline.setPaused(this.paused||document.hidden,this.lastTick);
  }
  clearEffects(){
    for(const effect of this.effects||[])effect.group.visible=false;
    for(const item of this.tops.values()){
      item.history.length=0;item.lastTrail=-Infinity;item.trail.visible=false;item.recoil=null;item.railBurst=null;item.contact.visible=false;item.outAt=null;
    }
    this.shake=null;if(this.contactLight)this.contactLight.intensity=0;if(this.impactLight)this.impactLight.intensity=0;
  }
  endReplay(){
    const wasReplaying=this.replaying;this.replay=null;this.pendingRingout=null;this.clearEffects();
    if(wasReplaying)this.onReplayChange?.(false);
  }
  startReplay(event){
    if(this.reduced||this.replay)return;
    const sequence=new RingoutReplay(this.history,event);if(!sequence.frames.length)return;
    this.clearEffects();this.replay={sequence,event,elapsed:0};this.pendingRingout=null;this.clock=sequence.start;
    this.onReplayChange?.(true);
  }
  idle(){
    this.frame=null;this.playbackFrame=null;this.history=[];this.endReplay();this.timeline.reset();this.clock=0;
    this.timeline.setPaused(this.paused||document.hidden,performance.now());this.clearEffects();
    for(const item of this.tops.values()){item.pose.quaternion.identity();item.rotor.rotation.set(0,0,0);}
  }
  makeEffects(){
    this.effects=[];this.sparkTransform=new THREE.Object3D();this.sparkDirection=new THREE.Vector3();this.sparkAxis=new THREE.Vector3(1,0,0);
    this.sparkColor=new THREE.Color();
    const flashGeometry=new THREE.RingGeometry(.17,.235,48),coreGeometry=new THREE.CircleGeometry(.18,24),shardGeometry=new THREE.PlaneGeometry(1,1);
    for(let i=0;i<EFFECT_LIMIT;i++){
      const group=new THREE.Group(),flash=new THREE.Mesh(flashGeometry,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true}));flash.rotation.x=-Math.PI/2;
      const core=new THREE.Mesh(coreGeometry,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true}));core.rotation.x=-Math.PI/2;core.position.y=.01;const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture,color:0xffffff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));glow.scale.set(2,2,1);group.add(flash,core,glow);
      const shards=new THREE.InstancedMesh(shardGeometry,createCollisionSparkMaterial(),SPARK_CAPACITY);
      for(let j=0;j<SPARK_CAPACITY;j++)shards.setColorAt(j,this.sparkColor.set(0xffffff));
      const sparkGlow=new THREE.InstancedMesh(shardGeometry,createCollisionSparkMaterial(true),SPARK_CAPACITY);
      sparkGlow.name='collision-spark-glow';sparkGlow.instanceMatrix=shards.instanceMatrix;sparkGlow.instanceColor=shards.instanceColor;sparkGlow.frustumCulled=false;sparkGlow.count=0;sparkGlow.renderOrder=1;shards.renderOrder=2;group.add(sparkGlow);
      shards.name='collision-sparks';shards.frustumCulled=false;shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);shards.count=0;group.add(shards);
      group.visible=false;this.scene.add(group);this.effects.push({group,flash,core,glow,shards,sparkGlow,colors:[new THREE.Color(),new THREE.Color()],burst:createSparkBurst(),born:-Infinity,strength:0,nx:1,nz:0});
    }
  }
  impact(event,notify=true){
    if(!Number.isFinite(event.x)||!Number.isFinite(event.z))return;
    const strength=clamp((Number(event.power)||0)/10,.12,1);
    let effect=this.effects.find(e=>!e.group.visible);
    if(!effect)effect=this.effects.reduce((a,b)=>a.born<b.born?a:b);
    effect.born=this.clock;effect.strength=strength;effect.nx=Number.isFinite(event.nx)?event.nx:1;effect.nz=Number.isFinite(event.nz)?event.nz:0;
    const floor=sparkFloorHeight(event.x,event.z,this.arenaRadius,this.pocketFloor)??this.surfaceY(event.x,event.z);
    const contactHeight=(event.type==='land'||event.type==='pocket-impact')?.06:.48;
    effect.group.position.set(event.x,Math.max(floor+SPARK_CLEARANCE,(Number.isFinite(event.y)?event.y:floor)+contactHeight),event.z);effect.group.visible=true;
    sparkColorsForEvent(event,this.players).forEach((color,i)=>effect.colors[i].set(color));
    resetSparkBurst(effect.burst,event,effect.group.position,strength);effect.shards.count=this.reduced?0:effect.burst.count;
    if(!this.reduced&&Number.isFinite(event.nx)&&Number.isFinite(event.nz)){
      const contacts=event.type==='rail-bounce'?[[event.id,-1]]:[[event.aId,-1],[event.bId,1]];
      for(const [id,sign] of contacts){const item=this.tops.get(id);if(item)item.recoil={born:this.clock,x:event.nx*sign,z:event.nz*sign,strength};}
    }
    if(!this.reduced)this.shake={born:this.clock,strength};
    if(notify)this.onImpact?.(event);
  }
  pocket(event,notify=true){
    if(event.phase==='exit')this.rail({...event,phase:'exit'},false);
    if(notify)this.onPocket?.(event);
  }
  rail(event,notify=true){
    const item=this.tops.get(event.id);
    if(item)item.railBurst={born:this.clock,phase:event.phase};
    if(notify)this.onRail?.(event);
  }
  drawRail(item,top){
    const age=item.railBurst?this.clock-item.railBurst.born:Infinity;
    const active=Boolean(top?.alive&&top.railActive),flare=Math.max(0,1-age/.24);
    item.contact.visible=Boolean(top?.alive&&(active||flare));if(!item.contact.visible)return;
    const length=Math.hypot(top.x,top.z)||1,nx=top.x/length,nz=top.z/length,dir=top.railDir||1;
    item.contact.position.set(nx*.38,RAIL_CONTACT_HEIGHT-item.support.tipY,nz*.38)
      .applyQuaternion(item.pose.quaternion).add(item.group.position);
    if(!this.railLightActive){this.contactLight.color.copy(item.pad.material.color);this.contactLight.position.copy(item.contact.position);this.contactLight.position.y+=.12;this.contactLight.intensity=this.reduced?.45:3.8;this.railLightActive=true;}
    item.pad.material.opacity=(active?.32:0)+flare*.3;item.pad.scale.setScalar(this.reduced?1:1+flare*.5);
    for(let i=0;i<item.sparks.length;i++){
      const spark=item.sparks[i];spark.visible=!this.reduced&&active;
      if(!spark.visible)continue;
      const travel=(this.clock*7+i/3)%1;
      spark.position.set(nz*dir*travel*.45+nx*.04,travel*.1,-nx*dir*travel*.45+nz*.04);
      spark.rotation.y=-Math.atan2(-nx*dir,nz*dir);spark.material.opacity=(1-travel)*.7;
    }
  }
  drawTrail(item,top){
    if(this.reduced||!top?.alive||top.pocketActive){item.trail.visible=false;item.history.length=0;return;}
    const speed=Math.hypot(top.vx||0,top.vz||0),history=item.history;
    // Sample by elapsed time, not refresh rate, and never bridge a teleport/replay.
    const last=history.at(-1);
    if(last&&Math.hypot(top.x-last.x,top.z-last.z)>2)history.length=0;
    if(this.clock-item.lastTrail>=1/60){history.push({x:top.x,y:item.group.position.y+.035,z:top.z,t:this.clock});item.lastTrail=this.clock;}
    while(history.length>TRAIL_POINTS||history.length&&this.clock-history[0].t>.30)history.shift();
    item.trail.visible=speed>.8&&history.length>1;
    if(!item.trail.visible)return;
    const burst=item.railBurst?Math.max(0,1-(this.clock-item.railBurst.born)/.24):0;
    item.trail.material.opacity=clamp((speed-.8)/11,0,.56)+burst*.22;
    const positions=item.trail.geometry.attributes.position;let offset=0;
    for(let i=1;i<history.length;i++){
      const a=history[i-1],b=history[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz)||1;
      const aw=.24*(i-1)/(history.length-1),bw=.24*i/(history.length-1),nx=-dz/length,nz=dx/length;
      positions.setXYZ(offset++,a.x+nx*aw,a.y,a.z+nz*aw);positions.setXYZ(offset++,a.x-nx*aw,a.y,a.z-nz*aw);positions.setXYZ(offset++,b.x+nx*bw,b.y,b.z+nz*bw);
      positions.setXYZ(offset++,b.x+nx*bw,b.y,b.z+nz*bw);positions.setXYZ(offset++,a.x-nx*aw,a.y,a.z-nz*aw);positions.setXYZ(offset++,b.x-nx*bw,b.y,b.z-nz*bw);
    }
    item.trail.geometry.setDrawRange(0,offset);positions.needsUpdate=true;
  }
  drawEffects(){
    this.impactLight.intensity=0;
    for(const effect of this.effects){
      if(!effect.group.visible)continue;
      const age=Math.max(0,this.clock-effect.born),flashDuration=.18+effect.strength*.16;
      if(age>(this.reduced?flashDuration:effect.burst.duration)){effect.group.visible=false;continue;}
      const light=Math.max(0,1-age/.14)*(this.reduced?.7:12)*effect.strength;
      if(light>this.impactLight.intensity){this.impactLight.position.copy(effect.group.position);this.impactLight.position.y+=.2;this.impactLight.intensity=light;}
      const fade=Math.max(0,1-age/flashDuration),scale=this.reduced?1:1+age*(4+effect.strength*8);
      effect.glow.visible=!this.reduced&&age<.19;effect.glow.material.opacity=Math.max(0,1-age/.19)*(.3+effect.strength*.25);effect.glow.scale.setScalar(.4+effect.strength*.7+age*1.2);
      effect.flash.visible=this.reduced?fade>0:age<.10;effect.flash.scale.setScalar(scale);effect.flash.material.opacity=this.reduced?fade*.5:Math.max(0,1-age/.10)*.3;
      effect.core.visible=age<.11;effect.core.scale.setScalar(.7+effect.strength);effect.core.material.opacity=Math.max(0,1-age/.11)*.9;
      effect.shards.visible=effect.sparkGlow.visible=!this.reduced;effect.sparkGlow.count=effect.shards.count;if(this.reduced)continue;
      advanceSparkBurst(effect.burst,age,this.arenaRadius,this.pocketFloor);
      for(let i=0;i<effect.burst.count;i++){
        const p=effect.burst.particles[i],remaining=Math.max(0,1-age/p.life),speed=Math.hypot(p.vx,p.vy,p.vz);
        const transform=this.sparkTransform;
        transform.position.set(p.x-effect.group.position.x,p.y-effect.group.position.y,p.z-effect.group.position.z);
        this.sparkDirection.set(p.vx,p.vy,p.vz).normalize();
        if(speed>.01)transform.quaternion.setFromUnitVectors(this.sparkAxis,this.sparkDirection);else {this.sparkDirection.set(1,0,0);transform.quaternion.identity();}
        const size=p.active?Math.min(1,remaining*3):0;
        // A velocity-aligned streak contracts into a small ember after its damped floor bounce.
        const floor=sparkFloorHeight(p.x,p.z,this.arenaRadius,this.pocketFloor);
        const gradient=Math.hypot(p.x,p.z)<=this.arenaRadius?surfaceGradient(p.x,p.z,this.arenaRadius):{x:((sparkFloorHeight(p.x+.002,p.z,this.arenaRadius,this.pocketFloor)??floor)-(sparkFloorHeight(p.x-.002,p.z,this.arenaRadius,this.pocketFloor)??floor))/.004,z:((sparkFloorHeight(p.x,p.z+.002,this.arenaRadius,this.pocketFloor)??floor)-(sparkFloorHeight(p.x,p.z-.002,this.arenaRadius,this.pocketFloor)??floor))/.004};
        const clearance=floor===null?1:Math.max(0,p.y-floor-.014*Math.hypot(gradient.x,1,gradient.z));
        const crossing=this.sparkDirection.y-gradient.x*this.sparkDirection.x-gradient.z*this.sparkDirection.z;
        const length=Math.min(.08+speed*.035,.34,clearance*2/Math.max(.01,Math.abs(crossing)));
        transform.scale.set(length*size,p.width*.06*size,p.width*.06*size);transform.updateMatrix();effect.shards.setMatrixAt(i,transform.matrix);
        this.sparkColor.copy(effect.colors[p.color]).multiplyScalar(.55+.45*remaining);effect.shards.setColorAt(i,this.sparkColor);
      }
      effect.sparkGlow.material.uniforms.opacity.value=effect.shards.material.uniforms.opacity.value=Math.min(1,Math.max(0,1-age/effect.burst.duration)*2.5);
      effect.shards.instanceMatrix.needsUpdate=true;if(effect.shards.instanceColor)effect.shards.instanceColor.needsUpdate=true;
    }
  }
  loop(){
    if(!this.renderer)return;requestAnimationFrame(()=>this.loop());
    const now=performance.now(),delta=Math.min(.1,Math.max(0,(now-this.lastTick)/1000));this.lastTick=now;
    if(document.hidden)return;
    let frame=this.frame,live=null;
    if(!this.paused){
      live=this.timeline.sample(now);
      if(this.replay){
        this.replay.elapsed+=delta;
        if(this.replay.elapsed>=this.replay.sequence.duration){this.endReplay();this.clock=live?.t??this.clock;}
      }
      if(!this.replay){
        this.clock=live?.t??this.clock+delta;
        if(live){
          frame=live;
          for(const event of live.events){
            if(event.type==='hit')this.impact(event);
            else if(event.type==='rail')this.rail(event);
            else if(event.type==='pocket')this.pocket(event);
            else if(['shield','land','pocket-impact','rail-bounce'].includes(event.type)){this.impact(event);if(event.type==='shield')this.onShield?.(event);}
            else if(event.type==='out')this.onOut?.(event);
            else if(event.type==='ringout'){this.onRingout?.(event);if(!this.reduced)this.startReplay(event);}
          }
          if(this.pendingRingout&&live.t>=this.pendingRingout.t)this.pendingRingout=null;
        }
      }
      if(this.replay){
        const replay=this.replay;frame=replay.sequence.sample(replay.elapsed);
        this.clock=replay.sequence.start+replay.elapsed*replay.sequence.rate;
        for(const event of frame?.events||[]){
          if(event.type==='hit'||event.type==='rail-bounce')this.impact(event,false);else if(event.type==='rail')this.rail(event,false);else if(event.type==='pocket')this.pocket(event,false);
        }
      }
    }
    this.frame=frame;this.playbackFrame=frame;this.setArena(frame);
    if(!this.paused){
      const ease=this.reduced?1:1-Math.exp(-delta*8);
      if(this.replay){
        const event=this.replay.event,subject=frame?.tops.find(top=>top.id===event.id)||event;
        const x=subject.x*.8+event.x*.2,z=subject.z*.8+event.z*.2;
        this.cameraGoal.set(x*.72,4.8,z*.72+4.8);this.focus.lerp(new THREE.Vector3(x,.3,z),ease);
      }else{this.cameraGoal.copy(this.home);this.focus.lerp(new THREE.Vector3(),ease);}
      this.camera.position.lerp(this.cameraGoal,ease);this.camera.lookAt(this.focus);
      if(this.shake&&!this.reduced){const age=this.clock-this.shake.born;if(age<.20)this.camera.rotation.z+=Math.sin(age*90)*Math.exp(-age*20)*this.shake.strength*.006;else this.shake=null;}
    }
    this.railLightActive=false;this.contactLight.intensity=0;
    for(const [id,item] of this.tops){
      const top=frame?.tops.find(t=>t.id===id);
      if(this.waitingForLaunch||!frame||!top||(this.activeIds&&!this.activeIds.includes(id))){
        item.group.visible=false;item.trail.visible=false;item.contact.visible=false;continue;
      }
      const dead=top&&!top.alive;
      if(dead&&item.outAt===null)item.outAt=this.clock;
      if(!dead)item.outAt=null;
      const outAge=dead?this.clock-item.outAt:0,opacity=dead?clamp(1-(outAge-.65)/.8,0,1):1;
      item.group.visible=opacity>0;
      for(const entry of item.materials)entry.material.opacity=entry.opacity*opacity;
      item.glow.material.opacity=opacity*(top?.alive&&!top.pocketActive?.18+Math.min(1,(top.energy||0)/100)*.16:.08);item.spinHalo.material.opacity=opacity*(top?.alive&&!this.reduced?.28:0);
      const blur=top?.alive&&!this.reduced?clamp((top.energy-25)/35,0,1):0;item.spinBlur.visible=blur>0;
      for(const material of item.blurMaterials)material.opacity=blur*opacity;
      for(const material of item.bladeMaterials)material.opacity=opacity*(1-blur*.94);
      item.spin=top?top.spin:this.clock*2;item.rotor.rotation.y=this.reduced?0:item.spin;
      let leanX=0,leanZ=0;
      const settling=top?.settling||dead;
      if(settling){
        const progress=dead?1:1-clamp((top.angularSpeed||0)/(top.settleStartSpeed||10),0,1),rest=.80*progress*progress*(3-2*progress),direction=item.index*2.4;
        const wobble=this.reduced?0:.13*(1-progress),phase=this.clock*4;
        leanX=Math.sin(direction)*rest+Math.sin(phase)*wobble;leanZ=Math.cos(direction)*rest+Math.cos(phase)*wobble;
      }else if(!this.reduced){
        if(top){const wobble=.10*Math.pow(1-clamp(top.energy/48,0,1),1.5),precession=this.clock*(4+Math.max(0,top.energy)*.06),lean=Math.min(.14,wobble+Math.min(.055,(top.tilt||0)*.15));leanX=Math.sin(precession)*lean;leanZ=Math.cos(precession)*lean;}
        if(item.recoil){
          const age=this.clock-item.recoil.born,kick=Math.sin(clamp(age/.24,0,1)*Math.PI)*Math.exp(-age*7)*(.08+item.recoil.strength*.14);
          leanX+=item.recoil.z*kick;leanZ-=item.recoil.x*kick;if(age>.24)item.recoil=null;
        }
        const lean=Math.hypot(leanX,leanZ);if(lean>.14){leanX*=.14/lean;leanZ*=.14/lean;}
      }
      this.placeTop(item,top,leanX,leanZ);this.drawTrail(item,top);this.drawRail(item,top);
    }
    this.drawEffects();this.renderer.render(this.scene,this.camera);
  }
  placeTop(item,top,leanX,leanZ){
    const {x,z}=top,radius=Math.hypot(x,z),rim=this.arenaRadius;
    const recessed=top.pocketActive||top.pocketDepth>0;
    const inBowl=!recessed&&radius<=rim;
    const shoulder=inBowl||recessed?null:shoulderHeight(x,z,rim);
    const floor=inBowl?this.surfaceY(x,z):shoulder??this.pocketFloor;
    const y=Number.isFinite(top.y)?top.y:(shoulder??(this.surfaceY(x,z)-(top.pocketDepth||0)));
    // The static bank lean fades during takeoff and through the crest. Spin
    // is local to the tip, so turning the blade cannot rotate the downhill axis.
    const contact=1-THREE.MathUtils.smoothstep(y-floor,0,.24);
    const gradient=inBowl?surfaceGradient(x,z,rim):{x:0,z:0};
    const slope=Math.hypot(gradient.x,gradient.z);
    const bankLean=Math.min(.21,.24*Math.atan(slope))*contact*THREE.MathUtils.smoothstep(rim-radius,0,.12);
    this.bankAxis.set(-gradient.z/(slope||1),0,gradient.x/(slope||1));
    item.pose.quaternion.setFromAxisAngle(this.bankAxis,bankLean);
    item.pose.quaternion.multiply(this.rockRotation.setFromEuler(this.rockEuler.set(leanX,0,leanZ)));
    const skin=inBowl?bowlSkinY(x,z,rim):floor;
    const support=inBowl||shoulder!==null?bowlSupportY(item.support,item.pose.quaternion,x,z,rim):
      floor+flatContactY(item.support,item.pose.quaternion);
    const rest=top.settling||!top.alive?1-clamp((top.angularSpeed||0)/(top.settleStartSpeed||10),0,1):0;
    const contactSupport=rest>0?THREE.MathUtils.lerp(support,restingSupportY(item.support,item.pose.quaternion,item.rotor.rotation.y,x,z,rim,inBowl||shoulder!==null?null:floor),rest):support;
    item.group.position.set(x,Math.max(contactSupport,y+(skin-floor)*contact),z);
    item.glow.quaternion.setFromAxisAngle(this.bankAxis,Math.atan(slope)).multiply(this.floorRotation);
    item.glow.position.y=skin-item.group.position.y+.015;
    item.glow.material.opacity*=contact;
  }
}
