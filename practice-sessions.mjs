import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {launchPractice} from './launch-practice.mjs';
const token=()=>randomBytes(18).toString('hex');
const matches=(a,b)=>typeof a==='string'&&timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
export class PracticeSessions{
 constructor(){this.sessions=new Map();this.heartbeat=setInterval(()=>{for(const [id,s]of this.sessions){if(!s.hosts.size&&!s.phones.size&&Date.now()-s.touched>7200000){this.sessions.delete(id);continue;}for(const res of [...s.hosts,...s.phones])res.write(': heartbeat\n\n');}},15000);}
 get(id,key,role){const s=this.sessions.get(id);if(!s||!matches(key,role==='host'?s.hostToken:s.phoneToken))throw Error('測試連線已失效，請從主畫面重新掃碼。');s.touched=Date.now();return s;}
 info(s){return {session:s.id,hostToken:s.hostToken,phoneToken:s.phoneToken};}
 send(res,packet){if(!res.destroyed&&!res.writableEnded&&res.writableLength<2000000)res.write('data: '+JSON.stringify(packet)+'\n\n');}
 status(s){const packet={type:'connection',hostOnline:s.hosts.size>0,phones:s.phones.size,count:s.count};for(const res of [...s.hosts,...s.phones])this.send(res,packet);}
 post(path,b){
  if(path==='/api/practice-session'){
   if(b.session)return this.info(this.get(b.session,b.hostToken,'host'));
   if(this.sessions.size>=40)throw Error('測試連線已滿，請關閉未使用的測試頁後稍後再試。');
   const s={id:token(),hostToken:token(),phoneToken:token(),hosts:new Set(),phones:new Set(),count:0,touched:Date.now(),latest:null};this.sessions.set(s.id,s);return this.info(s);
  }
  if(path==='/api/practice-session/pull'){
   const s=this.get(b.session,b.token,'phone');if(!s.hosts.size)throw Error('主畫面尚未連線，請先在電腦開啟測試頁。');
   if(b.speed!==null&&(!Number.isFinite(b.speed)||b.speed<0||b.speed>1000))throw Error('拉速數據無效，請重新拉動。');
   const run=launchPractice(b.power,b.angle,'paired-'+(s.count+1),b.speed===null);
   const packet={type:'launch',count:++s.count,input:{speed:b.speed,angle:b.angle,power:b.power},run};s.latest=packet;
   for(const res of s.hosts)this.send(res,packet);
   return {count:s.count,initial:run.initial};
  }
  return null;
 }
 stream(req,res,url){
  const role=url.searchParams.get('role');if(!['host','phone'].includes(role))throw Error('測試連線類型無效');
  const s=this.get(url.searchParams.get('session'),url.searchParams.get('token'),role),set=role==='host'?s.hosts:s.phones;if(set.size>=8)throw Error('這個測試的連線數已滿');
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();set.add(res);
  this.status(s);if(role==='host'&&s.latest)this.send(res,s.latest);
  res.on('close',()=>{set.delete(res);s.touched=Date.now();this.status(s);});
 }
 close(){clearInterval(this.heartbeat);for(const s of this.sessions.values())for(const res of [...s.hosts,...s.phones])res.end();this.sessions.clear();}
}
