import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {existsSync,mkdirSync,mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('.qa',{recursive:true});
const app=createApp({port:0,dataDir:mkdtempSync(path.resolve('.qa','stadium-check-'))});await app.listen();
const base=`http://127.0.0.1:${app.server.address().port}`;
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
const errors=[],results={};
try {
  const context=await browser.newContext({viewport:{width:1440,height:1080}});
  await context.route('**/assets/arena.js',async route=>{const response=await route.fetch();const body=(await response.text()).replace('constructor(container) {','constructor(container) { window.__arena=this;');await route.fulfill({response,body});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/scenarios');
  await page.waitForFunction(()=>document.querySelector('#scene-frame')?.contentWindow.__arena?.playbackFrame?.t>.4);
  let frame=page.frames().find(f=>f.url().includes('/display?'));
  const geometry=await frame.evaluate(()=>{const a=window.__arena,shell=a.scene.getObjectByName('clear-protective-shell'),teeth=a.scene.getObjectByName('acceleration-gear-teeth');return{radius:a.arenaRadius,tops:a.playbackFrame.tops.length,shell:!!shell,opacity:shell?.material.opacity,teeth:teeth?.count,drawCalls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles};});
  assert.equal(geometry.tops,2);assert.ok(geometry.radius<4.5);assert.ok(geometry.shell&&geometry.opacity<.15);assert.ok(geometry.teeth>80);results.geometry=geometry;
  const bowl=await frame.evaluate(()=>{const a=window.__arena,b=a.scene.getObjectByName('battle-bowl'),pockets=[];a.stage.traverse(o=>{if(o.name==='impact-pocket')pockets.push(o.userData.innerRadius);});return{...b.userData,pockets,center:a.surfaceY(0,0),flat:a.surfaceY(a.arenaRadius*.6,0),crest:a.surfaceY(a.arenaRadius,0),labels:[...a.tops.values()].map(t=>({sprite:t.label.isSprite,overhead:t.label.position.y,number:t.label.userData.number,name:t.label.userData.playerName,independent:t.label.parent===t.group,depthTest:t.label.material.depthTest}))};});
  assert.equal(bowl.center,0);assert.equal(bowl.flat,0);assert.equal(bowl.crest,1.3);assert.equal(bowl.pockets.length,6);assert.ok(bowl.pockets.every(r=>r>bowl.crestRadius));assert.ok(bowl.labels.every(t=>t.sprite&&t.overhead>1&&t.name&&t.number&&t.independent&&!t.depthTest));results.bowl=bowl;
  await page.click('#play-pause');await frame.waitForFunction(()=>__arena.paused);
  const frozen=await frame.evaluate(()=>({clock:__arena.clock,camera:__arena.camera.position.toArray(),tops:[...__arena.tops.values()].map(t=>({p:t.group.position.toArray(),r:t.rotor.rotation.toArray()}))}));
  await page.waitForTimeout(300);
  assert.deepEqual(await frame.evaluate(()=>({clock:__arena.clock,camera:__arena.camera.position.toArray(),tops:[...__arena.tops.values()].map(t=>({p:t.group.position.toArray(),r:t.rotor.rotation.toArray()}))})),frozen);results.pause=true;
  await page.screenshot({path:'.qa/stadium-desktop.png',fullPage:true});
  await page.click('#play-pause');await page.waitForTimeout(250);assert.ok(await frame.evaluate(t=>__arena.clock>t,frozen.clock));
  const sceneIds=await page.locator('[data-scene]').evaluateAll(nodes=>nodes.map(n=>n.dataset.scene));
  results.scenes=[];
  for(const id of sceneIds){await page.locator(`[data-scene="${id}"]`).click();await page.waitForFunction(()=>!!document.querySelector('#scene-frame')?.contentWindow.__arena?.renderer);frame=page.frames().find(f=>f.url().includes('/display?'));await frame.waitForFunction(()=>!!window.__arena?.players.length);assert.equal(await frame.locator('#error').isVisible(),false);results.scenes.push(id);}
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/scenarios?scene=duel');await page.waitForFunction(()=>document.querySelector('#scene-frame')?.contentWindow.__arena?.playbackFrame?.t>.3);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.click('#play-pause');await page.screenshot({path:'.qa/stadium-mobile.png',fullPage:true});results.mobileOverflow=false;
  const render=await context.newPage();render.on('pageerror',e=>errors.push(e.message));await render.setViewportSize({width:1600,height:1100});await render.goto(base+'/healthz');
  await render.evaluate(async()=>{
    document.body.innerHTML='<div id="arena" style="width:1600px;height:1100px"></div>';document.body.style='margin:0;background:#080f1c';
    window.__now=0;Object.defineProperty(performance,'now',{value:()=>window.__now});window.requestAnimationFrame=()=>0;
    const {Arena}=await import('/assets/arena.js');window.a=new Arena(document.querySelector('#arena'));window.data=await fetch('/assets/scenario-data.json').then(r=>r.json());
    window.seek=(key,target)=>{a.idle();a.setPaused(false);const clip=data[key];a.roster(data.players.slice(0,clip.frames[0].tops.length));let i=0;for(let ms=0;ms<=target*1000+100;ms+=1000/60){window.__now=ms;while(i<clip.frames.length&&clip.frames[i].t<=ms/1000+.0001)a.update(clip.frames[i++]);a.loop();}a.setPaused(true);a.loop();};
  });
  const contactPoses=await render.evaluate(measureContactPoses);
  for(const pose of contactPoses){
    if(pose.kind!=='flight')assert.ok(pose.clearance>=-.003&&pose.clearance<.10,`contact gap for ${pose.kind}, part ${pose.part}: ${pose.clearance}`);
    if(pose.kind==='bank')assert.ok(pose.inward>.05&&pose.sideways<.02&&pose.lean<.30,`bank pose: ${JSON.stringify(pose)}`);
    if(pose.kind==='flat'||pose.kind==='flight')assert.ok(pose.lean<.01);
    if(pose.kind==='flight')assert.ok(pose.clearance>.55,'the top remains above the bank during flight');
    if(pose.kind==='low')assert.ok(pose.lean>.005&&pose.lean<=.14001,'low-spin wobble on the flat');
    if(pose.kind==='rest')assert.ok(pose.lean>.6,'the rested top still tips over');
  }
  results.contactPoses={samples:contactPoses.length,minimumClearance:Math.min(...contactPoses.map(p=>p.clearance)),
    bankLean:contactPoses.filter(p=>p.kind==='bank').map(p=>p.lean)};
  await render.evaluate(()=>seek('rail',1.3));await render.screenshot({path:'.qa/bowl-arena.png'});
  const lowTime=await render.evaluate(()=>data.duel.frames.find(f=>f.tops.some(t=>t.alive&&!t.settling&&t.energy<12))?.t);assert.ok(lowTime>0);
  await render.evaluate(t=>seek('duel',t),lowTime);await render.screenshot({path:'.qa/bowl-low-spin.png'});
  results.lowSpin=await render.evaluate(()=>a.playbackFrame.tops.filter(t=>t.alive&&!t.settling&&t.energy<15).map(t=>({energy:t.energy,lean:window.shaftLean(a.tops.get(t.id))})));
  assert.ok(results.lowSpin.length&&results.lowSpin.every(t=>Number.isFinite(t.lean)));
  await render.evaluate(()=>seek('dense',.8));await render.screenshot({path:'.qa/bowl-dense.png'});
  const settlingTime=await render.evaluate(()=>data.duel.frames.find(f=>f.tops.some(t=>t.alive&&t.settling&&t.angularSpeed<1))?.t);assert.ok(settlingTime>0);
  await render.evaluate(t=>seek('duel',t),settlingTime);await render.screenshot({path:'.qa/bowl-settling.png'});
  results.settling=await render.evaluate(()=>({done:a.playbackFrame.done,tops:a.playbackFrame.tops.filter(t=>t.alive&&t.settling).map(t=>({speed:t.angularSpeed,spin:t.spin,lean:window.shaftLean(a.tops.get(t.id))}))}));assert.equal(results.settling.done,false);assert.ok(results.settling.tops.length);
  const moments=await render.evaluate(()=>{const hits=data.duel.frames.flatMap(f=>f.events).filter(e=>e.type==='hit');const clips=Object.entries(data).filter(([k,v])=>v?.frames);return{hit:hits[0]?.t,pocket:clips.map(([key,c])=>({key,time:c.frames.find(f=>f.tops.some(t=>t.pocketActive&&t.pocketDepth>.5))?.t})).find(p=>p.time!==undefined),exit:clips.some(([k,c])=>c.frames.some(f=>f.events.some(e=>e.type==='pocket'&&e.phase==='exit')))};});
  assert.ok(moments.hit>=0);assert.ok(moments.pocket&&moments.exit,'recorded true pocket entry and recovery');
  await render.evaluate(t=>seek('duel',t+.04),moments.hit);await render.screenshot({path:'.qa/stadium-impact.png'});
  await render.evaluate(({key,time})=>seek(key,time),moments.pocket);await render.screenshot({path:'.qa/stadium-pocket.png'});
  const pocketPose=await render.evaluate(()=>a.playbackFrame.tops.filter(t=>t.pocketActive&&t.pocketDepth>.05).map(t=>({depth:t.pocketDepth,y:a.tops.get(t.id).group.position.y,surface:a.surfaceY(t.x,t.z)})));
  assert.ok(pocketPose.length&&pocketPose.every(t=>t.depth>0&&t.y<t.surface));results.pocketPose=pocketPose;
  await render.emulateMedia({reducedMotion:'reduce'});await render.waitForTimeout(50);const reduced=await render.evaluate(()=>{a.loop();return{reduced:a.reduced,trails:[...a.tops.values()].some(t=>t.trail.visible),spin:[...a.tops.values()].some(t=>t.rotor.rotation.y!==0)};});assert.deepEqual(reduced,{reduced:true,trails:false,spin:false});results.reduced=reduced;
  assert.equal(app.rooms.size,0);assert.deepEqual(errors,[]);results.errors=errors;results.passed=true;
} finally {await browser.close();await app.close();writeFileSync('.qa/stadium-browser-results.json',JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));

async function measureContactPoses(){
  const {Vector3,Raycaster}=await import('/vendor/three.module.js');
  const up=new Vector3(0,1,0),ray=new Raycaster(),down=new Vector3(0,-1,0),vertex=new Vector3(),closest=new Vector3();
  const shaft=item=>up.clone().transformDirection(item.rotor.matrixWorld);
  window.shaftLean=item=>shaft(item).angleTo(up);
  const clip=data.duel.frames[0],player=data.players[0],source=clip.tops[0],poses=[];
  const {railConfigForCount,shoulderHeight}=await import('/assets/rail-config.js');
  const config=railConfigForCount(clip.tops.length);
  for(let part=0;part<3;part++){
    a.roster([{...player,parts:{bit:part,ratchet:part,blade:part}}]);
    for(const [kind,radius,angle,spin] of [
      ['flat',.6,0,0],['bank',clip.railRadius-.38,.2,.7],['bank',clip.railRadius-.1,2.25,2.9],
      ['flight',clip.railRadius-.1,.2,.7],['low',.6,0,1.1],['rest',clip.railRadius-.18,3.6,1.8],
      ['pocket',clip.arenaRadius+.42,config.ringOutAngles[0],1.1]
    ]){
      a.idle();a.setPaused(false);
      const x=radius*Math.cos(angle),z=radius*Math.sin(angle),height=a.surfaceY(x,z);
      const inPocket=kind==='pocket';
      const top={...source,x,z,spin,tilt:0,y:inPocket?config.pocketFloor:height+(kind==='flight'?1.3:0),vy:kind==='flight'?2:0,
        pocketActive:inPocket,pocketIndex:inPocket?0:null,pocketDepth:inPocket?height-config.pocketFloor:0,
        energy:kind==='rest'?0:kind==='low'?10:95,angularSpeed:kind==='rest'?0:100,settling:kind==='rest',settleStartSpeed:10};
      a.update({...clip,t:1,tops:[top],events:[]});a.loop();
      const item=a.tops.get(player.id),axis=shaft(item);
      let minimum=Infinity;
      // Find the most exposed underside vertex, including the spinning silhouette.
      item.rotor.traverseVisible(mesh=>{
        if(!mesh.isMesh)return;
        const positions=mesh.geometry.getAttribute('position');
        for(let i=0;i<positions.count;i++){
          vertex.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
          const r=Math.hypot(vertex.x,vertex.z);
          let surface=config.pocketFloor;
          if(!inPocket)surface=r>a.arenaRadius?shoulderHeight(vertex.x,vertex.z,a.arenaRadius):
            a.surfaceY(vertex.x,vertex.z)-(r<config.flatRadius ? .031 : .035);
          if(surface===null)continue;
          const gap=vertex.y-surface;
          if(gap<minimum){minimum=gap;closest.copy(vertex);}
        }
      });
      ray.set(new Vector3(closest.x,5,closest.z),down);
      // A tilted blade can contact the silver shoulder beyond the bowl crest.
      const floors=inPocket?a.stage.getObjectByName('impact-pocket').children.filter(o=>o.geometry?.type==='BoxGeometry'):
        a.stage.children.filter(o=>o.name==='flat-battle-center'||(o.geometry?.type==='LatheGeometry'&&o.name!=='clear-protective-shell'));
      const floor=ray.intersectObjects(floors,false)[0];
      poses.push({kind,part,lean:axis.angleTo(up),inward:-(axis.x*x+axis.z*z)/radius,
        sideways:Math.abs(axis.z*x-axis.x*z)/radius,clearance:closest.y-floor.point.y});
    }
  }
  return poses;
}
