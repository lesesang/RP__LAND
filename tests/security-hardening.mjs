// Isolated local Worker only. Set SECURITY_BASELINE=1 to collect pre-fix failures.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const base=process.env.TEST_BASE_URL;assert.match(base,/^http:\/\/127\.0\.0\.1:/);
const results=[];
function check(v,name){results.push({name,pass:!!v});console.log((v?'PASS ':'FAIL ')+name)}
function client(){let cookies={};const call=async(path,method='GET',data,extra={})=>{const r=await fetch(base+'/api/'+path,{method,headers:{'Content-Type':'application/json',Connection:'close',Cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; '),...extra},body:data===undefined?undefined:JSON.stringify(data)});for(const c of r.headers.getSetCookie()){const[k,...v]=c.split(';')[0].split('=');cookies[k]=v.join('=')}return {status:r.status,data:await r.json(),headers:r.headers}};return call}
const a=client(),guest=client(),pw='security-Password!';
await a('register','POST',{username:'security_user',password:pw});await a('login','POST',{username:'security_user',password:pw});const uid=(await a('me')).data.user.id;
check((await guest('logout','POST',{}, {'Content-Type':'application/json-pretend'})).status===415,'reject deceptive content type');
check((await guest('logout','POST',{}, {'Sec-Fetch-Site':'cross-site'})).status===403,'reject cross-site writes even without Origin');
check((await guest('logout/extra','POST',{})).status===404,'reject extra route segments');
for(const path of ['constructor','__proto__','entries/x/constructor'])check((await guest(path)).status===404,'reject inherited route '+path);
check((await a('me','POST',{})).status===405,'reject unsupported account method');
check((await guest('logout','POST',[])).status===400,'reject array JSON body');
let limited;for(let i=0;i<21;i++){limited=await a('me','DELETE',{password:'incorrect'});if(limited.status===429)break}
check(limited.status===429&&Number(limited.headers.get('Retry-After'))>0,'rate limit password guessing through withdrawal');
check((await a('me')).data.user?.id===uid,'failed withdrawal preserves account');
const admin=client();await admin('register','POST',{username:'security_admin',password:pw});await admin('login','POST',{username:'security_admin',password:pw});await admin('setup','POST',{token:process.env.TEST_SETUP_TOKEN});
check((await a('setup','POST',{token:'incorrect'})).status===403,'invalid setup secret rejected');
check((await a('users/'+uid,'PATCH',{role:'SUPER'})).status===403,'ordinary role escalation denied');
const unicode='😀'.repeat(50000);const wiki=await admin('entries','POST',{kind:'wiki',title:'unicode limit',content:unicode});check(wiki.status===200,'valid maximum Unicode wiki accepted');check((await admin('entries/'+wiki.data.id)).data.content===unicode,'Unicode content round trips');
const secret=(await admin('entries','POST',{title:'secret',content:'private-body',isSecret:true,secretPw:'secret-pass'})).data.id;
check((await a('entries/'+secret)).status===403,'secret body denied without grant');
check((await guest('entries?q=private-body')).data.total===0,'secret content excluded from search');
check((await a('entries/'+secret+'/unlock','POST',{password:'wrong'})).status===401,'wrong secret rejected');
check((await a('entries','POST',{title:'SQL \" ; DROP TABLE users; --',content:'<script>alert(1)</script>'})).status===200,'SQL-shaped input remains data');
check((await guest('users')).data.length===2,'SQL injection does not change users');
const key=createHash('sha256').update('write:'+uid).digest('hex');
const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',process.env.TEST_DB_PATH,'--command',`INSERT OR REPLACE INTO attempts(key,count,expires) VALUES('${key}',300,${Date.now()+900000})`],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
const flood=await a('entries','POST',{title:'blocked flood',content:'must not exist'});
check(flood.status===429&&Number(flood.headers.get('Retry-After'))>0,'account write flood rejected');
check((await guest('entries?q=blocked%20flood')).data.total===0,'rate-limited request causes no post');
check((await a('me')).status===200,'reads remain available when writes limited');
check((await a('logout','POST',{})).status===200,'logout remains available when writes limited');
check((await a('me')).data.user===null,'logout invalidates session');
check((await guest('logout','POST',{ignored:'가'.repeat(90000)})).status===413,'cap request size by bytes');
check((await guest('me')).status===200,'read remains available after oversized request');
const stream=new ReadableStream({start(controller){for(let i=0;i<30;i++)controller.enqueue(new TextEncoder().encode(' '.repeat(10000)));controller.close()}});const oversized=await fetch(base+'/api/logout',{method:'POST',headers:{'Content-Type':'application/json',Connection:'close'},body:stream,duplex:'half'});check(oversized.status===413,'chunked body without Content-Length is bounded');await oversized.text();check((await guest('me')).status===200,'read works after oversized chunked body');
writeFileSync('.sites-runtime/security-'+(process.env.SECURITY_BASELINE?'before':'after')+'.json',JSON.stringify(results,null,2));
console.log(`RESULT ${results.filter(x=>x.pass).length}/${results.length}`);
if(!process.env.SECURITY_BASELINE)assert.ok(results.every(x=>x.pass),'security regressions');
