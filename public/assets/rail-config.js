export const RAIL_EXIT_ANGLES = Object.freeze([Math.PI*1.5]);
export const RING_OUT_ANGLES = Object.freeze([1,2,3,5,6,7].map(n=>n*Math.PI/4));
export const RING_OUT_HALF_WIDTH = .16;
export const isRingOutAngle = angle => RING_OUT_ANGLES.some(port=>Math.abs(Math.atan2(Math.sin(angle-port),Math.cos(angle-port)))<RING_OUT_HALF_WIDTH);
const RIM_HEIGHT=1.30;
export const BOWL_SKIN_OFFSET=-.035, CENTER_SKIN_Y=-.031, SEAM_CENTER_Y=-.018, SEAM_RADIUS=.012;
// Radial distance beyond the crest and surface height of the silver shoulder.
export const SHOULDER_PROFILE=[[0,RIM_HEIGHT+BOWL_SKIN_OFFSET],[.12,RIM_HEIGHT-.03],[.48,RIM_HEIGHT-.14],[.88,RIM_HEIGHT-.38],[.97,-.74]];
export function shoulderHeightAtOffset(offset){
 if(offset<0)return null;
 for(let i=1;i<SHOULDER_PROFILE.length;i++){
  const [end,height]=SHOULDER_PROFILE[i];
  if(offset<=end){
   const [start,previous]=SHOULDER_PROFILE[i-1];
   return previous+(height-previous)*(offset-start)/(end-start);
  }
 }
 return null;
}
export function shoulderHeight(x,z,arenaRadius){
 const offset=Math.hypot(x,z)-arenaRadius;
 if(offset<=0||isRingOutAngle(Math.atan2(z,x)))return null;
 return shoulderHeightAtOffset(offset);
}
export const arenaRadiusForCount = n => 3.35 + Math.min(1.65,Math.max(0,n-2)*.13);
export function railConfigForCount(n) {
 const arenaRadius=arenaRadiusForCount(n);
 return {arenaRadius,flatRadius:arenaRadius*.60,rimHeight:RIM_HEIGHT,railRadius:arenaRadius-.20,exitAngles:RAIL_EXIT_ANGLES,exitHalfWidth:.10,
  ringOutAngles:RING_OUT_ANGLES,ringOutHalfWidth:RING_OUT_HALF_WIDTH,
  pocketOffset:.22,pocketDepth:2.18,pocketFloor:-.88,pocketHalfWidth:.35,pocketOuterOffset:.58,pocketMinEnergy:22,shieldHeight:2.42,
  maxSpeed:14,boostAcceleration:38,energyCost:6,minEnergy:32,minTangent:2.3,
  captureWidth:.12,maxDuration:n<=2?2.8:2.2,cooldown:.42};
}

// One continuous floor: the outer wells start beyond the crest, never in the bowl.
export const surfaceHeightAtRadius=(radius,r)=>RIM_HEIGHT*Math.min(1,Math.max(0,(radius-r*.60)/(r*.40)))**2;
export const surfaceHeight=(x,z,r)=>surfaceHeightAtRadius(Math.hypot(x,z),r);
export const surfaceSlope=(x,z,r)=>2*RIM_HEIGHT*Math.min(1,Math.max(0,(Math.hypot(x,z)-r*.60)/(r*.40)))/(r*.40);
export const spinSpeed=energy=>600*Math.max(0,energy)/100;
