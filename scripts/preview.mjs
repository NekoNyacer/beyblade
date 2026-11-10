import {createApp} from '../server.mjs';
import path from 'node:path';
const port=Number(process.env.PORT||3214),app=createApp({port,dataDir:path.resolve('.qa','preview-data')});
await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(port,'127.0.0.1',resolve);});
console.log(`Compact shield stadium: http://localhost:${app.server.address().port}/scenarios`);
console.log('Local computer only. Press Ctrl+C to stop.');
let closing=false;async function close(){if(closing)return;closing=true;await app.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
