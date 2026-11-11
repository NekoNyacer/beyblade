// Dimensionless arcade tuning, not measured hardware specifications.
const freezeList=items=>Object.freeze(items.map(item=>Object.freeze(item)));
export const PART_CATALOG=Object.freeze({
 blade:freezeList([
  {id:'swept-three',name:'三刃突擊',shortName:'三刃',description:'三枚彎刃，反彈與挑起明顯；耗旋較快。',lobes:3,mass:1,inertia:1,restitution:.96,lift:.66},
  {id:'shield-six',name:'六瓣重盾',shortName:'重盾',description:'六瓣厚盾，較重、受撞位移較小；反彈較溫和。',lobes:6,mass:1.20,inertia:1.12,restitution:.78,lift:.38},
  {id:'endurance-ring',name:'圓環持久',shortName:'圓環',description:'圓滑外重環，慣量較高、耗旋較慢；挑起較弱。',lobes:0,mass:1.07,inertia:1.32,restitution:.88,lift:.24}
 ]),
 ratchet:freezeList([
  {id:'low-three',name:'低三凸',shortName:'低三凸',description:'低矮三大凸點，標準重心與擺動。',lobes:3,height:.15,balance:1,spinLoss:1},
  {id:'high-six',name:'高六凸',shortName:'高六凸',description:'高身六凸點，接觸位置較高、擺動與耗旋較大。',lobes:6,height:.27,balance:1.36,spinLoss:1.10},
  {id:'low-nine',name:'低九凸',shortName:'低九凸',description:'低薄九小凸點，重心較低、擺動與耗旋較小。',lobes:9,height:.11,balance:.72,spinLoss:.94}
 ]),
 bit:freezeList([
  {id:'flat-gear',name:'寬平底',shortName:'平底',description:'寬平接地、大齒圈，跑動與軌道加速強，耗旋較快。',profile:'flat',tipY:-.31,gearTeeth:8,meshThreshold:.25,grip:1,drive:1,spinLoss:1},
  {id:'disk-ball',name:'圓球底',shortName:'球底',description:'圓球接地、寬護盤，中等移動與耗旋，較不易咬軌。',profile:'ball',tipY:-.35,gearTeeth:6,meshThreshold:.55,grip:.72,drive:.70,spinLoss:.88},
  {id:'needle-gear',name:'細尖底',shortName:'尖底',description:'細尖接地、小齒圈，移動慢、耗旋低，軌道加速弱。',profile:'needle',tipY:-.40,gearTeeth:4,meshThreshold:.72,grip:.44,drive:.34,spinLoss:.76}
 ])
});
export function partDefinition(kind,index=0){const list=PART_CATALOG[kind];if(!list)throw new RangeError('Unknown part kind');return list[Number.isInteger(index)&&index>=0&&index<list.length?index:0];}
export function assemblyOffsets(parts={}){const delta=partDefinition('ratchet',parts.ratchet).height-.15;return {bit:.30,ratchet:.43+delta/2,blade:.62+delta};}
export function physicsForParts(parts={}){
 const blade=partDefinition('blade',parts.blade),ratchet=partDefinition('ratchet',parts.ratchet),bit=partDefinition('bit',parts.bit);
 return {mass:blade.mass,inertia:blade.inertia,restitution:blade.restitution,lift:blade.lift,balance:ratchet.balance,
  heightOffset:ratchet.height-.15-(bit.tipY+.31),spinLoss:ratchet.spinLoss*bit.spinLoss/blade.inertia,
  grip:bit.grip,drive:bit.drive,gearTeeth:bit.gearTeeth,meshThreshold:bit.meshThreshold};
}
