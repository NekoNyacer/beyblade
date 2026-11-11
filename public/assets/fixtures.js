export const scenes=[
{id:'duel',label:'雙人激戰',description:'觀察兩顆陀螺沿坡繞行，回到中央再次交鋒。'},
{id:'rail',label:'齒軌加速',description:'看陀螺撞齒彈回，以及對準齒縫後沿圈加速。'},
{id:'pocket',label:'落坑回場',description:'觀察陀螺被對手撞過齒圈，落入外側坑洞後彈回場內。'},
{id:'stall',label:'坑洞停轉',description:'剩餘轉速不足，陀螺會在坑洞中停轉。'},
{id:'battle',label:'10人混戰',description:'檢查多人碰撞、軌道與轉速讀數。'},
{id:'dense',label:'16人混戰',description:'最多人數測試。'},
{id:'countdown',label:'倒數發射',description:'3、2、1 → GO → SHOOT，接著同時進場。'},
{id:'result',label:'比賽結果',description:'勝負由同一套模擬決定。'}];
let data;async function load(){return data??=await fetch('/assets/scenario-data.json').then(r=>{if(!r.ok)throw Error('Preview unavailable');return r.json();});}
export async function getScenario(requested){const d=await load(),name=scenes.some(s=>s.id===requested)?requested:requested==='ringout'?'pocket':'duel';const source=name==='battle'?d.brawl:name==='dense'?d.dense:d[name]||d.duel,players=d.players.slice(0,source.frames[0].tops.length);
const state={phase:name==='countdown'?'countdown':name==='result'?'result':'running',mode:players.length===2?'tournament':'brawl',players,matches:[],serverTime:Date.now(),championId:name==='result'?source.winnerId:null,round:{id:'demo-round',playerIds:players.map(p=>p.id),pulledIds:[],countdownAt:Date.now(),deadline:Date.now()+11000,winnerId:source.winnerId,rankings:source.rankings}};
return{name,state,frames:source.frames,frame:name==='result'?source.frames.at(-1):source.frames[0],animated:name!=='result'};}
