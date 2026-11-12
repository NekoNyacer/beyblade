import * as THREE from '/vendor/three.module.js';
import {surfaceHeight,surfaceGradient,DASH_BANK_HALF_ANGLE,RAIL_EXIT_ANGLES,dashBankBevel,dashBackLipWidth,dashRailInset,SHOULDER_PROFILE,shoulderHeightAtOffset,BOWL_SKIN_OFFSET,GROOVE_RADIUS_RATIO,GROOVE_HALF_WIDTH_RATIO} from './rail-config.js';

function moldedBowlGeometry(flatRadius,r) {
  // Keep rows along the moving crest, including the small radius under the green rail.
  const bankRows=48,rollRows=8,lipRows=8,wingSegments=72,segments=264;
  const grooveStart=r*(GROOVE_RADIUS_RATIO-GROOVE_HALF_WIDTH_RATIO);
  const grooveWidth=2*r*GROOVE_HALF_WIDTH_RATIO,grooveRows=24;
  const profile=[new THREE.Vector2(0,0)];
  for(let j=0;j<=grooveRows;j++)profile.push(new THREE.Vector2(grooveStart+grooveWidth*j/grooveRows,0));
  const bankStart=profile.length;
  profile.push(new THREE.Vector2(flatRadius,0));
  for(let j=1;j<=bankRows+rollRows;j++)profile.push(new THREE.Vector2(flatRadius+(r-flatRadius)*j/(bankRows+rollRows),0));
  const shelfEnd=profile.length;
  for(let j=0;j<=lipRows;j++)profile.push(new THREE.Vector2(r,0));
  const geometry=new THREE.LatheGeometry(profile,segments);
  const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
  const colors=new Float32Array(positions.count*3);
  const centerTint=new THREE.Color(0xe5e8ef),bankTint=new THREE.Color(0xc0c9d8),tint=new THREE.Color();
  for(let i=0;i<=segments;i++){
    const inWings=i<=wingSegments;
    const travel=inWings?2*DASH_BANK_HALF_ANGLE*i/wingSegments:
      2*DASH_BANK_HALF_ANGLE+(Math.PI*2-2*DASH_BANK_HALF_ANGLE)*(i-wingSegments)/(segments-wingSegments);
    const angle=RAIL_EXIT_ANGLES[0]+DASH_BANK_HALF_ANGLE-travel,cos=Math.cos(angle),sin=Math.sin(angle);
    const inset=inWings?dashRailInset(Math.abs(DASH_BANK_HALF_ANGLE-travel)):0;
    const crest=r-inset,rounding=dashBankBevel(inset),lipWidth=dashBackLipWidth(inset);
    for(let row=0;row<profile.length;row++){
      let radius=profile[row].x;
      if(row>=shelfEnd)radius=r-lipWidth*(1-(row-shelfEnd)/lipRows);
      else if(row>bankStart+bankRows)radius=crest-rounding+rounding*(row-bankStart-bankRows)/rollRows;
      else if(row>=bankStart)radius=flatRadius+(crest-rounding-flatRadius)*(row-bankStart)/bankRows;
      const x=cos*radius,z=sin*radius,index=i*profile.length+row;
      positions.setXYZ(index,x,surfaceHeight(x,z,r)+BOWL_SKIN_OFFSET,z);
      tint.lerpColors(centerTint,bankTint,THREE.MathUtils.smoothstep(radius,grooveStart,flatRadius)).toArray(colors,index*3);
      const normalRadius=Math.min(radius,r-.0002);
      const slope=surfaceGradient(cos*normalRadius,sin*normalRadius,r),length=Math.hypot(slope.x,1,slope.z);
      // An outward-running lathe faces down; the double-sided material turns this normal upward.
      normals.setXYZ(index,slope.x/length,-1/length,slope.z/length);
    }
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  return geometry;
}

function buildDashRail(rails,r,rimHeight,exitAngles,exitHalfWidth) {
  const green=new THREE.MeshPhysicalMaterial({color:0x07872e,roughness:.4,clearcoat:.5,clearcoatRoughness:.27});
  const circumference=2*Math.PI,steps=Math.ceil(circumference*r/.038),maxInset=dashRailInset(0,exitHalfWidth);
  const positions=[],indices=[],toothPath=[];
  const distanceToExit=angle=>{
    let distance=Math.PI;
    for(const exit of exitAngles)distance=Math.min(distance,Math.abs(Math.atan2(Math.sin(angle-exit),Math.cos(angle-exit))));
    return distance;
  };
  for(let i=0;i<steps;i++){
    const angle=i/steps*circumference,cos=Math.cos(angle),sin=Math.sin(angle);
    const distance=distanceToExit(angle);
    const inset=dashRailInset(distance,exitHalfWidth);
    const inner=r-.014-inset,outer=r+.19-.30*inset/maxInset;
    const innerFloor=surfaceHeight(cos*inner,sin*inner,r),outerFloor=surfaceHeight(cos*outer,sin*outer,r);
    const innerY=innerFloor+.085,outerY=outerFloor+.085;
    const profile=[[inner,innerFloor-.04],[inner,innerY-.022]];
    // Keep mesh rows on the two bends of the rear sill as it passes under the band.
    const topInner=inner+.018,topOuter=outer-.018;
    const lipStart=THREE.MathUtils.clamp(r-dashBackLipWidth(inset),topInner,topOuter);
    const lipEnd=THREE.MathUtils.clamp(r,topInner,topOuter);
    const roof=radius=>profile.push([radius,surfaceHeight(cos*radius,sin*radius,r)+.085]);
    roof(topInner);
    for(let j=0;j<=8;j++)roof(lipStart+(lipEnd-lipStart)*j/8);
    roof(topOuter);
    profile.push([outer,outerY-.022],[outer,Math.min(rimHeight-.08,outerFloor-.04)]);
    const here=i*profile.length,next=(i+1)%steps*profile.length;
    for(let j=0;j<profile.length;j++){
      const [radius,height]=profile[j];
      positions.push(cos*radius,height,sin*radius);
      const k=(j+1)%profile.length;
      indices.push(here+j,next+j,next+k,here+j,next+k,here+k);
    }
    toothPath.push(new THREE.Vector3(cos*inner,innerY-.052,sin*inner));
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const normals=geometry.getAttribute('normal'),stride=positions.length/(3*steps);
  for(let i=0;i<steps;i++)for(let j=2;j<stride-2;j++){
    const index=i*stride+j,slope=surfaceGradient(positions[index*3],positions[index*3+2],r);
    const length=Math.hypot(slope.x,1,slope.z);
    normals.setXYZ(index,-slope.x/length,1/length,-slope.z/length);
  }
  const band=new THREE.Mesh(geometry,green);band.name='dash-rail-band';band.castShadow=true;band.receiveShadow=true;rails.add(band);

  const edge=new THREE.CatmullRomCurve3(toothPath,true);
  edge.arcLengthDivisions=steps;
  const count=Math.round(edge.getLength()/.075);
  const teeth=new THREE.InstancedMesh(new THREE.BoxGeometry(.056,.058,.035),green,count);
  const transform=new THREE.Object3D(),tangent=new THREE.Vector3();
  let installed=0;
  for(let i=0;i<count;i++){
    const u=i/count;
    edge.getPointAt(u,transform.position);
    if(distanceToExit(Math.atan2(transform.position.z,transform.position.x))<exitHalfWidth)continue;
    edge.getTangentAt(u,tangent);
    transform.rotation.set(-Math.asin(tangent.y),Math.atan2(tangent.x,tangent.z),0,'YXZ');
    transform.translateX(-.014);transform.updateMatrix();teeth.setMatrixAt(installed++,transform.matrix);
  }
  teeth.count=installed;teeth.name='acceleration-gear-teeth';teeth.castShadow=true;
  teeth.instanceMatrix.needsUpdate=true;rails.add(teeth);
}

// The playable surface is continuous: every pocket starts beyond the raised gear crest.
export function buildStadium(stage, rails, config) {
  const {arenaRadius:r,flatRadius,rimHeight,exitAngles,exitHalfWidth,ringOutAngles,ringOutHalfWidths}=config;
  const silver=new THREE.MeshStandardMaterial({color:0xbdc9d3,metalness:.62,roughness:.32,envMapIntensity:.8,side:THREE.DoubleSide});
  const basinMaterial=new THREE.MeshPhysicalMaterial({color:0xc0c9d8,metalness:.28,roughness:.34,clearcoat:.6,envMapIntensity:.7,side:THREE.DoubleSide});
  const dark=new THREE.MeshStandardMaterial({color:0x14232f,metalness:.35,roughness:.5});
  const glass=new THREE.MeshPhysicalMaterial({color:0xe2f5ff,roughness:.1,transparent:true,opacity:.055,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:1.1,clearcoat:1});
  const add=(geometry,material,parent=stage,y=0)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.y=y;parent.add(mesh);return mesh;};
  const ring=(radius,tube,material,y,parent=stage,start=0,arc=Math.PI*2)=>{
    const mesh=add(new THREE.TorusGeometry(radius,tube,8,Math.max(16,Math.round(arc*32)),arc),material,parent,y);
    mesh.rotation.set(Math.PI/2,0,start);return mesh;
  };
  const outline=new THREE.Shape(),size=r+1.03,cut=.72;
  outline.moveTo(-size+cut,-size);outline.lineTo(size-cut,-size);outline.lineTo(size,-size+cut);outline.lineTo(size,size-cut);outline.lineTo(size-cut,size);outline.lineTo(-size+cut,size);outline.lineTo(-size,size-cut);outline.lineTo(-size,-size+cut);outline.closePath();
  // A closed, load-bearing shell hides the bowl underside without changing a playable surface.
  const housing=new THREE.Group();housing.name='armored-arena-base';stage.add(housing);
  const armor=new THREE.MeshStandardMaterial({color:0x9eabb8,metalness:.62,roughness:.34,envMapIntensity:.65});
  const graphite=new THREE.MeshStandardMaterial({color:0x101820,metalness:.65,roughness:.42,envMapIntensity:.45});
  const extrude=(shape,depth,bevel,material,y)=>{
    const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,steps:1});geometry.rotateX(-Math.PI/2);
    const mesh=add(geometry,material,housing,y);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
  };
  extrude(outline,.16,.065,graphite,-1.14);
  const deck=new THREE.Shape(outline.getPoints()),hole=new THREE.Path();hole.absarc(0,0,r+.94,0,Math.PI*2,true);deck.holes.push(hole);
  extrude(deck,rimHeight+.43,.04,armor,-.87);
  const deckGeometry=new THREE.ExtrudeGeometry(deck,{depth:.08,bevelEnabled:true,bevelThickness:.035,bevelSize:.04,bevelSegments:2,steps:1});deckGeometry.rotateX(-Math.PI/2);
  add(deckGeometry,silver,housing,rimHeight-.35).receiveShadow=true;
  const skirt=extrude(deck,.11,.025,graphite,-.91);skirt.name='recessed-base-reveal';
  const front=new THREE.Shape();
  front.moveTo(-size*.53,-.73);front.lineTo(size*.53,-.73);front.lineTo(size*.62,-.38);
  front.lineTo(size*.52,.43);front.lineTo(-size*.52,.43);front.lineTo(-size*.62,-.38);front.closePath();
  const fascia=new THREE.Mesh(new THREE.ExtrudeGeometry(front,{depth:.09,bevelEnabled:true,bevelThickness:.035,bevelSize:.035,bevelSegments:2}),silver);
  fascia.name='front-armor-fascia';fascia.position.z=size-.015;fascia.castShadow=true;housing.add(fascia);
  const ventGeometry=new THREE.BoxGeometry(.045,.30,.016);
  const vents=new THREE.InstancedMesh(ventGeometry,graphite,12),ventPose=new THREE.Object3D();
  for(let i=0;i<12;i++){
    const side=i<6?-1:1,slot=i%6;
    ventPose.position.set(side*(size*.67+slot*.075),-.36,size+.045);ventPose.rotation.z=side*-.24;
    ventPose.updateMatrix();vents.setMatrixAt(i,ventPose.matrix);
  }
  vents.name='base-cooling-slots';housing.add(vents);
  const seamPoints=[];
  for(const sx of [-1,1])for(const sz of [-1,1]){
    seamPoints.push(new THREE.Vector3(sx*(size-cut*.8),rimHeight-.225,sz*(size-.08)),
      new THREE.Vector3(sx*(r+.95)*.73,rimHeight-.225,sz*(r+.95)*.73));
  }
  housing.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seamPoints),
    new THREE.LineBasicMaterial({color:0x526170,transparent:true,opacity:.42})));

  const bowlMaterial=basinMaterial.clone();bowlMaterial.color.set(0xffffff);bowlMaterial.vertexColors=true;
  const bowl=add(moldedBowlGeometry(flatRadius,r),bowlMaterial);bowl.name='battle-bowl';bowl.receiveShadow=true;
  bowl.userData={flatRadius,rimHeight,crestRadius:r};
  const logoMap=new THREE.TextureLoader().load('/assets/cathayblade-on-light.svg');
  logoMap.colorSpace=THREE.SRGBColorSpace;logoMap.anisotropy=4;
  const logoWidth=flatRadius*1.48;
  const logo=add(new THREE.PlaneGeometry(logoWidth,logoWidth*248/1600),
    new THREE.MeshBasicMaterial({map:logoMap,transparent:true,toneMapped:false,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),stage,BOWL_SKIN_OFFSET+.001);
  logo.name='cathayblade-floor-print';logo.rotation.x=-Math.PI/2;logo.position.z=flatRadius*.17;

  // The sharp inner lip is under the rail. Across the exposed apron the tray
  // rises gently to the same shoulder surface used for ground contact.
  const floor=config.pocketFloor;
  const trayProfile=[[0,rimHeight+BOWL_SKIN_OFFSET],[.002,rimHeight+BOWL_SKIN_OFFSET],
    [.005,floor],[.12,floor],[.22,floor],[.48,floor],[.60,floor],[.69,floor+.025],
    [.81,floor+.075],[.88,shoulderHeightAtOffset(.88,r)],[.97,shoulderHeightAtOffset(.97,r)]];
  const lipProfile=SHOULDER_PROFILE.map(([offset])=>new THREE.Vector2(r+offset,shoulderHeightAtOffset(offset,r)));
  const trayRings=trayProfile.map(([offset])=>new THREE.Vector2(r+offset,shoulderHeightAtOffset(offset,r)));
  const trayMaterial=basinMaterial.clone();trayMaterial.vertexColors=true;
  // Only the inside edge is sheltered by the overhanging rail.
  const sheltered=new THREE.Color(0x495969),exposed=new THREE.Color(0xffffff),tint=new THREE.Color();
  for(let i=0;i<ringOutAngles.length;i++){
    const next=(i+1)%ringOutAngles.length,angle=ringOutAngles[i],halfWidth=ringOutHalfWidths[i];
    const from=angle+halfWidth,end=ringOutAngles[next]+(next===0?Math.PI*2:0)-ringOutHalfWidths[next];
    add(new THREE.LatheGeometry(lipProfile,48,Math.PI/2-end,end-from),basinMaterial).receiveShadow=true;
    const segments=24;
    const geometry=new THREE.LatheGeometry(trayRings,segments,Math.PI/2-angle-halfWidth,2*halfWidth);
    const positions=geometry.getAttribute('position'),colors=new Float32Array(positions.count*3);
    for(let column=0;column<=segments;column++){
      const distance=Math.abs(2*column/segments-1);
      const blend=THREE.MathUtils.smoothstep(distance,.68,1);
      trayProfile.forEach(([offset,floorY],row)=>{
        const at=column*trayProfile.length+row;
        positions.setY(at,THREE.MathUtils.lerp(floorY,trayRings[row].y,blend));
        const light=THREE.MathUtils.smoothstep(offset,.19,.47);
        tint.lerpColors(sheltered,exposed,light+(1-light)*blend).toArray(colors,at*3);
      });
    }
    geometry.computeVertexNormals();
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const bay=add(geometry,trayMaterial);
    bay.name='impact-pocket';bay.userData={index:i,innerRadius:r+.002};bay.receiveShadow=true;
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

  buildDashRail(rails,r,rimHeight,exitAngles,exitHalfWidth);
  const grainSize=128,grain=new Uint8Array(grainSize*grainSize*4);let seed=73;
  for(let i=0;i<grain.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const value=100+(seed>>>26);grain.set([value,value,value,255],i);}
  const groundTexture=new THREE.DataTexture(grain,grainSize,grainSize);groundTexture.wrapS=groundTexture.wrapT=THREE.RepeatWrapping;
  groundTexture.repeat.set(120,120);groundTexture.magFilter=THREE.LinearFilter;groundTexture.minFilter=THREE.LinearMipmapLinearFilter;groundTexture.generateMipmaps=true;groundTexture.needsUpdate=true;
  const ground=add(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x04070b,roughness:.72,metalness:.32,envMapIntensity:.08,map:groundTexture,bumpMap:groundTexture,bumpScale:.009}),stage,-1.28);
  ground.name='graphite-stage-floor';ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;
  const seams=[],border=size+.67,chamfer=1.0;
  const floorOutline=[[-border+chamfer,-border],[border-chamfer,-border],[border,-border+chamfer],[border,border-chamfer],[border-chamfer,border],[-border+chamfer,border],[-border,border-chamfer],[-border,-border+chamfer]];
  for(let i=0;i<floorOutline.length;i++){
    const a=floorOutline[i],b=floorOutline[(i+1)%floorOutline.length];seams.push(new THREE.Vector3(a[0],-1.265,a[1]),new THREE.Vector3(b[0],-1.265,b[1]));
  }
  for(const side of [-1,1]){
    seams.push(new THREE.Vector3(side*(border-.8),-1.265,-border),new THREE.Vector3(side*(border+3),-1.265,-26));
    seams.push(new THREE.Vector3(side*border,-1.265,border-.8),new THREE.Vector3(side*(border+7),-1.265,border+8));
  }
  const floorSeams=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seams),new THREE.LineBasicMaterial({color:0x4f6577,transparent:true,opacity:.25}));
  floorSeams.name='stage-panel-seams';stage.add(floorSeams);
}
