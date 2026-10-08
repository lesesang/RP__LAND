import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL;assert.match(base,/^http:\/\/127\.0\.0\.1:/);
let count=0;
function check(value,name){assert.ok(value,name);console.log('PASS '+name);count++}
function client(){let cookies={};return async(path,method='GET',body)=>{const r=await fetch(base+'/api/'+path,{method,headers:{'Content-Type':'application/json',Connection:'close',Cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ')},body:body===undefined?undefined:JSON.stringify(body)});for(const c of r.headers.getSetCookie()){const[k,...v]=c.split(';')[0].split('=');cookies[k]=v.join('=')}return {status:r.status,data:await r.json()}}}
const owner=client(),other=client(),guest=client(),pw='Thread-tools-Password!';
for(const [call,username] of [[owner,'tool_owner'],[other,'tool_other']]){await call('register','POST',{username,password:pw});await call('login','POST',{username,password:pw})}
check((await owner('setup','POST',{token:process.env.TEST_SETUP_TOKEN})).status===200,'setup key promotes first administrator');
const image='https://example.com/main.png';
for(const kind of ['thread','wiki']){
 const result=await owner('entries','POST',{kind,title:kind,content:'body',coverImage:image});check(result.status===200,kind+' accepts representative image');
 const id=result.data.id;
 check((await guest('entries?kind='+kind)).data.entries.find(e=>e.id===id)?.cover_image===image,kind+' list exposes representative image');
 check((await guest('entries/'+id)).data.cover_image===image,kind+' detail persists image');
 check((await other('entries/'+id,'PATCH',{title:kind,content:'body',coverImage:''})).status===403,kind+' non-editor cannot remove image');
 await owner('entries/'+id,'PATCH',{title:kind,content:'changed'});check((await owner('entries/'+id)).data.cover_image===image,kind+' omitted image preserves old value');
 await owner('entries/'+id,'PATCH',{title:kind,content:'changed',coverImage:''});check((await guest('entries/'+id)).data.cover_image===null,kind+' explicit empty image removes it');
}
for(const value of ['javascript:alert(1)','data:image/svg+xml,<svg/>','https://user:pass@example.com/a',42,'x'.repeat(2049)])check((await owner('entries','POST',{title:'invalid image',content:'body',coverImage:value})).status===400,'reject unsafe or invalid image '+String(value).slice(0,35));
const scheduledAt=new Date(Date.now()+86400000).toISOString();
const draft={title:'upcoming',content:'body',coverImage:image,scheduledAt,scheduleListed:true,previewOpen:false,scheduleMeta:{title:true,author:true,categories:true,image:false}};
const pending=(await owner('entries','POST',draft)).data.id;
for(const who of [guest,owner])check((await who('schedule')).data.entries.find(e=>e.id===pending)?.cover_image===null,'schedule image hidden even for administrator');
check(!(await guest('entries')).data.entries.some(e=>e.id===pending),'pending image and entry excluded from published list');
check((await guest('entries/'+pending+'/anchors/1')).status===404,'anchor lookup does not expose closed scheduled thread');
await owner('entries/'+pending,'PATCH',{...draft,scheduleMeta:{...draft.scheduleMeta,image:true}});
check((await guest('schedule')).data.entries.find(e=>e.id===pending)?.cover_image===image,'schedule image toggle reveals image');
const tid=(await owner('entries','POST',{title:'anchors',content:'body'})).data.id;
const cids=[];for(let i=0;i<3;i++)cids.push((await other(`entries/${tid}/comments`,'POST',{character:'test',content:'reply '+i})).data.id);
check((await guest(`entries/${tid}/anchors/1`)).data.status==='visible','visible anchor available');
await owner(`entries/${tid}/comments/${cids[1]}`,'PATCH',{hidden:true});await owner(`entries/${tid}/comments/${cids[2]}`,'DELETE',{});
check(JSON.stringify((await guest(`entries/${tid}/anchors/2`)).data)==='{"status":"hidden"}','hidden anchor returns status only');
check(JSON.stringify((await guest(`entries/${tid}/anchors/3`)).data)==='{"status":"deleted"}','deleted anchor returns status only');
for(const n of ['0','1501','1.5','4','-1'])check((await guest(`entries/${tid}/anchors/${n}`)).status===404,'missing/invalid anchor '+n+' rejected');
check((await guest(`entries/${tid}/anchors/1`,'POST',{})).status===405,'anchor endpoint read-only');
check((await guest('entries/practice/anchors/1')).status===404,'practice anchor rejected');
const secret=(await owner('entries','POST',{title:'secret',content:'private',isSecret:true,secretPw:'secret-pass'})).data.id;
check((await guest(`entries/${secret}/anchors/1`)).status===403,'secret anchor requires grant');
console.log('RESULT '+count+'/'+count);
