export const RAIL_EXIT_ANGLES = Object.freeze([Math.PI*1.5]);
export const RING_OUT_ANGLES = Object.freeze([1,2,3,5,6,7].map(n=>n*Math.PI/4));
export const RING_OUT_HALF_WIDTH = .16;
export const isRingOutAngle = angle => RING_OUT_ANGLES.some(port=>Math.abs(Math.atan2(Math.sin(angle-port),Math.cos(angle-port)))<RING_OUT_HALF_WIDTH);
export const arenaRadiusForCount = n => 3.35 + Math.min(1.65,Math.max(0,n-2)*.13);
export function railConfigForCount(n) {
 const arenaRadius=arenaRadiusForCount(n);
 return {arenaRadius,flatRadius:arenaRadius*.60,rimHeight:1.30,railRadius:arenaRadius-.20,exitAngles:RAIL_EXIT_ANGLES,exitHalfWidth:.10,
  ringOutAngles:RING_OUT_ANGLES,ringOutHalfWidth:RING_OUT_HALF_WIDTH,
  pocketOffset:.22,pocketDepth:2.18,pocketFloor:-.88,pocketHalfWidth:.35,pocketOuterOffset:.58,pocketMinEnergy:22,shieldHeight:2.42,
  maxSpeed:14,boostAcceleration:38,energyCost:6,minEnergy:55,minTangent:2.6,
  captureWidth:.22,maxDuration:n<=2?2.8:2.2,cooldown:.42};
}

// One continuous floor: the outer wells start beyond the crest, never in the bowl.
export const surfaceHeight=(x,z,r)=>1.30*Math.min(1,Math.max(0,(Math.hypot(x,z)-r*.60)/(r*.40)))**2;
export const surfaceSlope=(x,z,r)=>2*1.30*Math.min(1,Math.max(0,(Math.hypot(x,z)-r*.60)/(r*.40)))/(r*.40);
export const spinSpeed=energy=>600*Math.max(0,energy)/100;
