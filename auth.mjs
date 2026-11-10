import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
export function secretMatches(actual,expected){return typeof actual==='string'&&typeof expected==='string'&&expected.length>0&&timingSafeEqual(Buffer.from(digest(actual),'hex'),Buffer.from(digest(expected),'hex'));}
function cookies(req){const result={};for(const part of (req.headers.cookie||'').split(';')){const at=part.indexOf('=');if(at>0){const key=part.slice(0,at).trim();if(!Object.hasOwn(result,key))result[key]=part.slice(at+1).trim();}}return result;}
export function createPairing({publicMode=false,adminKey='',originAllowed,now=Date.now,pairTTL=600000,hostTTL=28800000,onRevoke=()=>{}}={}){
 const pending=new Map(),sessions=new Map(),limits=new Map();
 const nonce=()=>randomBytes(32).toString('hex');
 function sweep(){const t=now();for(const [key,p]of pending)if(p.expires<=t)pending.delete(key);for(const [key,s]of sessions)if(s.expires<=t)sessions.delete(key);for(const [key,l]of limits)if(l.until<=t)limits.delete(key);}
 function cookie(name,value,maxAge,path='/'){return `${name}=${value}; HttpOnly; SameSite=Strict; Path=${path}; Max-Age=${maxAge}${publicMode?'; Secure':''}`;}
 function limit(key,max,window){const t=now();let l=limits.get(key);if(!l||l.until<=t){l={count:0,until:t+window};limits.set(key,l);}return ++l.count<=max;}
 function admin(req){return secretMatches(req.headers['x-admin-key'],adminKey);}
 function host(req){sweep();const token=cookies(req).bp_host;return token?sessions.get(digest(token))??null:null;}
 function allowed(req){return req.headers['sec-fetch-site']!=='cross-site'&&originAllowed(req);}
 function reply(res,status,data,setCookies){if(setCookies)res.setHeader('Set-Cookie',setCookies);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(data));}
 async function handle(req,res,url,readBody){if(!url.pathname.startsWith('/api/pair/'))return false;sweep();if(!allowed(req)){reply(res,403,{error:'Origin not allowed'});return true;}
 const ip=req.socket.remoteAddress||'unknown',path=url.pathname;
 if(req.method==='POST'&&path==='/api/pair/request'){
  if(!limit(ip+':request',5,600000)){reply(res,429,{error:'Too many pairing requests; try again in ten minutes'});return true;}
  const b=await readBody(req);const prior=cookies(req).bp_pair;if(prior)pending.delete(digest(prior));if(pending.size>=50){reply(res,429,{error:'Pairing capacity reached'});return true;}
  const token=nonce();let code;do{code=randomBytes(4).toString('hex').toUpperCase();}while([...pending.values()].some(p=>p.code===code));
  const p={code,label:String(b.label||'Host browser').replace(/[\u0000-\u001f]/g,'').slice(0,80),created:now(),expires:now()+pairTTL,requesterIP:ip,userAgent:String(req.headers['user-agent']||'').slice(0,200),approved:false};pending.set(digest(token),p);reply(res,200,{code,expires:p.expires,expiresAt:p.expires},[cookie('bp_pair',token,Math.ceil(pairTTL/1000),'/api/pair')]);return true;
 }
 if(req.method==='GET'&&path==='/api/pair/status'){
  const session=host(req);if(session){reply(res,200,{publicMode,authenticated:true,status:'authenticated',expiresAt:session.expires});return true;}
  const token=cookies(req).bp_pair,key=token?digest(token):'',p=pending.get(key);
  if(!limit('poll:'+ (key||ip),60,60000)||!limit('poll:global',300,60000)){reply(res,429,{error:'Polling too frequently'});return true;}
  if(!p){reply(res,200,{publicMode,authenticated:false,status:token?'expired':'none'});return true;}
  if(!p.approved){reply(res,200,{publicMode,authenticated:false,status:'pending',code:p.code,expires:p.expires,expiresAt:p.expires});return true;}
  if(sessions.size>=20){reply(res,429,{error:'Host session capacity reached'});return true;}
  pending.delete(key);const sessionToken=nonce();sessions.set(digest(sessionToken),{id:randomBytes(12).toString('hex'),label:p.label,created:now(),expires:now()+hostTTL,requesterIP:p.requesterIP,userAgent:p.userAgent});reply(res,200,{publicMode,authenticated:true,status:'authenticated',expiresAt:now()+hostTTL},[cookie('bp_host',sessionToken,Math.ceil(hostTTL/1000)),cookie('bp_pair','',0,'/api/pair')]);return true;
 }
 if(req.method==='POST'&&path==='/api/pair/logout'){const c=cookies(req);if(c.bp_host){const key=digest(c.bp_host),s=sessions.get(key);sessions.delete(key);if(s)onRevoke(s.id);}if(c.bp_pair)pending.delete(digest(c.bp_pair));reply(res,200,{ok:true},[cookie('bp_host','',0),cookie('bp_pair','',0,'/api/pair')]);return true;}
 if(['/api/pair/approve','/api/pair/admin/list','/api/pair/revoke'].includes(path)){
  if(!limit(ip+':admin',60,60000)){reply(res,429,{error:'Too many admin requests'});return true;}
  if(!admin(req)){reply(res,403,{error:'Admin authorization required'});return true;}
  if(req.method==='GET'&&path==='/api/pair/admin/list'){reply(res,200,{pending:[...pending.values()],sessions:[...sessions.values()]});return true;}
  if(req.method==='POST'&&path==='/api/pair/approve'){const b=await readBody(req),p=[...pending.values()].find(p=>p.code===String(b.code||'').toUpperCase());if(!p){reply(res,404,{error:'Pairing request expired or not found'});return true;}if(p.approved){reply(res,409,{error:'Already approved'});return true;}p.approved=true;p.expires=Math.min(p.expires,now()+60000);reply(res,200,{ok:true,code:p.code,expires:p.expires});return true;}
  if(req.method==='POST'&&path==='/api/pair/revoke'){const b=await readBody(req);const entry=[...sessions.entries()].find(([,s])=>s.id===b.id);if(!entry){reply(res,404,{error:'Session not found'});return true;}sessions.delete(entry[0]);onRevoke(entry[1].id);reply(res,200,{ok:true});return true;}
 }
 reply(res,404,{error:'Not found'});return true;
 }
 return {handle,host,admin,allowed};
}
