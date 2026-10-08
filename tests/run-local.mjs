import {mkdtempSync,readdirSync,mkdirSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
mkdirSync('.sites-runtime',{recursive:true});
process.env.TEST_DB_PATH=mkdtempSync('.sites-runtime/integration-db-');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
 const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',process.env.TEST_DB_PATH,'--file','drizzle/'+file],{encoding:'utf8'});
 if(r.status)throw new Error(r.stderr+r.stdout);
}
process.env.TEST_SETUP_TOKEN='local-only-test-setup';
const server=spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--local','--persist-to',process.env.TEST_DB_PATH,'--ip','127.0.0.1','--port','8788','--var','ADMIN_SETUP_TOKEN:'+process.env.TEST_SETUP_TOKEN,'--inspector-port','0'],{stdio:['ignore','pipe','pipe']});
let output='';try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Worker startup timed out')),45000);server.stdout.on('data',d=>{output+=d;if(output.includes('Ready on')){clearTimeout(timer);resolve()}});server.stderr.on('data',d=>{output+=d});server.on('exit',code=>reject(new Error('Worker exited '+code+' '+output)))});process.env.TEST_BASE_URL='http://127.0.0.1:8788';await import(process.env.TEST_SUITE||'./api.integration.mjs')}catch(error){console.error(output);throw error}finally{server.kill('SIGTERM')}
