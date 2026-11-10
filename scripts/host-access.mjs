import process from 'node:process';
const [command,value,...extra]=process.argv.slice(2);
if(extra.length||!['list','approve','revoke'].includes(command)||(command!=='list'&&!value)||(command==='list'&&value)){console.error('Usage: node scripts/host-access.mjs list | approve CODE | revoke SESSION_ID');process.exit(1);}
if(!process.env.ADMIN_KEY){console.error('ADMIN_KEY must be supplied through the environment');process.exit(1);}
const port=Number(process.env.PORT||3210);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
const routes={list:'/api/pair/admin/list',approve:'/api/pair/approve',revoke:'/api/pair/revoke'};
try{const response=await fetch(`http://127.0.0.1:${port}${routes[command]}`,{method:command==='list'?'GET':'POST',headers:{'x-admin-key':process.env.ADMIN_KEY,'Content-Type':'application/json'},...(command==='list'?{}:{body:JSON.stringify(command==='approve'?{code:value}:{id:value})}),signal:AbortSignal.timeout(10000)});const data=await response.json();console.log(JSON.stringify(data,null,2));if(!response.ok)process.exitCode=1;}catch{console.error('Could not contact local host-access service');process.exitCode=1;}
