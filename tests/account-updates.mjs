import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const base=process.env.TEST_BASE_URL;
assert.match(base,/^http:\/\/127\.0\.0\.1:/);
let checks=0;
function check(value,label){assert.ok(value,label);checks++;console.log('PASS '+label)}
function client(){let cookies={};return async(path,method='GET',body)=>{const r=await fetch(base+'/api/'+path,{method,headers:{'Content-Type':'application/json',Cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ')},body:body?JSON.stringify(body):undefined});for(const c of r.headers.getSetCookie()){const[k,...v]=c.split(';')[0].split('=');cookies[k]=v.join('=')}return {status:r.status,data:await r.json()}}}
const a=client(),otherSession=client(),b=client(),guest=client(),pw='initial-Password!';
for(const [c,username] of [[a,'account_a'],[b,'account_b']]){
 check((await c('register','POST',{username,password:pw})).status===200,'register '+username);
 check((await c('login','POST',{username,password:pw})).status===200,'login '+username);
}
await otherSession('login','POST',{username:'account_a',password:pw});
check((await a('setup','POST',{token:process.env.TEST_SETUP_TOKEN})).status===200,'super account setup');
const uid=(await a('me')).data.user.id;
check((await guest('me','PATCH',{currentPassword:pw,username:'hijack'})).status===401,'guest change rejected');
check((await a('me','PATCH',{currentPassword:{toString:pw},username:'hijack'})).status===401,'object password rejected');
check((await a('me','PATCH',{currentPassword:pw,username:'ACCOUNT_B'})).status===409,'case insensitive duplicate rejected');
check((await a('me')).data.user.id===uid,'failed change preserves session');
check((await a('me','PATCH',{currentPassword:pw,newPassword:'short'})).status===400,'short password rejected');
check((await a('me','PATCH',{currentPassword:pw,username:'bad/name'})).status===400,'invalid username rejected');
await a('entries/practice');
const cid=(await a('entries/practice/comments','POST',{character:'같은 이름',content:'기존 레스'})).data.id;
await b('entries/practice/comments','POST',{character:'같은 이름',content:'다른 계정'});
check((await guest('names','DELETE',{name:'같은 이름'})).status===401,'guest name delete denied');
check((await a('names','DELETE',{name:'같은 이름',userId:(await b('me')).data.user.id})).status===200,'delete scoped to authenticated account');
check(!(await a('me')).data.names.some(n=>n.name==='같은 이름'),'saved name removed');
check((await b('me')).data.names.some(n=>n.name==='같은 이름'),'other saved name retained');
check((await a('entries/practice/comments')).data.find(c=>c.id===cid).character==='같은 이름','existing character retained');
check((await a('names','DELETE',{name:'같은 이름'})).status===200,'repeat deletion idempotent');
await a('entries/practice/comments','POST',{character:'같은 이름',content:'다시 저장'});
check((await a('me')).data.names.some(n=>n.name==='같은 이름'),'reuse saves name again');
check((await a('me','PATCH',{currentPassword:pw,username:'changed_admin'})).status===200,'username change');
check((await a('me')).data.user===null,'current session revoked');
check((await otherSession('me')).data.user===null,'other session revoked');
check((await a('login','POST',{username:'account_a',password:pw})).status===401,'old username fails');
check((await a('login','POST',{username:'changed_admin',password:pw})).status===200,'new username login');
check((await a('me')).data.user.id===uid&&(await a('me')).data.user.role==='SUPER','identity and super role preserved');
check((await a('entries/practice/comments')).data.find(c=>c.id===cid).author==='changed_admin','author display updated');
await otherSession('login','POST',{username:'changed_admin',password:pw});
const nextPw='  New-Password!  ';
check((await a('me','PATCH',{currentPassword:pw,newPassword:nextPw})).status===200,'password change');
check((await otherSession('me')).data.user===null,'password change revokes other sessions');
check((await a('login','POST',{username:'changed_admin',password:pw})).status===401,'old password fails');
check((await a('login','POST',{username:'changed_admin',password:nextPw.trim()})).status===401,'password whitespace preserved');
check((await a('login','POST',{username:'changed_admin',password:nextPw})).status===200,'new password login');
const category=(await a('categories','POST',{name:'예약분류'})).data.id;
const ids=[];
for(const open of [false,true]){
 const r=await a('entries','POST',{title:'예약전용'+open,content:'예약본문검색',scheduledAt:new Date(Date.now()+3600000).toISOString(),previewOpen:open,scheduleListed:true,categories:[category]});
 check(r.status===200,'create scheduled '+open);ids.push(r.data.id);
}
for(const c of [guest,a,b]){
 for(const path of ['entries','entries?q='+encodeURIComponent('예약전용'),'entries?category='+category])check(!(await c(path)).data.entries.some(e=>ids.includes(e.id)),'pending absent from main, search and filter');
 check((await c('schedule')).data.entries.filter(e=>ids.includes(e.id)).length===2,'pending shown in schedule');
}
check((await guest('entries/'+ids[0])).status===404,'closed preview denied');
check((await guest('entries/'+ids[1])).status===200,'explicit preview supported');
check((await a('entries/'+ids[1]+'/comments','POST',{content:'too soon'})).status===409,'no replies before publication');
const sql=`UPDATE entries SET scheduled_at='2020-01-01T00:00:00.000Z' WHERE id='${ids[0]}'`;
const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',process.env.TEST_DB_PATH,'--command',sql],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
check((await guest('entries')).data.entries.some(e=>e.id===ids[0]),'released appears in main');
check(!(await guest('schedule')).data.entries.some(e=>e.id===ids[0]),'released leaves schedule');
check((await b('entries/'+ids[0]+'/comments','POST',{content:'공개 후'})).status===200,'released accepts replies');
console.log(`PASS ${checks} requested-feature assertions`);
