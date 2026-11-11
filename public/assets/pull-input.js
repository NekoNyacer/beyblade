import {measureRipcord} from './ripcord.js';
export function measurePracticePull(points,stroke){
 const result=measureRipcord(points,stroke);
 const first=points[0],last=points.at(-1);
 const signedAngle=first&&last?Math.max(-25,Math.min(25,Math.atan2(last.y-first.y,last.x-first.x)*180/Math.PI)):0;
 return {...result,angle:signedAngle};
}
