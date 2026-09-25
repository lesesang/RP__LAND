// Run only against a disposable local database, never production.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
function sql(query){const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',query],{encoding:'utf8'});if(r.status)throw new Error(r.stderr);}
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))throw new Error('Local test target required');
const suffix=Date.now();
function client(){let cookies={};return async(path,method='GET',data)=>{const r=await fetch(base+'/api/'+path,{method,headers:{'Content-Type':'application/json',Cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ')},body:data?JSON.stringify(data):undefined});for(const c of r.headers.getSetCookie()){const[k,...v]=c.split(';')[0].split('=');cookies[k]=v.join('=')}return{status:r.status,data:await r.json()}}}
const a=client(),b=client(),guest=client();let assertions=0;
function check(v,msg){assert.ok(v,msg);assertions++}
for(const [c,n]of[[a,'writer'],[b,'reader']]){check((await c('register','POST',{username:n+suffix,password:'test-only-Password!'})).status===200,'register');check((await c('login','POST',{username:n+suffix,password:'wrong'})).status===401,'wrong password');check((await c('login','POST',{username:n+suffix,password:'test-only-Password!'})).status===200,'login')}
const uid=(await b('me')).data.user.id;
check((await guest('entries','POST',{title:'denied',content:'x'})).status===401,'guest write denied');
const eid=(await a('entries','POST',{title:'integration '+suffix,content:'**Hello**',kind:'thread'})).data.id;
check(!!eid,'created');check((await b('entries/'+eid,'PATCH',{title:'no',content:'no'})).status===403,'nonowner edit denied');
check((await a('entries/'+eid,'DELETE',{})).status===403,'owner delete denied');
check((await a('entries/'+eid+'/editors','POST',{userId:uid})).status===200,'share');
check((await b('entries/'+eid,'PATCH',{title:'edited '+suffix,content:'shared editor'})).status===200,'shared edit');
check((await b('entries/'+eid+'/editors','POST',{userId:uid})).status===403,'cannot reshare');
const cid=(await b('entries/'+eid+'/comments','POST',{content:'first response',character:'테스트'})).data.id;
check((await b('entries/'+eid+'/comments/'+cid,'PATCH',{content:'modified'})).status===403,'normal comment immutable');
check((await b('entries/'+eid+'/comments/'+cid,'PATCH',{hidden:true})).status===403,'shared editor cannot hide');
check((await a('entries/'+eid+'/comments/'+cid,'PATCH',{hidden:true})).status===200,'owner hides');
check((await guest('entries/'+eid+'/comments')).data[0].content==='','hidden text redacted');
check((await a('entries/'+eid+'/comments','POST',{content:'공격 [dice:3d20] 결과'})).status===200,'dice');
const dice=JSON.parse((await a('entries/'+eid+'/comments')).data.find(x=>x.dice).dice)[0];check(dice.values.length===3&&dice.values.every(n=>n>=1&&n<=20),'dice bounds');
check((await a('entries/'+eid+'/comments','POST',{content:'x'.repeat(1501)})).status===400,'comment length');
check((await a('entries','POST',{title:'too long',content:'x'.repeat(5001)})).status===400,'thread length');
const sid=(await a('entries','POST',{title:'secret '+suffix,content:'hiddenphrase'+suffix,isSecret:true,secretPw:'secret-password'})).data.id;
check((await a('entries/'+sid)).status===403,'even owner must unlock');
check((await guest('entries?q=hiddenphrase'+suffix)).data.total===0,'secret body unsearchable');
const search=(await guest('entries?q=secret%20'+suffix)).data;check(search.total===1&&!JSON.stringify(search).includes('hiddenphrase'),'secret search only title');
check((await a('entries/'+sid+'/unlock','POST',{password:'bad'})).status===401,'wrong secret');
check((await a('entries/'+sid+'/unlock','POST',{password:'secret-password'})).status===200,'unlock');check((await a('entries/'+sid)).data.content==='hiddenphrase'+suffix,'unlocked');
check((await guest('entries/'+sid+'/comments')).status===403,'comments also locked');
await a('entries/practice');const pc=(await a('entries/practice/comments','POST',{content:'practice'})).data.id;check((await a('entries/practice/comments/'+pc,'PATCH',{content:'revised'})).status===200,'practice own edit');
check((await b('entries/practice/comments/'+pc,'PATCH',{content:'no'})).status===403,'practice other denied');
const wid=(await a('entries','POST',{kind:'wiki',title:'wiki '+suffix,content:'world'})).data.id;await a('entries/'+wid+'/editors','POST',{userId:uid});check((await b('entries/'+wid,'PATCH',{title:'wiki updated',content:'updated'})).status===200,'wiki shared edit');
check((await b('users/'+uid,'PATCH',{role:'SUB'})).status===403,'ordinary user cannot appoint');
check((await b('me','DELETE',{password:'test-only-Password!'})).status===200,'withdraw');check((await b('entries/'+eid+'/comments','POST',{content:'no'})).status===401,'session revoked');check((await guest('entries/'+eid+'/comments')).data.some(c=>c.author==='탈퇴 사용자'),'posts preserved anonymously');

const au=(await a('me')).data.user.id;
check((await a('setup','POST',{token:'wrong'})).status===403,'wrong bootstrap token denied');
sql(`UPDATE users SET role='SUPER' WHERE id='${au}'`);
const catIds=[];for(let i=0;i<4;i++)catIds.push((await a('categories','POST',{name:'cat'+suffix+'-'+i})).data.id);
check((await a('entries','POST',{title:'four categories',content:'no',categories:catIds})).status===400,'max three categories');
check((await a('entries/'+eid,'PATCH',{title:'filtered',content:'body',categories:catIds.slice(0,3)})).status===200,'three categories accepted');
check((await guest('entries?category='+catIds[0])).data.entries.some(e=>e.id===eid),'category filter');
const capid=(await a('entries','POST',{title:'cap test',content:'x'})).data.id;
sql(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1499) INSERT INTO comments(id,entry_id,author_id,character,content,hidden,created,updated) SELECT '${capid}-'||x,'${capid}','${au}','test','body',1,'2026-01-01','2026-01-01' FROM n`);
const burst=await Promise.all(Array.from({length:4},()=>a('entries/'+capid+'/comments','POST',{content:'last'})));
check(burst.filter(x=>x.status===200).length===1&&burst.filter(x=>x.status===409).length===3,'atomic 1500 cap includes hidden comments');
const c=client();await c('register','POST',{username:'deputy'+suffix,password:'test-only-Password!'});await c('login','POST',{username:'deputy'+suffix,password:'test-only-Password!'});const cu=(await c('me')).data.user.id;
check((await a('users/'+cu,'PATCH',{role:'SUB'})).status===200,'super appoints deputy');
check((await c('users/'+au,'PATCH',{role:'USER'})).status===403,'deputy cannot change super');
check((await c('entries/'+wid,'DELETE',{})).status===200,'deputy deletes wiki');
check((await guest('entries/'+wid)).status===404,'deleted wiki unavailable');
check((await c('entries/'+eid,'DELETE',{})).status===200,'deputy deletes thread');
check((await c('entries/practice','DELETE',{})).status===400,'practice cannot be deleted');
check((await a('audit')).data.some(x=>x.action==='delete-entry'),'admin activity logged');

const practiceDice=(await a('entries/practice/comments','POST',{content:'왼쪽 [dice:2d6] 오른쪽 [dice:1d20]',dice:[{total:999}]})).data.id;
const recorded=(await a('entries/practice/comments')).data.find(x=>x.id===practiceDice);const rolled=JSON.parse(recorded.dice);
check(rolled.length===2&&rolled[0].start==='왼쪽 '.length&&rolled[0].values.length===2&&rolled[1].values.length===1,'multiple inline rolls with positions');
check(rolled.every(r=>r.total===r.values.reduce((a,b)=>a+b,0)),'client cannot forge dice');
check((await a('entries/practice/comments/'+practiceDice,'PATCH',{content:'reroll [dice:1d6]'})).status===403,'dice cannot be rerolled through editing');
check((await a('entries/practice/comments/'+pc,'PATCH',{content:'insert [dice:1d6]'})).status===400,'editing cannot add dice');
check((await a('entries/practice/comments','POST',{content:'[dice:1d999]'})).status===400,'invalid dice rejected');
const literal=(await a('entries/practice/comments','POST',{content:'`[dice:1d6]`'})).data.id;
check(!(await a('entries/practice/comments')).data.find(x=>x.id===literal).dice,'code example does not roll');
const before=(await a('entries/practice/comments')).data.length;
check((await guest('entries/practice/comments/'+practiceDice,'DELETE',{})).status===401,'guest cannot delete practice comment');
check((await c('entries/practice/comments/'+practiceDice,'DELETE',{})).status===200,'deputy deletes practice dice comment');
const after=(await a('entries/practice/comments')).data;const deleted=after.find(x=>x.id===practiceDice);
check(after.length===before&&deleted.deleted===1&&deleted.content===''&&deleted.dice===null,'deleted tombstone retains count and redacts payload');
check((await a('entries/practice/comments/'+pc,'DELETE',{})).status===200,'super deletes practice comment');
check((await a('entries/practice/comments/'+pc,'PATCH',{hidden:false})).status===410,'deleted comment cannot be unhidden');
check((await guest('maintenance/reset','POST',{confirm:'RESET_ALL_RP_LAND'})).status===403,'reset requires separate secret');
await a('entries/practice/comments','POST',{character:'서식 확인',content:'[color=#cc3344]붉은 문장[/color] 그리고 [ruby=은하]銀河[/ruby]\n\n[transparent]투명 문장[/transparent]\n\n[fold=펼쳐서 읽기]접힌 이야기와 **굵은 글씨**[/fold]\n\n결과 [dice:2d6]'});
console.log(`PASS ${assertions} integration assertions`);


