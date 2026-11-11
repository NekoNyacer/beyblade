import {createApp} from '../server.mjs';
import path from 'node:path';
const port=Number(process.env.PORT||3214),app=createApp({port,dataDir:path.resolve('.qa','preview-data')});
await app.listen();
console.log(`Free practice: http://localhost:${app.server.address().port}/scenarios`);
console.log(`Phone controller pairing: http://localhost:${app.server.address().port}/launch-test`);
let closing=false;async function close(){if(closing)return;closing=true;await app.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
