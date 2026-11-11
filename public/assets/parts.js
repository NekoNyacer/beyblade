import * as THREE from '/vendor/three.module.js';
import {partDefinition,assemblyOffsets} from './part-catalog.js';
export function metalEnvironment(renderer){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d');
 const sky=ctx.createLinearGradient(0,0,0,512);sky.addColorStop(0,'#b8c9df');sky.addColorStop(.45,'#637589');sky.addColorStop(.55,'#182538');sky.addColorStop(1,'#405169');ctx.fillStyle=sky;ctx.fillRect(0,0,1024,512);
 for(const [x,y,w,h]of [[80,90,190,110],[460,60,100,220],[760,120,180,65]]){const glow=ctx.createLinearGradient(x,0,x+w,0);glow.addColorStop(0,'#61758b');glow.addColorStop(.3,'#ffffff');glow.addColorStop(.7,'#ffffff');glow.addColorStop(1,'#61758b');ctx.fillStyle=glow;ctx.fillRect(x,y,w,h);}
 const texture=new THREE.CanvasTexture(canvas);texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.SRGBColorSpace;const pmrem=new THREE.PMREMGenerator(renderer);const target=pmrem.fromEquirectangular(texture);texture.dispose();pmrem.dispose();return target;
}
export function makePart(kind,index=0,color='#ff486a'){
 index=Number.isInteger(index)&&index>=0&&index<3?index:0;
 const group=new THREE.Group(),steel=new THREE.MeshStandardMaterial({color:0xc6d2df,metalness:.92,roughness:.24,envMapIntensity:1.4}),accent=new THREE.MeshPhysicalMaterial({color,metalness:.45,roughness:.26,clearcoat:1,clearcoatRoughness:.12,emissive:color,emissiveIntensity:.12}),dark=new THREE.MeshStandardMaterial({color:0x283440,metalness:.9,roughness:.3});
 const add=(geometry,material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;group.add(m);return m;};
 const spec=partDefinition(kind,index);group.name=spec.id;group.userData={kind,index,partId:spec.id};
 const ring=(outer,inner,height,material,y=0)=>{
  const shape=new THREE.Shape();shape.absarc(0,0,outer,0,Math.PI*2,false);
  const hole=new THREE.Path();hole.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(hole);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:true,bevelThickness:.012,bevelSize:.009,bevelSegments:3,curveSegments:48});geometry.rotateX(-Math.PI/2);return add(geometry,material,0,y-height/2);
 };
 const lugs=(count,radius,width,depth,height,material,y=0)=>{for(let i=0;i<count;i++){const a=i/count*Math.PI*2;const tooth=add(new THREE.BoxGeometry(depth,height,width),material,Math.cos(a)*radius,y,Math.sin(a)*radius);tooth.rotation.y=-a;tooth.name='lug';}};
 if(kind==='blade'){
  ring(.30,.135,.065,dark,-.02);
  if(index===0){
   for(let i=0;i<3;i++){
    const shape=new THREE.Shape();shape.moveTo(.16,-.12);shape.lineTo(.36,-.22);shape.quadraticCurveTo(.48,-.20,.49,-.06);shape.lineTo(.45,.20);shape.quadraticCurveTo(.39,.06,.29,.08);shape.lineTo(.18,.17);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.075,bevelEnabled:true,bevelThickness:.02,bevelSize:.012,bevelSegments:2,steps:1});geometry.rotateX(-Math.PI/2);
    const wing=add(geometry,steel);wing.rotation.y=i*Math.PI*2/3;wing.name='blade-lobe';
    const stripe=new THREE.Shape();stripe.moveTo(.23,-.08);stripe.lineTo(.38,-.14);stripe.lineTo(.43,-.10);stripe.lineTo(.33,-.045);stripe.lineTo(.27,.055);stripe.closePath();
    const trimGeometry=new THREE.ExtrudeGeometry(stripe,{depth:.025,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:2});trimGeometry.rotateX(-Math.PI/2);
    const trim=add(trimGeometry,accent,0,.08);trim.rotation.y=i*Math.PI*2/3;
   }
  }else if(index===1){
   ring(.40,.25,.095,accent,-.015);
   for(let i=0;i<6;i++){const a=i*Math.PI/3;const shape=new THREE.Shape();for(let j=0;j<8;j++){const angle=j*Math.PI/4,r=.13;const x=Math.cos(angle)*r,z=Math.sin(angle)*r;if(j===0)shape.moveTo(x,z);else shape.lineTo(x,z);}shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.10,bevelEnabled:true,bevelThickness:.025,bevelSize:.018,bevelSegments:2});geometry.rotateX(-Math.PI/2);
    const shield=add(geometry,steel,Math.cos(a)*.36,.005,Math.sin(a)*.36);shield.name='blade-lobe';shield.rotation.y=-a;}
  }else{
   ring(.505,.36,.13,steel,.01);ring(.40,.33,.14,accent,.015);
   lugs(3,.27,.065,.20,.06,steel,.025);
  }
  ring(.21,.115,.08,steel,.095);const hub=add(new THREE.TorusGeometry(.17,.018,10,48),accent,0,.145);hub.rotation.x=Math.PI/2;
  lugs(3,.115,.045,.035,.065,dark,.10);
 }else if(kind==='ratchet'){
  ring(index===1?.31:.29,.14,spec.height,steel);
  const widths=[.15,.12,.065],depths=[.16,.14,.07],radii=[.30,.30,.29];
  lugs(spec.lobes,radii[index],widths[index],depths[index],spec.height,accent);
  ring(.24,.14,.025,dark,spec.height/2+.012);
 }else{
  ring(.145,.075,.22,steel,.09);
  const collar=index===0?.24:index===1?.29:.19;
  add(new THREE.CylinderGeometry(.15,collar,.13,32),steel,0,-.08);
  ring(collar,.08,.07,accent,-.12);
  lugs(spec.gearTeeth,collar,.065,.055,.075,index===1?steel:accent,-.12);
  if(index===0){add(new THREE.CylinderGeometry(.17,.17,.15,32),steel,0,-.235);add(new THREE.CylinderGeometry(.165,.165,.018,32),accent,0,-.301);}
  else if(index===1){add(new THREE.SphereGeometry(.14,32,20),steel,0,-.21);}
  else{const tip=add(new THREE.ConeGeometry(.105,.24,32),steel,0,-.28);tip.rotation.z=Math.PI;}
 }

 return group;
}
export function dispose(group){const materials=new Set();group.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});for(const m of materials){m.map?.dispose();m.dispose();}}
export class PartPreview{
 constructor(container,kind){this.container=container;this.kind=kind;try{this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{container.textContent=kind;return;}this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.toneMapping=THREE.ACESFilmicToneMapping;container.append(this.renderer.domElement);this.scene=new THREE.Scene();this.env=metalEnvironment(this.renderer);this.scene.environment=this.env.texture;this.scene.add(new THREE.HemisphereLight(0xffffff,0x223344,1.2));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-2,4,3);this.scene.add(key);this.camera=new THREE.PerspectiveCamera(32,1,.1,30);this.camera.position.set(0,kind==='bit'?.65:1.35,2.05);this.camera.lookAt(0,kind==='bit'?-.08:0,0);new ResizeObserver(()=>this.render()).observe(container);}
 set(index){if(!this.renderer)return;if(this.part){this.scene.remove(this.part);dispose(this.part);}this.part=new THREE.Group();for(const offset of [-1,0,1]){const piece=makePart(this.kind,(index+offset+3)%3);piece.rotation.y=.5;piece.position.x=offset*1.0;piece.scale.setScalar((this.kind==='blade'?1:this.kind==='ratchet'?1.3:1.65)*(offset?.55:1));if(offset)piece.traverse(o=>{if(o.material){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.50;}});this.part.add(piece);}this.scene.add(this.part);this.render();}
 render(){if(!this.renderer||!this.container.clientWidth)return;const w=this.container.clientWidth,h=this.container.clientHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);}
}

// Reuse the battle's actual parts and metal environment under the phone launcher.
export class LauncherPreview extends PartPreview {
 constructor(container){super(container,'');if(this.camera){this.camera.position.set(0,2.45,.08);this.camera.lookAt(0,.35,0);}}
 set(parts,color){if(!this.renderer)return;if(this.part){this.scene.remove(this.part);dispose(this.part);}this.part=new THREE.Group();for(const [kind,y] of Object.entries(assemblyOffsets(parts))){const piece=makePart(kind,parts[kind]??0,color);piece.position.y=y;this.part.add(piece);}this.scene.add(this.part);this.render();}
}
