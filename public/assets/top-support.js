import {BOWL_SKIN_OFFSET,GROOVE_RADIUS_RATIO,GROOVE_HALF_WIDTH_RATIO,SHOULDER_PROFILE,shoulderHeightAtOffset,surfaceHeight,surfaceHeightAtRadius,touchesDashBank} from './rail-config.js';
const MERIDIAN_SPACING=.035,SKIN_CLEARANCE=.004;

function skinAtRadius(radius,arenaRadius){
  if(radius<=arenaRadius)return surfaceHeightAtRadius(radius,arenaRadius)+BOWL_SKIN_OFFSET;
  return shoulderHeightAtOffset(radius-arenaRadius,arenaRadius)??SHOULDER_PROFILE.at(-1)[1];
}
export function bowlSkinY(x,z,arenaRadius){
  const radius=Math.hypot(x,z);
  if(radius>arenaRadius*.60&&radius<=arenaRadius)return surfaceHeight(x,z,arenaRadius)+BOWL_SKIN_OFFSET;
  return skinAtRadius(radius,arenaRadius);
}

// A ring can span both sides of the trough. The highest point is at an
// endpoint, or on the shoulder bevel if the ring reaches beyond the bowl.
function highestSkin(inner,outer,arenaRadius){
  const crest=arenaRadius+SHOULDER_PROFILE[1][0];
  return Math.max(skinAtRadius(inner,arenaRadius),
    skinAtRadius(Math.max(inner,Math.min(outer,crest)),arenaRadius));
}

// The rotating assembly sweeps out rings. Build each mesh meridian once
// from the real meshes, including the rounded bit and the metal blade bevels.
export function buildTopSupport(rotor){
  rotor.updateWorldMatrix(true,true);
  const inverse=rotor.matrixWorld.clone().invert(),transform=inverse.clone(),point=rotor.position.clone();
  const levels=new Map(),vertices=new Map(),meshLevels=[];
  rotor.traverse(mesh=>{
    const positions=mesh.isMesh&&mesh.geometry.getAttribute('position');
    if(!positions)return;
    transform.multiplyMatrices(inverse,mesh.matrixWorld);
    const localLevels=new Map();meshLevels.push(localLevels);
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i).applyMatrix4(transform);
      const y=Math.round(point.y*1e6)/1e6,r=Math.hypot(point.x,point.z);
      levels.set(y,Math.max(r,levels.get(y)||0));
      localLevels.set(y,Math.max(r,localLevels.get(y)||0));
      const vertex=[point.x,y,point.z];vertices.set(vertex.map(n=>n.toFixed(6)).join(','),vertex);
    }
  });
  const tipY=Math.min(...levels.keys());
  const meridianFor=levels=>{
    const heights=[...levels.keys()].sort((a,b)=>a-b),outline=[];
    for(const y of heights){
      const next={y:y-tipY,r:levels.get(y)};
      while(outline.length>=2){
        const a=outline.at(-2),b=outline.at(-1);
        if((b.r-a.r)*(next.y-b.y)>(next.r-b.r)*(b.y-a.y))break;
        outline.pop();
      }
      outline.push(next);
    }
    return outline;
  };
  const outline=meridianFor(levels),rings=[];
  // Separate meshes must not invent a solid cone between the bit and blade.
  for(const levels of meshLevels){
    const outline=meridianFor(levels);
    const meridian=[{y:outline[0].y,r:0},...outline,{y:outline.at(-1).y,r:0}];
    for(let i=1;i<meridian.length;i++){
      const a=meridian[i-1],b=meridian[i],steps=Math.ceil(Math.hypot(b.r-a.r,b.y-a.y)/MERIDIAN_SPACING);
      for(let j=0;j<steps;j++)rings.push({r:a.r+(b.r-a.r)*j/steps,y:a.y+(b.y-a.y)*j/steps});
    }
    rings.push(meridian.at(-1));
  }
  return {tipY,outline,rings,vertices:[...vertices.values()],point,extent:Math.max(...outline.map(p=>Math.hypot(p.r,p.y)))};
}

export function flatContactY(support,q){
  const up=1-2*(q.x*q.x+q.z*q.z),side=Math.sqrt(Math.max(0,1-up*up));
  let height=0;
  for(const ring of support.outline)height=Math.max(height,ring.r*side-ring.y*up);
  return height;
}

const sectors=48;
const directions=Array.from({length:sectors},(_,i)=>{
  const angle=2*Math.PI*i/sectors;
  return [Math.cos(angle),Math.sin(angle)];
});

// Sweep the meridian in the frame of the lean axis; spin phase cannot make
// a serrated blade bob. The half-plane on each side of the tip is sampled
// because the exterior shoulder falls away beyond the crest.
export function bowlSupportY(support,q,x,z,arenaRadius){
  const center=Math.hypot(x,z),flatEnd=arenaRadius*(GROOVE_RADIUS_RATIO-GROOVE_HALF_WIDTH_RATIO);
  if(center+support.extent<flatEnd)return BOWL_SKIN_OFFSET+flatContactY(support,q);
  const axisX=2*(q.x*q.y-q.w*q.z),axisZ=2*(q.y*q.z+q.w*q.x);
  const side=Math.hypot(axisX,axisZ),up=1-2*(q.x*q.x+q.z*q.z);
  const ux=side>1e-8?axisX/side:1,uz=side>1e-8?axisZ/side:0;
  const along=x*ux+z*uz,across=z*ux-x*uz;
  const nearOutlet=touchesDashBank(x,z,arenaRadius,support.extent);
  let height=bowlSkinY(x,z,arenaRadius)+(center>flatEnd?SKIN_CLEARANCE:0);
  for(const {r,y} of support.rings){
    const cx=along+y*side,cr=Math.sqrt(cx*cx+across*across);
    const inner=Math.max(0,cr-r),outer=cr+r,low=y*up-r*side;
    // At each radius the crest comes furthest inward on the outlet centerline.
    let peak=highestSkin(inner,outer,arenaRadius);
    if(nearOutlet&&inner<arenaRadius)peak=Math.max(peak,surfaceHeight(0,-outer,arenaRadius)+BOWL_SKIN_OFFSET);
    const bound=peak-low;
    if(bound<=height)continue;
    if(outer<flatEnd){height=bound;continue;}
    if(side<1e-8&&!nearOutlet){height=bound+SKIN_CLEARANCE;continue;}
    for(const [cos,sin] of directions){
      const px=cx+r*up*cos,pz=across+r*sin,radial=Math.sqrt(px*px+pz*pz);
      const localY=y*up-r*side*cos;
      const skin=nearOutlet?bowlSkinY(px*ux-pz*uz,px*uz+pz*ux,arenaRadius):skinAtRadius(radial,arenaRadius);
      height=Math.max(height,skin-localY+SKIN_CLEARANCE);
    }
  }
  return height;
}

// Once rotation stops, gaps between the three blades are no longer a solid ring.
export function restingSupportY(support,q,spin,x,z,arenaRadius,floor=null){
 const cos=Math.cos(spin),sin=Math.sin(spin),point=support.point;
 let height=-Infinity;
 for(const [vx,vy,vz] of support.vertices){
  point.set(cos*vx+sin*vz,vy-support.tipY,-sin*vx+cos*vz).applyQuaternion(q);
  const surface=floor===null?bowlSkinY(x+point.x,z+point.z,arenaRadius):floor;
  height=Math.max(height,surface-point.y);
 }
 return height+SKIN_CLEARANCE;
}
