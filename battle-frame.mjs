import { railConfigForCount, spinSpeed } from './public/assets/rail-config.js';
// Live spectators and recorded scenarios share the same public snapshot representation.
export function battleFrame(battle, roundId, events = battle.events) {
  const rail=railConfigForCount(battle.tops.length);
  return {
    roundId, tick: battle.tick, t: +battle.t.toFixed(6), done: battle.done,
    winnerId: battle.winnerId, arenaRadius: battle.arenaRadius ?? rail.arenaRadius, railRadius: battle.railRadius ?? rail.railRadius,
    exitAngles:[...rail.exitAngles],exitHalfWidth:rail.exitHalfWidth,
    ringOutAngles:[...rail.ringOutAngles],ringOutHalfWidth:rail.ringOutHalfWidth,
    tops: battle.tops.map(top => ({ id: top.id, parts:{...(top.parts??{blade:0,ratchet:0,bit:0})},outReason:top.outReason??null,
      x: +top.x.toFixed(5), z: +top.z.toFixed(5),vx: +top.vx.toFixed(5), vz: +top.vz.toFixed(5), energy: +top.energy.toFixed(4),
      angularSpeed:+(top.angularSpeed??spinSpeed(top.energy)).toFixed(5),settling:Boolean(top.settling),settleStartSpeed:top.settleStartSpeed??null,
      y:+(top.y??0).toFixed(5),vy:+(top.vy??0).toFixed(5),tilt:top.tilt??0,launchPower:top.launchPower??.5,launchTilt:top.launchTilt??0,railTravel:top.railTravel??0,
      spin: +top.spin.toFixed(6), alive: top.alive,lastHit:top.lastHit??null,lastHitTime:top.lastHitTime??null,
      pocketActive:Boolean(top.pocketActive),pocketIndex:top.pocketIndex??null,pocketDepth:+(top.pocketDepth??0).toFixed(5),
      railActive: Boolean(top.railActive), railDir: top.railDir ?? 0,railEntered:top.railEntered??0,railUntil:top.railUntil??0,railCooldown:top.railCooldown??0 })),
    events: events.map(event => ({ ...event }))
  };
}
