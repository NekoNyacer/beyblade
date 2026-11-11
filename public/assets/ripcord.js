const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export function appendRipcordEvent(points,event){
  for(const sample of [...(event.getCoalescedEvents?.()||[]),event]){
    const point={x:sample.clientX,y:sample.clientY,t:sample.timeStamp};
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.t))continue;
    const last=points.at(-1);
    if(!last||point.t>last.t)points.push(point);
    else if(point.t===last.t)points[points.length-1]=point;
  }
}
export function measureRipcord(points,stroke){
  const invalid={accepted:false,power:0,speed:0,distance:0,angle:0};
  if(!Number.isFinite(stroke)||stroke<=0||points.length<2)return invalid;
  const first=points[0],last=points.at(-1),distance=(last.x-first.x)/stroke;
  if(!Number.isFinite(distance)||distance<.98)return{...invalid,distance};
  const onset=points.findIndex(p=>p.x-first.x>=stroke*.006);
  if(onset<1)return{...invalid,distance};
  const start=points[onset-1],seconds=(last.t-start.t)/1000;
  if(!Number.isFinite(seconds)||seconds<=0)return{...invalid,distance};
  const speed=Math.max(0,(last.x-start.x)/stroke)/Math.max(.025,seconds);
  const angle=clamp(Math.atan2(Math.abs(last.y-first.y),last.x-first.x)*180/Math.PI,0,25);
  return{accepted:true,power:clamp((speed-1)/6,0,1),speed,distance,angle};
}

export function applyLaunchPull(top,power,angle){
 // Correct the current motion once; network delay must never rewind contacts or position.
 const strength=(power-.5)*2,rotation=angle*Math.PI/180*.2*(top.orbitDir||1),scale=1+strength*.1;
 const vx=top.vx,vz=top.vz;
 top.vx=(vx*Math.cos(rotation)-vz*Math.sin(rotation))*scale;
 top.vz=(vx*Math.sin(rotation)+vz*Math.cos(rotation))*scale;
 top.energy=Math.max(.01,top.energy+strength*11.4);
 top.launchPower=power;top.launchTilt=angle*Math.PI/180;
}
