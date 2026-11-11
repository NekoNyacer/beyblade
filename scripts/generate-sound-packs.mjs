import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const SR=44100, TAU=2*Math.PI;
const output='public/assets/sound-packs';
let seed=49821;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const buffer=seconds=>new Float64Array(Math.ceil(seconds*SR));
const mix=(out,input,at=0,gain=1)=>{const start=Math.round(at*SR);for(let i=0;i<input.length&&i+start<out.length;i++)if(i+start>=0)out[i+start]+=input[i]*gain;};
function tone(seconds,freq,end=freq,gain=1,decay=4,wave='sine'){
 const a=buffer(seconds);let phase=0;for(let i=0;i<a.length;i++){const t=i/SR,p=t/seconds;phase+=TAU*(freq+(end-freq)*p)/SR;const s=wave==='triangle'?2/Math.PI*Math.asin(Math.sin(phase)):wave==='square'?Math.tanh(4*Math.sin(phase)):Math.sin(phase);a[i]=s*gain*Math.exp(-decay*p)*Math.min(1,t/.004)*Math.min(1,(seconds-t)/.025);}return a;
}
function air(seconds,low=900,high=5000,decay=5,gain=1){
 const a=buffer(seconds);let lp=0,hp=0;const al=1-Math.exp(-TAU*high/SR),ah=1-Math.exp(-TAU*low/SR);for(let i=0;i<a.length;i++){const n=random()*2-1;lp+=al*(n-lp);hp+=ah*(lp-hp);const t=i/SR;a[i]=(lp-hp)*gain*Math.exp(-decay*t/seconds)*Math.min(1,t/.002)*Math.min(1,(seconds-t)/.025);}return a;
}
function clang(seconds,base,gain=1,damping=5){const a=buffer(seconds);[1,1.47,2.09,2.81,3.63,4.71].forEach((r,i)=>mix(a,tone(seconds,base*r,base*r*.995,gain/(1+i*.8),damping+i*.6)));return a;}
function swoosh(seconds,gain=1){const a=air(seconds,250,6500,0,gain);for(let i=0;i<a.length;i++){const p=i/a.length;a[i]*=Math.pow(Math.sin(Math.PI*p),1.6);}return a;}
function fanfare(notes,beat,base,wave='sine'){const a=buffer(notes.length*beat+1);notes.forEach((n,i)=>{mix(a,tone(.6,base*2**(n/12),undefined,.8,6,wave),i*beat);mix(a,tone(.9,base*2**((n-12)/12),undefined,.5,5),i*beat);});return a;}
function readWav(file){const b=fs.readFileSync(file);assert.equal(b.toString('ascii',0,4),'RIFF');let off=12,rate,bits,ch,data;while(off+8<=b.length){const id=b.toString('ascii',off,off+4),len=b.readUInt32LE(off+4);if(id==='fmt '){assert.equal(b.readUInt16LE(off+8),1);ch=b.readUInt16LE(off+10);rate=b.readUInt32LE(off+12);bits=b.readUInt16LE(off+22);}if(id==='data')data=b.subarray(off+8,off+8+len);off+=8+len+(len%2);}assert.equal(bits,16);assert.equal(ch,1);assert.ok(data);const a=Float64Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768);let first=0,last=a.length-1;while(first<last&&Math.abs(a[first])<.007)first++;while(last>first&&Math.abs(a[last])<.007)last--;const cut=a.slice(Math.max(0,first-180),Math.min(a.length,last+220));return {samples:cut,rate};}
function resample(a,fromRate,pitch=1){const n=Math.ceil(a.length*SR/fromRate/pitch),out=new Float64Array(n);for(let i=0;i<n;i++){const x=i*fromRate/SR*pitch,j=Math.floor(x),f=x-j;out[i]=(a[j]||0)*(1-f)+(a[j+1]||0)*f;}return out;}
function stretch(a,targetSeconds){
 // Preview-only granular sustain. Upgrade to performed voiceover for final announcer delivery.
 const target=Math.round(targetSeconds*SR);if(target<=a.length)return a;
 const out=new Float64Array(target),weights=new Float64Array(target),grain=1764,hop=441,ratio=a.length/target;
 for(let dst=0;dst<target;dst+=hop){const src=Math.min(a.length-grain,Math.max(0,Math.round(dst*ratio)));for(let j=0;j<grain&&dst+j<target;j++){const w=.5-.5*Math.cos(TAU*j/(grain-1));out[dst+j]+=a[src+j]*w;weights[dst+j]+=w;}}
 for(let i=0;i<target;i++)out[i]/=Math.max(.01,weights[i]);return out;
}
function voice(cue,p){const src=readWav(`.qa/sound-voice-source/${cue}.wav`);let a=resample(src.samples,src.rate,p.voicePitch);if(cue==='announcer_go')a=stretch(a,1.5);if(cue.startsWith('countdown')&&a.length>SR*.73)a=resample(a,SR,a.length/(SR*.73));const out=buffer(a.length/SR+(cue.startsWith('countdown')?.15:.4));let low=0;for(let i=0;i<a.length;i++){low+=.18*(a[i]-low);const x=p.id==='metal'?a[i]-.35*low:a[i];out[i]=Math.tanh(x*1.6)*.72;}mix(out,a,.065,p.voiceEcho);mix(out,a,.13,p.voiceEcho*.35);return out;}
function loop(p){const seconds=4,a=buffer(seconds),base=p.loopBase;const phases=Array.from({length:150},()=>random()*TAU);for(let i=0;i<a.length;i++){const t=i*seconds/(a.length-1);let s=0;for(let k=0;k<150;k++){const hz=100+(k*91)%5500;s+=Math.sin(TAU*hz*t+phases[k])/(10+k*.22);}const whine=Math.sin(TAU*base*t+.13*Math.sin(TAU*18*t))+.36*Math.sin(TAU*base*2*t)+.18*Math.sin(TAU*base*3*t);a[i]=(.13*s+.13*whine)*(1+.13*Math.sin(TAU*31*t));}return a;}
const packs=[
 {id:'arena',label:'A 熱血競技場',description:'厚實拳擊感、明亮確認音、寬闊勝利號角。',pitch:1,body:65,metal:620,voicePitch:.86,voiceEcho:.16,loopBase:132,wave:'square',base:261.63},
 {id:'metal',label:'B 鋼鐵衝擊',description:'偏寫實金屬、機械扣鎖、低沉硬派衝擊。',pitch:.72,body:48,metal:415,voicePitch:.74,voiceEcho:.10,loopBase:92,wave:'triangle',base:196},
 {id:'neon',label:'C 霓虹派對',description:'清脆電子、彈跳節奏、明快彩色勝利音。',pitch:1.35,body:85,metal:930,voicePitch:1.07,voiceEcho:.22,loopBase:188,wave:'sine',base:329.63}
];
const cues=[['ui_hover','UI 移動','UI'],['ui_confirm','UI 確認','UI'],['ui_back','UI 返回','UI'],['ui_ready','準備完成','UI'],['countdown_3','倒數 3','倒數與配音'],['countdown_2','倒數 2','倒數與配音'],['countdown_1','倒數 1','倒數與配音'],['announcer_go','Gooooo','倒數與配音'],['announcer_shoot','SHOOT!','倒數與配音'],['launch','拉環發射','戰鬥'],['spin_loop','高速旋轉循環','戰鬥'],['impact_light','輕碰撞','戰鬥'],['impact_heavy','重碰撞','戰鬥'],['rail_dash','齒軌衝刺','戰鬥'],['shield_hit','護罩反彈','戰鬥'],['pocket_drop','落坑撞底','戰鬥'],['ring_out','出場淘汰','結果'],['victory','勝利','結果'],['defeat','落敗','結果']].map(([id,label,category])=>({id,label,category}));
function create(cue,p){let a;
 if(cue.startsWith('countdown')||cue.startsWith('announcer'))return voice(cue,p);
 switch(cue){
 case 'ui_hover': a=tone(.11,700*p.pitch,1050*p.pitch,.7,7,p.wave);mix(a,air(.06,2200,8000,9,.2));break;
 case 'ui_confirm': a=buffer(.48);mix(a,tone(.19,480*p.pitch,560*p.pitch,.6,4,p.wave));mix(a,tone(.34,760*p.pitch,850*p.pitch,.6,4,p.wave),.075);mix(a,air(.09,1200,6000,5,.22));break;
 case 'ui_back': a=buffer(.3);mix(a,tone(.25,520*p.pitch,220*p.pitch,.6,7,p.wave));mix(a,air(.07,650,3500,7,.15));break;
 case 'ui_ready': a=fanfare(p.id==='metal'?[0,7,12]:p.id==='neon'?[0,7,12,16]:[0,4,7,12],.085,p.base,p.wave);break;
 case 'launch': a=buffer(1.2);mix(a,swoosh(.42,1.7));for(let i=0;i<10;i++)mix(a,clang(.1,p.metal*(1+i*.055),.18,12),i*.026);mix(a,tone(.65,p.body*2,p.body*.45,.95,5),.31);mix(a,air(.7,300,7000,5,1.3),.30);break;
 case 'spin_loop':a=loop(p);break;
 case 'impact_light':a=buffer(.45);mix(a,clang(.42,p.metal,.44,7));mix(a,tone(.22,p.body*2,p.body,.62,9));mix(a,air(.16,900,6500,9,.7));break;
 case 'impact_heavy':a=buffer(1);mix(a,tone(.65,p.body*2,p.body*.45,1.1,5));mix(a,clang(.75,p.metal*.71,.72,6));mix(a,air(.5,300,9000,8,1.8));mix(a,clang(.25,p.metal*1.8,.17,10),.06);break;
 case 'rail_dash':a=buffer(1.05);mix(a,swoosh(.78,1.5));mix(a,tone(.75,170*p.pitch,1500*p.pitch,.55,1,p.wave));for(let i=0;i<18;i++)mix(a,clang(.08,p.metal*(1+i*.07),.19,12),i*.027);mix(a,tone(.3,p.body*2,p.body,.7,7),.63);break;
 case 'shield_hit':a=buffer(.95);mix(a,clang(.82,p.metal*1.45,.9,5));mix(a,air(.22,1600,9000,7,1));mix(a,tone(.37,105,45,.75,7));break;
 case 'pocket_drop':a=buffer(1.35);mix(a,swoosh(.25,.5));mix(a,tone(.44,110,39,1,6),.18);mix(a,clang(.48,p.metal*.55,.5,7),.18);mix(a,tone(.3,90,45,.45,9),.61);mix(a,clang(.25,p.metal*.7,.23,9),.78);break;
 case 'ring_out':a=buffer(1.5);mix(a,tone(.85,900*p.pitch,75*p.pitch,.65,2,p.wave));mix(a,swoosh(.75,1.3));mix(a,tone(.5,95,32,.85,6),.68);break;
 case 'victory':a=fanfare(p.id==='metal'?[0,0,7,12]:p.id==='neon'?[0,4,7,12,16,19]:[0,7,12,16,19],.14,p.base,p.wave);mix(a,air(.9,3000,9500,4,.32),.5);mix(a,tone(.65,p.body*2,p.body,.65,6));break;
 case 'defeat':a=fanfare(p.id==='neon'?[7,3,0,-5]:[7,3,0,-12],.18,p.base,p.wave);break;
 default:throw Error(cue);
 }return a;
}
function writeWav(file,a,isLoop){let peak=0;for(const x of a){assert.ok(Number.isFinite(x));peak=Math.max(peak,Math.abs(x));}assert.ok(peak>.005);const scale=(isLoop?.32:.82)/peak;if(!isLoop){const edge=Math.min(Math.round(SR*.006),Math.floor(a.length/4));for(let i=0;i<edge;i++){a[i]*=i/edge;a[a.length-i-1]*=i/edge;}}
 const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(a.length*2,40);let sum=0,actualPeak=0;for(let i=0;i<a.length;i++){const x=a[i]*scale;sum+=x*x;actualPeak=Math.max(actualPeak,Math.abs(x));b.writeInt16LE(Math.round(x*32767),44+i*2);}fs.writeFileSync(file,b);return {duration:a.length/SR,peak:actualPeak,rms:Math.sqrt(sum/a.length),loopBoundaryDelta:Math.abs(a[0]-a.at(-1))*scale};
}
fs.mkdirSync(output,{recursive:true});const measurements=[];
for(const p of packs){fs.mkdirSync(path.join(output,p.id),{recursive:true});for(const cue of cues){const a=create(cue.id,p),file=path.join(output,p.id,cue.id+'.wav');measurements.push({pack:p.id,cue:cue.id,...writeWav(file,a,cue.id==='spin_loop')});}}
assert.equal(measurements.length,57);assert.ok(measurements.every(m=>m.peak<=.821&&m.rms>.01));assert.ok(measurements.filter(m=>m.cue==='spin_loop').every(m=>m.loopBoundaryDelta<.015));
const manifest={version:1,sampleRate:SR,channels:1,format:'16-bit PCM WAV',packs:packs.map(({id,label,description})=>({id,label,description})),cues,voice:{source:'Windows SAPI / Microsoft Zira Desktop',quality:'本機 TTS 節奏示範，非最終熱血配音',licenseNote:'本機語音合成，不含遊戲原音或特定演員仿聲。正式公開使用前請核對 Windows 語音引擎授權。'},spin:{threshold:.55,note:'試聽比例門檻。正式接入須以 authoritative angularSpeed 換算與現場校準。'},provenance:'SFX are original procedural synthesis. Spoken words use installed Windows SAPI TTS with authored pitch and echo processing. No external assets or cloud services.',measurements};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync('.qa/sound-assets-validation.json',JSON.stringify({passed:true,count:measurements.length,measurements},null,2));console.log(JSON.stringify({generated:measurements.length,folder:output,bytes:measurements.reduce((n,m)=>n+44+Math.round(m.duration*SR)*2,0),loops:measurements.filter(m=>m.cue==='spin_loop')}));
