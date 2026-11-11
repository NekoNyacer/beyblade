import * as THREE from '/vendor/three.module.js';
import {surfaceHeight,SHOULDER_PROFILE,BOWL_SKIN_OFFSET,CENTER_SKIN_Y,SEAM_CENTER_Y,SEAM_RADIUS} from './rail-config.js';

// The playable surface is continuous: every pocket starts beyond the raised gear crest.
export function buildStadium(stage, rails, config) {
  const {arenaRadius:r,flatRadius,rimHeight,exitAngles,exitHalfWidth,ringOutAngles,ringOutHalfWidth}=config;
  const silver=new THREE.MeshStandardMaterial({color:0xbdc9d3,metalness:.62,roughness:.32,envMapIntensity:.8,side:THREE.DoubleSide});
  const basinMaterial=new THREE.MeshPhysicalMaterial({color:0xc0c9d8,metalness:.28,roughness:.34,clearcoat:.6,envMapIntensity:.7,side:THREE.DoubleSide});
  const dark=new THREE.MeshStandardMaterial({color:0x14232f,metalness:.35,roughness:.5});
  const green=new THREE.MeshPhysicalMaterial({color:0x18ad4c,metalness:.18,roughness:.34,clearcoat:.8,emissive:0x087c2b,emissiveIntensity:.08});
  const glass=new THREE.MeshPhysicalMaterial({color:0xe2f5ff,roughness:.1,transparent:true,opacity:.055,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:1.1,clearcoat:1});
  const add=(geometry,material,parent=stage,y=0)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.y=y;parent.add(mesh);return mesh;};
  const ring=(radius,tube,material,y,parent=stage,start=0,arc=Math.PI*2)=>{
    const mesh=add(new THREE.TorusGeometry(radius,tube,8,Math.max(16,Math.round(arc*32)),arc),material,parent,y);
    mesh.rotation.set(Math.PI/2,0,start);return mesh;
  };
  const quad=(vertices,material,parent)=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();const mesh=add(geometry,material,parent);mesh.receiveShadow=true;return mesh;};
  const outline=new THREE.Shape(),size=r+1.03,cut=.72;
  outline.moveTo(-size+cut,-size);outline.lineTo(size-cut,-size);outline.lineTo(size,-size+cut);outline.lineTo(size,size-cut);outline.lineTo(size-cut,size);outline.lineTo(-size+cut,size);outline.lineTo(-size,size-cut);outline.lineTo(-size,-size+cut);outline.closePath();
  // Keep the top of the underlying chassis below the recessed catch floors.
  const chassisGeometry=new THREE.ExtrudeGeometry(outline,{depth:.11,bevelEnabled:true,bevelThickness:.08,bevelSize:.10,bevelSegments:3,steps:1});chassisGeometry.rotateX(-Math.PI/2);
  const chassis=add(chassisGeometry,dark,stage,-1.12);chassis.receiveShadow=true;chassis.castShadow=true;
  const deck=new THREE.Shape(outline.getPoints()),hole=new THREE.Path();hole.absarc(0,0,r+.94,0,Math.PI*2,true);deck.holes.push(hole);
  const deckGeometry=new THREE.ExtrudeGeometry(deck,{depth:.08,bevelEnabled:true,bevelThickness:.035,bevelSize:.04,bevelSegments:2,steps:1});deckGeometry.rotateX(-Math.PI/2);
  add(deckGeometry,silver,stage,rimHeight-.35).receiveShadow=true;

  const profile=[new THREE.Vector2(0,BOWL_SKIN_OFFSET),new THREE.Vector2(flatRadius,BOWL_SKIN_OFFSET)];
  for(let i=1;i<=56;i++){const radius=flatRadius+(r-flatRadius)*i/56;profile.push(new THREE.Vector2(radius,surfaceHeight(radius,0,r)+BOWL_SKIN_OFFSET));}
  const bowl=add(new THREE.LatheGeometry(profile,160),basinMaterial);bowl.name='battle-bowl';bowl.receiveShadow=true;
  bowl.userData={flatRadius,rimHeight,crestRadius:r};
  const center=add(new THREE.CircleGeometry(flatRadius,128),new THREE.MeshPhysicalMaterial({color:0xe5e8ef,metalness:.16,roughness:.42,clearcoat:.45}),stage,CENTER_SKIN_Y);
  center.rotation.x=-Math.PI/2;center.receiveShadow=true;center.name='flat-battle-center';
  ring(flatRadius,SEAM_RADIUS,new THREE.MeshStandardMaterial({color:0x8295aa,metalness:.4,roughness:.45}),SEAM_CENTER_Y);

  // Exterior shoulders and recessed catches never cut through the bowl or its slope.
  for(let i=0;i<ringOutAngles.length;i++){
    const a=ringOutAngles[i],from=a+ringOutHalfWidth,end=ringOutAngles[(i+1)%ringOutAngles.length]+(i===ringOutAngles.length-1?Math.PI*2:0)-ringOutHalfWidth;
    const lipProfile=SHOULDER_PROFILE.map(([offset,height])=>new THREE.Vector2(r+offset,height));
    add(new THREE.LatheGeometry(lipProfile,48,Math.PI/2-end,end-from),silver).receiveShadow=true;
    const bay=new THREE.Group();bay.name='impact-pocket';bay.rotation.y=-a;bay.position.set(Math.cos(a)*(r+.43),0,Math.sin(a)*(r+.43));bay.userData={index:i,innerRadius:r+.035};stage.add(bay);
    const halfWidth=Math.sin(ringOutHalfWidth)*(r+.4);
    add(new THREE.BoxGeometry(.83,.045,halfWidth*2),dark,bay,config.pocketFloor-.045/2).receiveShadow=true;
    quad([.14,-.88,-halfWidth,.51,rimHeight-.38,-halfWidth,.51,rimHeight-.38,halfWidth,.14,-.88,halfWidth],silver,bay);
    for(const side of [-1,1])quad([-.395,rimHeight-.035,side*halfWidth,.51,rimHeight-.38,side*halfWidth,.14,-.88,side*halfWidth,-.395,-.88,side*halfWidth],silver,bay);
  }

  const shellProfile=[new THREE.Vector2(r+1.03,-.35),new THREE.Vector2(r+1.1,rimHeight-.25),new THREE.Vector2(r+1.04,rimHeight+.55),new THREE.Vector2(r+.68,rimHeight+1.05),new THREE.Vector2(r+.44,rimHeight+1.12)];
  const shell=add(new THREE.LatheGeometry(shellProfile,128),glass);shell.name='clear-protective-shell';shell.renderOrder=4;
  for(const [radius,y,opacity] of [[r+1.08,rimHeight-.2,.16],[r+.44,rimHeight+1.12,.3]]){
    const edge=ring(radius,.014,new THREE.MeshBasicMaterial({color:0xdaefff,transparent:true,opacity,depthWrite:false}),y);edge.renderOrder=5;
  }
  const seam=new THREE.LineBasicMaterial({color:0xd4f1ff,transparent:true,opacity:.18,depthWrite:false});
  for(let i=0;i<8;i++){
    const a=(i+.5)*Math.PI/4,points=shellProfile.map(p=>new THREE.Vector3(Math.cos(a)*p.x,p.y,Math.sin(a)*p.x));
    const edge=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),seam);edge.renderOrder=5;stage.add(edge);
  }
  for(const a of [Math.PI/4,Math.PI*3/4,Math.PI*5/4,Math.PI*7/4]){
    const latch=add(new THREE.BoxGeometry(.32,.08,.24),dark,stage,rimHeight-.21);latch.position.set(Math.cos(a)*(r+1.42),rimHeight-.21,Math.sin(a)*(r+1.42));latch.rotation.y=-a;
    const screw=add(new THREE.CylinderGeometry(.04,.04,.025,12),silver,stage,rimHeight-.16);screw.position.set(latch.position.x,rimHeight-.16,latch.position.z);
  }

  const trackY=rimHeight+.10;
  const sections=exitAngles.map((a,i)=>({start:a+exitHalfWidth,end:exitAngles[(i+1)%exitAngles.length]+(i===exitAngles.length-1?Math.PI*2:0)-exitHalfWidth}));
  const count=sections.reduce((sum,s)=>sum+Math.floor((s.end-s.start)*r/.115),0);
  const teeth=new THREE.InstancedMesh(new THREE.BoxGeometry(.14,.15,.065),green,count);teeth.name='acceleration-gear-teeth';teeth.castShadow=true;
  const transform=new THREE.Object3D();let at=0;
  for(const {start,end} of sections){
    ring(r+.055,.075,green,trackY,rails,start,end-start);
    const n=Math.floor((end-start)*r/.115);
    for(let j=0;j<n;j++){const a=start+(j+.5)/n*(end-start);transform.position.set(Math.cos(a)*r,trackY,Math.sin(a)*r);transform.rotation.y=-a;transform.updateMatrix();teeth.setMatrixAt(at++,transform.matrix);}
  }
  teeth.instanceMatrix.needsUpdate=true;rails.add(teeth);
  // One open, inward-facing chute at the back of the stadium redirects the gear dash.
  for(const angle of exitAngles){
    const gate=new THREE.Group();gate.name='center-dash-outlet';gate.position.set(Math.cos(angle)*r,0,Math.sin(angle)*r);gate.rotation.y=-angle;rails.add(gate);
    for(const side of [-1,1]){
      const points=[new THREE.Vector3(0,trackY,side*r*Math.sin(exitHalfWidth)),new THREE.Vector3(-.22,trackY-.08,side*.25),new THREE.Vector3(-.47,surfaceHeight(r-.47,0,r)+.16,side*.20)];
      const guide=add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),16,.07,8,false),green,gate);guide.castShadow=true;
    }
  }
  const ground=add(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x07121e,roughness:.63,metalness:.28}),stage,-1.28);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;
}
