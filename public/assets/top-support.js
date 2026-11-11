import {BOWL_SKIN_OFFSET,CENTER_SKIN_Y,SEAM_CENTER_Y,SEAM_RADIUS,SHOULDER_PROFILE,shoulderHeightAtOffset,surfaceHeightAtRadius} from './rail-config.js';
const MERIDIAN_SPACING=.035,SKIN_CLEARANCE=.004;

// The metal bowl is drawn below the simulation datum. A thin torus covers
// the join between the center disk and the lathed bank.
function skinAtRadius(radius,arenaRadius){
  const flat=arenaRadius*.60,fromSeam=radius-flat;
  if(fromSeam < -SEAM_RADIUS)return CENTER_SKIN_Y;
  if(Math.abs(fromSeam)<=SEAM_RADIUS)return SEAM_CENTER_Y+Math.sqrt(Math.max(0,SEAM_RADIUS**2-fromSeam**2));
  if(radius<=arenaRadius)return surfaceHeightAtRadius(radius,arenaRadius)+BOWL_SKIN_OFFSET;
  return shoulderHeightAtOffset(radius-arenaRadius)??SHOULDER_PROFILE.at(-1)[1];
}
export const bowlSkinY=(x,z,arenaRadius)=>skinAtRadius(Math.hypot(x,z),arenaRadius);

// The only local maxima of the radial skin are the center trim and the
// first shoulder bevel. This bounds a whole ring before sampling its rim.
function highestSkin(inner,outer,arenaRadius){
  const flat=arenaRadius*.60,peak=arenaRadius+SHOULDER_PROFILE[1][0];
  let height=skinAtRadius(Math.max(inner,Math.min(peak,outer)),arenaRadius);
  if(inner<=flat+SEAM_RADIUS&&outer>=flat-SEAM_RADIUS)
    height=Math.max(height,skinAtRadius(Math.max(inner,Math.min(flat,outer)),arenaRadius));
  return height;
}

// The rotating assembly sweeps out rings. Build their outer meridian once
// from the real meshes, including the rounded bit and the metal blade bevels.
export function buildTopSupport(rotor){
  rotor.updateWorldMatrix(true,true);
  const inverse=rotor.matrixWorld.clone().invert(),transform=inverse.clone(),point=rotor.position.clone();
  const levels=new Map(),vertices=new Map();
  rotor.traverse(mesh=>{
    const positions=mesh.isMesh&&mesh.geometry.getAttribute('position');
    if(!positions)return;
    transform.multiplyMatrices(inverse,mesh.matrixWorld);
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i).applyMatrix4(transform);
      const y=Math.round(point.y*1e6)/1e6,r=Math.hypot(point.x,point.z);
      levels.set(y,Math.max(r,levels.get(y)||0));
      const vertex=[point.x,y,point.z];vertices.set(vertex.map(n=>n.toFixed(6)).join(','),vertex);
    }
  });
  const heights=[...levels.keys()].sort((a,b)=>a-b),tipY=heights[0],outline=[];
  for(const y of heights){
    const next={y:y-tipY,r:levels.get(y)};
    while(outline.length>=2){
      const a=outline.at(-2),b=outline.at(-1);
      if((b.r-a.r)*(next.y-b.y)>(next.r-b.r)*(b.y-a.y))break;
      outline.pop();
    }
    outline.push(next);
  }
  const meridian=[{y:0,r:0},...outline,{y:outline.at(-1).y,r:0}],rings=[];
  for(let i=1;i<meridian.length;i++){
    const a=meridian[i-1],b=meridian[i],steps=Math.ceil(Math.hypot(b.r-a.r,b.y-a.y)/MERIDIAN_SPACING);
    for(let j=0;j<steps;j++)rings.push({r:a.r+(b.r-a.r)*j/steps,y:a.y+(b.y-a.y)*j/steps});
  }
  rings.push(meridian.at(-1));
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
  const center=Math.hypot(x,z),flat=arenaRadius*.60;
  if(center+support.extent<flat-SEAM_RADIUS)return CENTER_SKIN_Y+flatContactY(support,q);
  const axisX=2*(q.x*q.y-q.w*q.z),axisZ=2*(q.y*q.z+q.w*q.x);
  const side=Math.hypot(axisX,axisZ),up=1-2*(q.x*q.x+q.z*q.z);
  const ux=side>1e-8?axisX/side:1,uz=side>1e-8?axisZ/side:0;
  const along=x*ux+z*uz,across=z*ux-x*uz;
  let height=skinAtRadius(center,arenaRadius)+(center>flat+SEAM_RADIUS?SKIN_CLEARANCE:0);
  for(const {r,y} of support.rings){
    const cx=along+y*side,cr=Math.sqrt(cx*cx+across*across);
    const inner=Math.max(0,cr-r),outer=cr+r,low=y*up-r*side;
    const bound=highestSkin(inner,outer,arenaRadius)-low;
    if(bound<=height)continue;
    if(outer<flat-SEAM_RADIUS){height=bound;continue;}
    if(side<1e-8){height=bound+SKIN_CLEARANCE;continue;}
    for(const [cos,sin] of directions){
      const px=cx+r*up*cos,pz=across+r*sin,radial=Math.sqrt(px*px+pz*pz);
      const localY=y*up-r*side*cos;
      height=Math.max(height,skinAtRadius(radial,arenaRadius)-localY+SKIN_CLEARANCE);
      // Preserve the narrow raised seam between samples of the swept shell.
      if(Math.abs(radial-flat)<SEAM_RADIUS+MERIDIAN_SPACING/2)
        height=Math.max(height,SEAM_CENTER_Y+SEAM_RADIUS-localY);
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
