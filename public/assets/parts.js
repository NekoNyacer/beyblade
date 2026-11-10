import * as THREE from '/vendor/three.module.js';
export function metalEnvironment(renderer){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d');
 const sky=ctx.createLinearGradient(0,0,0,512);sky.addColorStop(0,'#b8c9df');sky.addColorStop(.45,'#637589');sky.addColorStop(.55,'#182538');sky.addColorStop(1,'#405169');ctx.fillStyle=sky;ctx.fillRect(0,0,1024,512);
 for(const [x,y,w,h]of [[80,90,190,110],[460,60,100,220],[760,120,180,65]]){const glow=ctx.createLinearGradient(x,0,x+w,0);glow.addColorStop(0,'#61758b');glow.addColorStop(.3,'#ffffff');glow.addColorStop(.7,'#ffffff');glow.addColorStop(1,'#61758b');ctx.fillStyle=glow;ctx.fillRect(x,y,w,h);}
 const texture=new THREE.CanvasTexture(canvas);texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.SRGBColorSpace;const pmrem=new THREE.PMREMGenerator(renderer);const target=pmrem.fromEquirectangular(texture);texture.dispose();pmrem.dispose();return target;
}
export function makePart(kind,index=0,color='#ff486a'){
 const group=new THREE.Group(),steel=new THREE.MeshStandardMaterial({color:0xc6d2df,metalness:1,roughness:.16}),accent=new THREE.MeshPhysicalMaterial({color,metalness:.65,roughness:.21,clearcoat:1,clearcoatRoughness:.12,emissive:color,emissiveIntensity:.12}),dark=new THREE.MeshStandardMaterial({color:0x283440,metalness:.9,roughness:.3});
 const add=(geometry,material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;group.add(m);return m;};
 if(kind==='blade'){
  add(new THREE.CylinderGeometry(.43,.46,.12,48),dark);
  const n=5+index;for(let i=0;i<n;i++){const a=i/n*Math.PI*2;const shape=new THREE.Shape();shape.moveTo(.2,-.13);shape.lineTo(.53,-.09);shape.lineTo(.48,.12);shape.lineTo(.3,.22);shape.lineTo(.23,.09);shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:.065,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:2,steps:1});g.rotateX(-Math.PI/2);const wing=add(g,steel);wing.rotation.y=a;const trim=add(new THREE.BoxGeometry(.16,.055,.13),accent,Math.cos(a)*.3,.085,Math.sin(a)*.3);trim.rotation.y=-a;}
  const ring=add(new THREE.TorusGeometry(.23,.045,8,40),accent,0,.09);ring.rotation.x=Math.PI/2;add(new THREE.CylinderGeometry(.19,.19,.06,32),steel,0,.11);
 }else if(kind==='ratchet'){
  const ring=add(new THREE.TorusGeometry(.28,.09,8,12+index*6),steel);ring.rotation.x=Math.PI/2;
  for(let i=0;i<4+index;i++){const a=i/(4+index)*Math.PI*2;const tooth=add(new THREE.BoxGeometry(.12,.15,.13),accent,Math.sin(a)*.32,0,Math.cos(a)*.32);tooth.rotation.y=a;}
 }else{
  add(new THREE.CylinderGeometry(.16,.18,.24,16),steel,0,.08);add(new THREE.CylinderGeometry(.23,.2,.12,12),accent,0,-.08);
  if(index===0){const tip=add(new THREE.ConeGeometry(.12,.24,24),steel,0,-.24);tip.rotation.z=Math.PI;}
  else if(index===1)add(new THREE.SphereGeometry(.13,24,12),steel,0,-.22);
  else add(new THREE.CylinderGeometry(.12,.12,.15,24),dark,0,-.22);
 }
 return group;
}
export function dispose(group){const materials=new Set();group.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});for(const m of materials){m.map?.dispose();m.dispose();}}
export class PartPreview{
 constructor(container,kind){this.container=container;this.kind=kind;try{this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{container.textContent=kind;return;}this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.toneMapping=THREE.ACESFilmicToneMapping;container.append(this.renderer.domElement);this.scene=new THREE.Scene();this.env=metalEnvironment(this.renderer);this.scene.environment=this.env.texture;this.scene.add(new THREE.HemisphereLight(0xffffff,0x223344,1.2));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-2,4,3);this.scene.add(key);this.camera=new THREE.PerspectiveCamera(32,1,.1,30);this.camera.position.set(0,1.35,2.05);this.camera.lookAt(0,0,0);new ResizeObserver(()=>this.render()).observe(container);}
 set(index){if(!this.renderer)return;if(this.part){this.scene.remove(this.part);dispose(this.part);}this.part=new THREE.Group();for(const offset of [-1,0,1]){const piece=makePart(this.kind,(index+offset+3)%3);piece.rotation.y=.5;piece.position.x=offset*1.0;piece.scale.setScalar((this.kind==='blade'?1:this.kind==='ratchet'?1.3:1.65)*(offset?.55:1));if(offset)piece.traverse(o=>{if(o.material){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.35;}});this.part.add(piece);}this.scene.add(this.part);this.render();}
 render(){if(!this.renderer||!this.container.clientWidth)return;const w=this.container.clientWidth,h=this.container.clientHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);}
}

// Reuse the battle's actual parts and metal environment under the phone launcher.
export class LauncherPreview extends PartPreview {
 constructor(container){super(container,'');if(this.camera){this.camera.position.set(0,2.1,.08);this.camera.lookAt(0,0,0);}}
 set(parts,color){if(!this.renderer)return;if(this.part){this.scene.remove(this.part);dispose(this.part);}this.part=new THREE.Group();for(const [kind,y] of [['blade',0],['ratchet',-.15],['bit',-.35]]){const piece=makePart(kind,parts[kind]??0,color);piece.position.y=y;this.part.add(piece);}this.scene.add(this.part);this.render();}
}
