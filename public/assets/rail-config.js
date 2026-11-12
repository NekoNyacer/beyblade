export const RAIL_EXIT_ANGLES = Object.freeze([Math.PI*1.5]);
export const RING_OUT_ANGLES = Object.freeze([1,2,3,5,6,7].map(n=>n*Math.PI/4));
export const RING_OUT_HALF_WIDTH = .16;
// The broad front catch lies on the camera-facing (+Z) side of the bowl.
export const RING_OUT_HALF_WIDTHS=Object.freeze(RING_OUT_ANGLES.map(angle=>angle===Math.PI/2 ? .30 : RING_OUT_HALF_WIDTH));
export function pocketIndexAtAngle(angle){
 return RING_OUT_ANGLES.findIndex((port,i)=>Math.abs(Math.atan2(Math.sin(angle-port),Math.cos(angle-port)))<RING_OUT_HALF_WIDTHS[i]);
}
export const isRingOutAngle = angle => pocketIndexAtAngle(angle)>=0;
const RIM_HEIGHT=1.30;
// A small duel bowl has a shorter climb. Lower its crest rather than applying
// an invisible uphill assist; large arenas retain the original 1.30-unit rim.
export const rimHeightForRadius=r=>1.05+.25*Math.max(0,Math.min(1,(r-3.35)/1.04));
export const BOWL_SKIN_OFFSET=-.035, CENTER_SKIN_Y=BOWL_SKIN_OFFSET;
// Radial distance beyond the crest and surface height of the silver shoulder.
export const SHOULDER_PROFILE=[[0,RIM_HEIGHT+BOWL_SKIN_OFFSET],[.12,RIM_HEIGHT-.03],[.48,RIM_HEIGHT-.14],[.88,RIM_HEIGHT-.38],[.97,-.74]];
export function shoulderHeightAtOffset(offset,arenaRadius){
 if(offset<0)return null;
 const shift=arenaRadius===undefined?0:rimHeightForRadius(arenaRadius)-RIM_HEIGHT;
 const heightAt=i=>SHOULDER_PROFILE[i][1]+(i===SHOULDER_PROFILE.length-1?0:shift);
 for(let i=1;i<SHOULDER_PROFILE.length;i++){
  const [end]=SHOULDER_PROFILE[i],height=heightAt(i);
  if(offset<=end){
   const [start]=SHOULDER_PROFILE[i-1],previous=heightAt(i-1);
   return previous+(height-previous)*(offset-start)/(end-start);
  }
 }
 return null;
}
export function shoulderHeight(x,z,arenaRadius){
 const offset=Math.hypot(x,z)-arenaRadius;
 if(offset<=0||isRingOutAngle(Math.atan2(z,x)))return null;
 return shoulderHeightAtOffset(offset,arenaRadius);
}
export const arenaRadiusForCount = n => 3.35 + Math.min(1.65,Math.max(0,n-2)*.13);
export function railConfigForCount(n) {
 const arenaRadius=arenaRadiusForCount(n),rimHeight=rimHeightForRadius(arenaRadius),pocketDepth=.45;
 const largeBowl=Math.max(0,Math.min(1,(arenaRadius-3.35)/1.04));
 return {arenaRadius,flatRadius:arenaRadius*.60,rimHeight,railRadius:arenaRadius-.20,exitAngles:RAIL_EXIT_ANGLES,exitHalfWidth:EXIT_HALF_WIDTH,
  ringOutAngles:RING_OUT_ANGLES,ringOutHalfWidth:RING_OUT_HALF_WIDTH,ringOutHalfWidths:RING_OUT_HALF_WIDTHS,
  pocketOffset:.22,pocketDepth,pocketFloor:rimHeight-pocketDepth,pocketHalfWidth:.35,pocketOuterOffset:.58,pocketMinEnergy:22,shieldHeight:rimHeight+1.12,
  maxSpeed:14,boostAcceleration:52,energyCost:2.04,minEnergy:32,releaseEnergy:24,minTangent:1.9,
  maxEntryRadialRatio:1.25,meshAllowance:.55,
  bankFriction:.65+.30*largeBowl,maxBankFriction:4.2+1.5*largeBowl,bankRadialDrag:.24+.11*largeBowl,
  captureWidth:.37,maxDuration:n<=2?2.8:2.2,cooldown:.28};
}

// The folded rail descends from both sides into a low shelf above the center run.
const EXIT_HALF_WIDTH=.10, FOLD_END=5.8, MAX_FOLD_INSET=.35, EXIT_HEIGHT=.74;
export const DASH_BANK_HALF_ANGLE=EXIT_HALF_WIDTH*FOLD_END;
export const dashBankBevel=inset=>.34*inset;
export const dashBackLipWidth=inset=>.26*inset;
const wingSin=Math.sin(DASH_BANK_HALF_ANGLE),wingCos=Math.cos(DASH_BANK_HALF_ANGLE);
const exitX=Math.cos(RAIL_EXIT_ANGLES[0]),exitZ=Math.sin(RAIL_EXIT_ANGLES[0]);
export function dashRailInset(distance,halfWidth=EXIT_HALF_WIDTH){
 const t=Math.max(0,Math.min(1,(distance/halfWidth-1)/(FOLD_END-1)));
 return MAX_FOLD_INSET*(1-t*t*(3-2*t));
}

function withinWings(x,z,padding){
 const along=x*exitX+z*exitZ,across=x*exitZ-z*exitX;
 return along*wingSin-Math.abs(across)*wingCos>=-padding;
}
export function touchesDashBank(x,z,r,padding=0){
 if(!withinWings(x,z,padding))return false;
 const radius=Math.hypot(x,z);
 return radius+padding>=r*.60&&radius-padding<=r;
}

// One shallow molded channel. Its height, slope and curvature meet the flat floor at both lips.
export const GROOVE_RADIUS_RATIO=.54, GROOVE_HALF_WIDTH_RATIO=.055, GROOVE_DEPTH=.045;
const groovePosition=(radius,r)=>(radius-r*GROOVE_RADIUS_RATIO)/(r*GROOVE_HALF_WIDTH_RATIO);
export function grooveSlope(radius,r){
 const u=groovePosition(radius,r);
 return Math.abs(u)<1?6*GROOVE_DEPTH*u*(1-u*u)**2/(r*GROOVE_HALF_WIDTH_RATIO):0;
}
export function grooveCurvature(radius,r){
 const u=groovePosition(radius,r);
 return Math.abs(u)<1?6*GROOVE_DEPTH*(1-u*u)*(1-5*u*u)/(r*GROOVE_HALF_WIDTH_RATIO)**2:0;
}
export function surfaceHeightAtRadius(radius,r){
 if(radius<r*.60){
  const u=groovePosition(radius,r);
  return Math.abs(u)<1?-GROOVE_DEPTH*(1-u*u)**3:0;
 }
 return rimHeightForRadius(r)*Math.min(1,(radius-r*.60)/(r*.40))**2;
}
export function surfaceHeight(x,z,r){
 const radius=Math.hypot(x,z),flat=r*.60;
 if(radius<=flat||radius>=r||!withinWings(x,z,0))return surfaceHeightAtRadius(radius,r);
 const distance=Math.atan2(Math.abs(x*exitZ-z*exitX),x*exitX+z*exitZ);
 const inset=dashRailInset(distance),run=r-flat-inset;
 const rimHeight=rimHeightForRadius(r),crest=rimHeight-(rimHeight-EXIT_HEIGHT)*inset/MAX_FOLD_INSET;
 const lipWidth=dashBackLipWidth(inset);
 if(radius>r-lipWidth){
  // Keep the rear pocket sill at its normal height behind the lowered gear.
  const t=(radius-r+lipWidth)/lipWidth;
  return crest+(rimHeight-crest)*t*t*(3-2*t);
 }
 const u=Math.min(1,(radius-flat)/run);
 // Round the last part of the climb into the ledge that carries the green tab.
 const bevel=dashBankBevel(inset)/run;
 if(!bevel||u<=1-bevel)return crest*u*u;
 const t=(u-1+bevel)/bevel;
 return crest*(u*u+2*bevel*t*t*(1-t));
}
const radialSlope=(radius,r)=>radius<r*.60?grooveSlope(radius,r):2*rimHeightForRadius(r)*Math.min(1,(radius-r*.60)/(r*.40))/(r*.40);
export function surfaceGradient(x,z,r){
 const radius=Math.hypot(x,z);
 if(radius===0||radius>r)return {x:0,z:0};
 if(radius<=r*.60||!withinWings(x,z,0)){
  const scale=radialSlope(radius,r)/radius;
  return {x:x*scale,z:z*scale};
 }
 const e=.0001;
 return {x:(surfaceHeight(x+e,z,r)-surfaceHeight(x-e,z,r))/(2*e),
         z:(surfaceHeight(x,z+e,r)-surfaceHeight(x,z-e,r))/(2*e)};
}
export function surfaceSlope(x,z,r){
 const radius=Math.hypot(x,z);
 if(!touchesDashBank(x,z,r))return radialSlope(radius,r);
 const gradient=surfaceGradient(x,z,r);
 return (x*gradient.x+z*gradient.z)/radius;
}
export const spinSpeed=energy=>600*Math.max(0,energy)/100;
export const STANDARD_LAUNCH_RPM=7200;
export const STANDARD_LAUNCH_ENERGY=(STANDARD_LAUNCH_RPM*2*Math.PI/60)/spinSpeed(1);
