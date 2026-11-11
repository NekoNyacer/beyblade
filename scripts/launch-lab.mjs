import {createApp} from '../server.mjs';
import path from 'node:path';
const port=Number(process.env.PORT||3215),app=createApp({port,dataDir:path.resolve('.qa','launch-lab-data')});
await app.listen();console.log('Phone feel test: http://localhost:'+port+'/pull-test');
console.log('Two-device battle: http://localhost:'+port+'/launch-test');
console.log('Connect your phone to the same router and scan the QR code.');
let closing=false;for(const sig of ['SIGINT','SIGTERM'])process.on(sig,async()=>{if(closing)return;closing=true;await app.close();process.exit(0);});
