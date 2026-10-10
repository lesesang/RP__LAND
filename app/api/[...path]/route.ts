import {rollDice} from '@/lib/roleplay';
import {database} from '@/db/raw';
import {clientAddress,credentialLimitKey} from '@/lib/request-limits';
let nextCleanup=0;
type Row=Record<string,any>;
const now=()=>new Date().toISOString(),id=()=>crypto.randomUUID();
const fail=(message:string,status=400)=>{throw Object.assign(new Error(message),{status})};
const hex=(a:ArrayBuffer)=>Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('');
async function digest(s:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))}
async function hash(s:string,salt=hex(crypto.getRandomValues(new Uint8Array(16)).buffer)){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(s),'PBKDF2',false,['deriveBits']);return salt+':'+hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},k,256))}
async function verify(s:unknown,h:string){if(typeof s!=='string'||Array.from(s).length>128)return false;const actual=await hash(s,h.split(':')[0]);let d=actual.length^h.length;for(let i=0;i<h.length;i++)d|=actual.charCodeAt(i)^h.charCodeAt(i);return d===0}
function str(v:unknown,min:number,max:number,label:string){if(typeof v!=='string'||v.trim().length<min||Array.from(v).length>max)fail(`${label}: ${min}~${max}자로 입력해 주세요.`);return ['본문','레스'].includes(label)?(v as string).replace(/\r\n?/g,'\n'):(v as string).trim()}
// Passwords are opaque credentials: validate without normalizing whitespace.
function passwordValue(v:unknown,min:number,label:string){
 if(typeof v!=='string'||!v.trim()||Array.from(v).length<min||Array.from(v).length>128)fail(`${label}: ${min}~128자로 입력해 주세요.`);
 return v as string;
}
function optionalBoolean(b:Row,key:string,fallback:boolean){
 if(!Object.hasOwn(b,key))return fallback;
 if(typeof b[key]!=='boolean')fail('공개 설정은 참 또는 거짓으로 지정해 주세요.');
 return b[key] as boolean;
}
function pageNumber(url:URL){
 const raw=url.searchParams.get('page');
 if(raw===null)return 1;
 const page=Number(raw);
 // Both lists use this bound; OFFSET remains a safe integer.
 if(!/^[0-9]+$/.test(raw)||!Number.isSafeInteger(page)||page<1||page>1000000)fail('페이지 번호는 1~1,000,000 사이의 정수여야 합니다.');
 return page;
}
function coverImage(value:unknown):string|null {
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string'||value.length>2048)fail('대표 이미지 주소는 2,048자 이하로 입력해 주세요.');
 try{const u=new URL(value as string);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error();return u.href}catch{fail('대표 이미지는 http 또는 https 이미지 주소를 입력해 주세요.');return null}
}
function scheduleInput(b:Row,secret:boolean){
 const listed=optionalBoolean(b,'scheduleListed',!secret),open=optionalBoolean(b,'previewOpen',false);
 const m=Object.hasOwn(b,'scheduleMeta')?b.scheduleMeta:{};
 if(m===null||typeof m!=='object'||Array.isArray(m))fail('예약 표시 설정이 올바르지 않습니다.');
 const meta=JSON.stringify({title:optionalBoolean(m,'title',true),author:optionalBoolean(m,'author',true),categories:optionalBoolean(m,'categories',true),image:optionalBoolean(m,'image',true)});
 const scheduled=b.scheduledAt;
 if(scheduled===undefined||scheduled===null||scheduled==='')return {at:null,listed:0,open:0,meta};
 if(typeof scheduled!=='string'||scheduled.length>64)fail('예약 시각은 현재 이후로 설정해 주세요.');
 const time=new Date(scheduled);
 if(!Number.isFinite(time.getTime())||time.getTime()<=Date.now())fail('예약 시각은 현재 이후로 설정해 주세요.');
 return {at:time.toISOString(),listed:Number(listed),open:Number(open),meta};
}
const unsafeName=/[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufeff\uffa0]/u;
function characterName(v:unknown){const name=str(v,1,30,'캐릭터명');if(unsafeName.test(name.replace(/(\p{Extended_Pictographic}(?:\ufe0f|\p{Emoji_Modifier})?)\u200d(?=\p{Extended_Pictographic})/gu,'$1'))||!name.replace(/[\p{Cf}\p{Mn}\s]/gu,''))fail('캐릭터명에는 보이지 않는 문자나 글자 방향 제어 문자를 사용할 수 없습니다.');return name}
const duplicate=(error:unknown,field:string)=>String((error as Error)?.message||'').includes('UNIQUE constraint failed: '+field);
const cookie=(r:Request,k:string)=>r.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(k+'='))?.slice(k.length+1)||'';
export async function GET(req:Request){return handle(req)}
export async function POST(req:Request){return handle(req)}
export async function PATCH(req:Request){return handle(req)}
export async function DELETE(req:Request){return handle(req)}
// Bound buffering and reject oversized bodies; drain discarded chunks so the
// request transport remains usable after a rejected request.
const MAX_REQUEST_BYTES=256000;
async function readJson(req:Request):Promise<Row>{
 const size=req.headers.get('content-length');
 let oversized=!!size&&Number(size)>MAX_REQUEST_BYTES;
 const reader=req.body?.getReader(),decoder=new TextDecoder();let bytes=0,raw='';
 if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_REQUEST_BYTES)oversized=true;if(!oversized)raw+=decoder.decode(value,{stream:true})}raw+=decoder.decode()}finally{reader.releaseLock()}}
 if(oversized||raw.length>150000)fail('입력 내용이 너무 큽니다.',413);
 let body;try{body=JSON.parse(raw||'{}')}catch{fail('잘못된 요청입니다.')}
 if(body===null||typeof body!=='object'||Array.isArray(body))fail('JSON 객체를 입력해 주세요.');
 return body;
}
function checkRoute(p:string[],method:string){
 let allowed:string[]|undefined;
 if(p.length===1){allowed=({me:['GET','PATCH','DELETE'],names:['DELETE'],register:['POST'],login:['POST'],logout:['POST'],setup:['POST'],audit:['GET'],uncategorized:['GET'],schedule:['GET'],users:['GET','PATCH','DELETE'],categories:['GET','POST','PATCH'],entries:['GET','POST','PATCH','DELETE']} as Record<string,string[]>)[p[0]]}
 else if(p.length===2){if(p[0]==='entries')allowed=['GET','PATCH','DELETE'];else if(p[0]==='users')allowed=['GET','PATCH','DELETE'];else if(p[0]==='categories')allowed=['GET','PATCH','DELETE']}
 else if(p.length===3&&p[0]==='entries'){allowed=({categories:['PATCH'],comments:['GET','POST','PATCH','DELETE'],editors:['GET','POST','DELETE'],unlock:['POST']} as Record<string,string[]>)[p[2]]}
 else if(p.length===4&&p[0]==='entries'&&p[2]==='anchors')allowed=['GET'];
 else if(p.length===4&&p[0]==='entries'&&p[2]==='comments')allowed=['PATCH','DELETE'];
 if(!Array.isArray(allowed)||p.some(x=>!x))fail('요청을 찾을 수 없습니다.',404);
 if(!allowed!.includes(method))fail('지원하지 않는 요청 방식입니다.',405);
}
async function handle(req:Request){
 const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 const ok=(data:unknown)=>new Response(JSON.stringify(data),{headers});
 try{
 const url=new URL(req.url),p=url.pathname.replace(/\/$/,'').replace(/^\/api\//,'').split('/'),method=req.method;
 const b:Row=method==='GET'?{}:await readJson(req);
 checkRoute(p,method);
 if(method!=='GET'){const origin=req.headers.get('origin');if(req.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==url.origin))fail('허용되지 않은 요청입니다.',403);if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')fail('JSON 요청이 필요합니다.',415)}
 const db=database();const q=(sql:string,...args:any[])=>db.prepare(sql).bind(...args);const one=async(sql:string,...args:any[])=>await q(sql,...args).first<Row>();const all=async(sql:string,...args:any[])=>(await q(sql,...args).all<Row>()).results;
 const token=cookie(req,'rp_session');const user=token?await one('SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1',await digest(token),Date.now()):null;
 const auth=()=>{if(!user)fail('로그인이 필요합니다.',401);return user!};const admin=()=>{auth();if(!['SUPER','SUB'].includes(user!.role))fail('관리자 권한이 필요합니다.',403)};
 const log=async(action:string,target:string)=>q('INSERT INTO audit(id,actor,action,target,created) VALUES(?,?,?,?,?)',id(),user?.id||null,action,target,now()).run();

 // Opportunistic bounded cleanup; no public reset endpoint in production.
 if(method!=='GET'&&Date.now()>nextCleanup){
  nextCleanup=Date.now()+900000;
  try{await db.batch([
   q('DELETE FROM sessions WHERE token IN (SELECT token FROM sessions WHERE expires<=? LIMIT 100)',Date.now()),
   q('DELETE FROM grants WHERE token IN (SELECT token FROM grants WHERE expires<=? LIMIT 100)',Date.now()),
   q('DELETE FROM attempts WHERE key IN (SELECT key FROM attempts WHERE expires<=? LIMIT 100)',Date.now()),
  ])}catch{nextCleanup=Date.now()+60000;console.error('Expired credential cleanup failed')}
 }
 const rate=async(key:string,limit=20)=>{const stamp=Date.now(),k=await digest(key);const row=await q('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count,expires',k,stamp+900000,stamp,stamp).first<Row>();if(row!.count>limit){headers.set('Retry-After',String(Math.max(1,Math.ceil((row!.expires-stamp)/1000))));fail('시도 횟수가 많습니다. 15분 후 다시 시도해 주세요.',429)}};
 // Limit account-owned mutations without blocking reads or logout.
 if(method!=='GET'&&user&&['entries','names','categories','users'].includes(p[0])&&p[2]!=='unlock')await rate('write:'+user.id,300);
 if(p[0]==='names'&&method==='DELETE'){
 auth();const name=characterName(b.name);
 await q('DELETE FROM names WHERE user_id=? AND name=?',user!.id,name).run();
 return ok({success:true});
 }
 if(p[0]==='me'&&method==='PATCH'){
 auth();await rate('account-change:'+user!.id,10);
 const current=await one('SELECT username,password FROM users WHERE id=? AND active=1',user!.id);
 if(!current||!await verify(b.currentPassword,current!.password))fail('현재 비밀번호가 일치하지 않습니다.',401);
 if(!Object.hasOwn(b,'username')&&!Object.hasOwn(b,'newPassword'))fail('변경할 아이디 또는 비밀번호를 입력해 주세요.');
 const username=Object.hasOwn(b,'username')?str(b.username,3,30,'아이디'):current!.username;
 if(!/^[a-zA-Z0-9가-힣_-]+$/.test(username))fail('아이디에는 문자, 숫자, 밑줄, 하이픈만 사용할 수 있습니다.');
 const password=Object.hasOwn(b,'newPassword')?await hash(passwordValue(b.newPassword,8,'새 비밀번호')):current!.password;
 // The update and session revocation are atomic; concurrent changes cannot reuse stale credentials.
 let changed;
 try{[changed]=await db.batch([
 q('UPDATE users SET username=?,password=? WHERE id=? AND active=1 AND username=? AND password=? AND EXISTS(SELECT 1 FROM sessions WHERE token=? AND user_id=users.id AND expires>?) AND NOT EXISTS(SELECT 1 FROM users other WHERE lower(other.username)=lower(?) AND other.id!=?)',username,password,user!.id,current!.username,current!.password,await digest(token),Date.now(),username,user!.id),
 q('DELETE FROM sessions WHERE user_id=? AND changes()=1',user!.id)
 ])}catch(error){if(duplicate(error,'users.username'))fail('이미 사용 중인 아이디입니다.',409);throw error}
 if(!changed.meta.changes)fail('이미 사용 중인 아이디이거나 계정 정보가 변경되었습니다. 확인 후 다시 시도해 주세요.',409);
 headers.append('Set-Cookie','rp_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
 await log('update-account',user!.id);return ok({success:true,reauthenticate:true});
 }
 if(p[0]==='me'){if(method==='DELETE'){auth();await rate('withdraw:'+user!.id);if(user!.role==='SUPER')fail('총관리자 계정은 탈퇴할 수 없습니다.');if(!await verify(b.password,(await one('SELECT password FROM users WHERE id=?',user!.id))!.password))fail('비밀번호가 일치하지 않습니다.',401);await db.batch([q('UPDATE users SET active=0,password=?,username=? WHERE id=?','',`deleted-${user!.id}`,user!.id),q('DELETE FROM sessions WHERE user_id=?',user!.id),q('DELETE FROM names WHERE user_id=?',user!.id)]);await log('withdraw',user!.id);return ok({success:true})}return ok({user,names:user?await all('SELECT name FROM names WHERE user_id=?',user.id):[],setup:!(await one("SELECT id FROM users WHERE role='SUPER' LIMIT 1"))})}
 if(p[0]==='register'&&method==='POST'){const username=str(b.username,3,30,'아이디');if(!/^[a-zA-Z0-9가-힣_-]+$/.test(username))fail('아이디에는 문자, 숫자, 밑줄, 하이픈만 사용할 수 있습니다.');const password=passwordValue(b.password,8,'비밀번호');await rate('signup-address:'+clientAddress(req),20);const uid=id();const hp=await hash(password);try{const created=await q('INSERT INTO users(id,username,password,role,created) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM users WHERE lower(username)=lower(?))',uid,username,hp,'USER',now(),username).run();if(!created.meta.changes)fail('이미 사용 중인 아이디입니다. 대소문자는 구분하지 않습니다.',409)}catch(error){if(duplicate(error,'users.username'))fail('이미 사용 중인 아이디입니다.',409);throw error}return ok({success:true})}
 if(p[0]==='login'&&method==='POST'){const username=str(b.username,1,30,'아이디');const address=clientAddress(req);await rate('login-address:'+address,100);await rate(credentialLimitKey('login',address,username));let u=await one('SELECT * FROM users WHERE username=? AND active=1',username);if(!u){const matches=await all('SELECT * FROM users WHERE lower(username)=lower(?) AND active=1 LIMIT 2',username);if(matches.length===1)u=matches[0]}if(!u||!await verify(b.password,u.password))fail('아이디 또는 비밀번호가 일치하지 않습니다.',401);const t=id()+id();await q('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',await digest(t),u!.id,Date.now()+7*86400000).run();headers.append('Set-Cookie',`rp_session=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);return ok({success:true})}
 if(p[0]==='logout'&&method==='POST'){if(token)await q('DELETE FROM sessions WHERE token=?',await digest(token)).run();headers.append('Set-Cookie','rp_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');return ok({success:true})}
 if(p[0]==='setup'&&method==='POST'){auth();await rate('setup:'+user!.id);const {env}=await import('cloudflare:workers');const setupToken=(env as unknown as Record<string,string>).ADMIN_SETUP_TOKEN;if(!setupToken)fail('서버에 총관리자 설정 키가 등록되지 않았습니다. 운영자가 ADMIN_SETUP_TOKEN을 설정해야 합니다.',503);if(!await digest(String(b.token||'')).then(x=>digest(setupToken).then(y=>x===y)))fail('운영자 설정 키를 확인해 주세요.',403);const r=await q("UPDATE users SET role='SUPER' WHERE id=? AND NOT EXISTS(SELECT 1 FROM users WHERE role='SUPER')",user!.id).run();if(!r.meta.changes)fail('이미 총관리자가 지정되었습니다.',409);await log('setup',user!.id);return ok({success:true})}
 if(p[0]==='users'){if(method==='GET')return ok(await all("SELECT id,CASE WHEN active=1 THEN username ELSE '탈퇴 사용자' END username,role,active FROM users ORDER BY created"));if(p[1]){auth();if(user!.role!=='SUPER')fail('총관리자만 변경할 수 있습니다.',403);if(p[1]===user!.id)fail('자기 계정의 권한은 변경할 수 없습니다.');if(method==='PATCH'){if(!['USER','SUB'].includes(b.role))fail('잘못된 역할입니다.');const r=await q("UPDATE users SET role=? WHERE id=? AND role!='SUPER' AND active=1",b.role,p[1]).run();if(!r.meta.changes)fail('대상을 찾을 수 없습니다.',404);await log('role:'+b.role,p[1]);return ok({success:true})}if(method==='DELETE'){const [deactivated]=await db.batch([q("UPDATE users SET active=0,password='',username=? WHERE id=? AND role!='SUPER' AND active=1",`deleted-${p[1]}`,p[1]),q('DELETE FROM sessions WHERE user_id=?',p[1]),q('DELETE FROM names WHERE user_id=?',p[1])]);if(!deactivated.meta.changes)fail('대상을 찾을 수 없습니다.',404);await log('deactivate',p[1]);return ok({success:true})}}}
 if(p[0]==='uncategorized'){
 auth();if(user!.role!=='SUPER')fail('총관리자 권한이 필요합니다.',403);
 const page=pageNumber(url),where="e.kind='thread' AND e.deleted=0 AND NOT EXISTS(SELECT 1 FROM json_each(e.categories) j JOIN categories c ON c.id=j.value)";
 return ok({entries:await all(`SELECT e.id,e.title,e.scheduled_at,e.secret IS NOT NULL is_secret FROM entries e WHERE ${where} ORDER BY e.created DESC,e.id LIMIT 20 OFFSET ?`,(page-1)*20),total:(await one(`SELECT count(*) n FROM entries e WHERE ${where}`))!.n,page});
 }
 if(p[0]==='categories'&&method==='DELETE'){
 auth();if(user!.role!=='SUPER')fail('총관리자만 카테고리를 삭제할 수 있습니다.',403);
 if(!await one('SELECT id FROM categories WHERE id=?',p[1]))fail('카테고리를 찾을 수 없습니다.',404);
 await db.batch([q("UPDATE entries SET categories=(SELECT json_group_array(value) FROM json_each(entries.categories) WHERE value<>?) WHERE EXISTS(SELECT 1 FROM json_each(entries.categories) WHERE value=?)",p[1],p[1]),q('DELETE FROM categories WHERE id=?',p[1])]);
 await log('delete-category',p[1]);return ok({success:true});
 }
 if(p[0]==='categories'){if(method==='GET')return ok(await all('SELECT * FROM categories ORDER BY name'));admin();if(method==='POST'){const name=str(b.name,1,20,'카테고리');const cid=id();try{await q('INSERT INTO categories(id,name) VALUES(?,?)',cid,name).run()}catch(error){if(duplicate(error,'categories.name'))fail('이미 사용 중인 카테고리 이름입니다.',409);throw error}return ok({id:cid})}if(method==='PATCH'){if(!p[1])fail('카테고리 ID가 필요합니다.');const name=str(b.name,1,20,'카테고리');try{const r=await q('UPDATE categories SET name=? WHERE id=?',name,p[1]).run();if(!r.meta.changes)fail('카테고리를 찾을 수 없습니다.',404)}catch(error){if(duplicate(error,'categories.name'))fail('이미 사용 중인 카테고리 이름입니다.',409);throw error}return ok({success:true})}}
 if(p[0]==='audit'){admin();if(url.searchParams.has('page')){const page=pageNumber(url);return ok({entries:await all('SELECT * FROM audit ORDER BY created DESC,id DESC LIMIT 30 OFFSET ?',(page-1)*30),total:(await one('SELECT count(*) n FROM audit'))!.n,page})}return ok(await all('SELECT * FROM audit ORDER BY created DESC LIMIT 100'))}
 if(p[0]==='schedule'&&method==='GET'){
 const page=pageNumber(url),mine=url.searchParams.get('mine')==='1';if(mine)auth();
 const stamp=now(),who=user?.id||'',privileged=user&&user.role!=='USER'?1:0;
 const access="(e.author_id=? OR ?=1 OR EXISTS(SELECT 1 FROM editors x WHERE x.entry_id=e.id AND x.user_id=?))";
 const where="e.kind='thread' AND e.deleted=0 AND e.scheduled_at>? AND "+(mine?access:"e.schedule_listed=1");
 const args=mine?[stamp,who,privileged,who]:[stamp];
 const rows=await all(`SELECT e.id,e.title,e.cover_image,e.author_id,e.categories,e.scheduled_at,e.schedule_listed,e.preview_open,e.schedule_meta,e.secret IS NOT NULL is_secret,CASE WHEN u.active=1 THEN u.username ELSE '탈퇴 사용자' END author,${access} can_manage FROM entries e LEFT JOIN users u ON u.id=e.author_id WHERE ${where} ORDER BY e.scheduled_at ASC,e.rowid ASC LIMIT 10 OFFSET ?`,who,privileged,who,...args,(page-1)*10);
 const entries=rows.map(e=>{let m:Row={};try{m=JSON.parse(e.schedule_meta)}catch{}return {id:e.id,cover_image:m.image===false?null:e.cover_image,title:m.title?e.title:'예약 스레드',author:m.author?e.author:null,categories:m.categories?e.categories:'[]',scheduled_at:e.scheduled_at,is_secret:e.is_secret,listed:!!e.schedule_listed,canOpen:!!e.preview_open||!!e.can_manage,canManage:!!e.can_manage}});
 return ok({entries,total:(await one(`SELECT count(*) n FROM entries e WHERE ${where}`,...args))!.n,page});
 }
 if(p[0]==='entries'){
  const eid=p[1];let entry:Row|null=null;
  if(eid==='practice'){await q("INSERT OR IGNORE INTO entries(id,kind,title,content,categories,created,updated) VALUES('practice','practice','연습장','캐릭터의 목소리와 문장, 주사위를 자유롭게 연습하세요. 내가 쓴 댓글은 언제든 수정할 수 있습니다.','[]',?,?)",now(),now()).run()}
  if(!eid&&method==='GET'){const kind=url.searchParams.get('kind')==='wiki'?'wiki':'thread',search=url.searchParams.get('q')||'',cat=url.searchParams.get('category')||'',page=pageNumber(url);const where="e.kind=? AND e.deleted=0 AND (e.scheduled_at IS NULL OR e.scheduled_at<=?) AND (e.title LIKE ? ESCAPE '\\' OR (e.secret IS NULL AND e.content LIKE ? ESCAPE '\\')) AND (?='' OR EXISTS(SELECT 1 FROM json_each(e.categories) WHERE value=?))";const pattern='%'+search.replace(/[\\%_]/g,'\\$&')+'%';const args=[kind,now(),pattern,pattern,cat,cat];const rows=await all(`SELECT e.id,e.title,e.cover_image,e.kind,e.categories,e.created,e.updated,e.author_id,CASE WHEN u.active=1 THEN u.username ELSE '탈퇴 사용자' END author,e.secret IS NOT NULL is_secret,(SELECT count(*) FROM comments c WHERE c.entry_id=e.id) comment_count FROM entries e LEFT JOIN users u ON u.id=e.author_id WHERE ${where} ORDER BY MAX(e.updated,COALESCE(e.scheduled_at,e.updated)) DESC LIMIT 20 OFFSET ?`,...args,(page-1)*20);const count=await one(`SELECT count(*) n FROM entries e WHERE ${where}`,...args);return ok({entries:rows,total:count!.n,page})}
  if(!eid&&method==='POST'){auth();const kind=b.kind==='wiki'?'wiki':'thread',title=str(b.title,1,120,'제목'),content=str(b.content,1,kind==='wiki'?50000:5000,'본문');const cats=Array.isArray(b.categories)?[...new Set(b.categories)]:[];if(cats.length>3)fail('카테고리는 최대 3개입니다.');if(cats.some(c=>typeof c!=='string'))fail('잘못된 카테고리입니다.');for(const c of cats)if(!await one('SELECT id FROM categories WHERE id=?',c))fail('잘못된 카테고리입니다.');const isSecret=optionalBoolean(b,'isSecret',false);const secret=kind==='thread'&&isSecret?await hash(passwordValue(b.secretPw,4,'비밀글 비밀번호')):null;const schedule=scheduleInput(kind==='thread'?b:{},!!secret);const eid=id();await q('INSERT INTO entries(id,kind,title,content,author_id,secret,categories,created,updated,scheduled_at,schedule_listed,preview_open,schedule_meta,cover_image) VALUES(?,?,?,?,?,?,(SELECT json_group_array(value) FROM json_each(?) WHERE value IN(SELECT id FROM categories)),?,?,?,?,?,?,?)',eid,kind,title,content,user!.id,secret,JSON.stringify(cats),now(),now(),schedule.at,schedule.listed,schedule.open,schedule.meta,coverImage(b.coverImage)).run();return ok({id:eid})}
  if(!eid)fail('문서 ID가 필요합니다.');
  entry=await one("SELECT e.*,CASE WHEN u.active=1 THEN u.username ELSE '탈퇴 사용자' END author FROM entries e LEFT JOIN users u ON u.id=e.author_id WHERE e.id=? AND e.deleted=0",eid);if(!entry)fail('문서를 찾을 수 없습니다.',404);const e=entry!;
  const isAdmin=!!user&&['SUPER','SUB'].includes(user.role),isOwner=user?.id===e.author_id,canEdit=isAdmin||isOwner||!!(user&&await one('SELECT user_id FROM editors WHERE entry_id=? AND user_id=?',eid,user.id));
  if(p[2]==='categories'){
 auth();if(e.kind==='practice'||(!isAdmin&&!isOwner))fail('작성자 또는 관리자만 카테고리를 변경할 수 있습니다.',403);
 if(!Array.isArray(b.categories)||b.categories.some((c:unknown)=>typeof c!=='string'))fail('카테고리 목록이 올바르지 않습니다.');
 const cats=[...new Set(b.categories)];if(cats.length>3)fail('카테고리는 최대 3개입니다.');
 for(const c of cats)if(!await one('SELECT id FROM categories WHERE id=?',c))fail('삭제되었거나 존재하지 않는 카테고리입니다.');
 await q('UPDATE entries SET categories=(SELECT json_group_array(value) FROM json_each(?) WHERE value IN(SELECT id FROM categories)) WHERE id=? AND deleted=0',JSON.stringify(cats),eid).run();
 await log('set-entry-categories',eid);return ok({success:true});
 }
  const pending=e.kind==='thread'&&!!e.scheduled_at&&e.scheduled_at>now();
  if(pending&&!e.preview_open&&!canEdit)fail('아직 공개되지 않은 예약 스레드입니다.',404);
  if(p[2]==='unlock'&&method==='POST'){const address=clientAddress(req);await rate('unlock-address:'+address,100);await rate(credentialLimitKey('secret',address,eid));if(!e.secret||!await verify(b.password,e.secret))fail('비밀번호가 일치하지 않습니다.',401);const t=id()+id();await q('INSERT INTO grants(token,entry_id,expires) VALUES(?,?,?)',await digest(t),eid,Date.now()+3600000).run();headers.append('Set-Cookie',`rp_grant_${eid}=${t}; Path=/api/entries/${eid}; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`);await log('unlock',eid);return ok({success:true})}
  if(e.secret){const t=cookie(req,`rp_grant_${eid}`);if(!t||!await one('SELECT token FROM grants WHERE token=? AND entry_id=? AND expires>?',await digest(t),eid,Date.now()))return new Response(JSON.stringify({error:'비밀 스레드입니다. 비밀번호를 입력해 주세요.',locked:true,title:e.title}),{status:403,headers})}
  if(p[2]==='anchors'){
   const number=Number(p[3]);if(e.kind!=='thread'||!/^\d+$/.test(p[3])||!Number.isInteger(number)||number<1||number>1500)fail('앵커 대상을 찾을 수 없습니다.',404);
   const reply=await one('SELECT hidden,deleted FROM comments WHERE entry_id=? ORDER BY rowid LIMIT 1 OFFSET ?',eid,number-1);
   if(!reply)fail('레스를 찾을 수 없습니다.',404);
   return ok({status:reply!.deleted?'deleted':reply!.hidden?'hidden':'visible'});
  }
  if(p[2]==='editors'){auth();if(!isAdmin&&!isOwner)fail('작성자만 편집 권한을 공유할 수 있습니다.',403);if(method==='GET')return ok(await all('SELECT u.id,u.username FROM editors x JOIN users u ON u.id=x.user_id WHERE x.entry_id=?',eid));if((method==='POST'||method==='DELETE')&&typeof b.userId!=='string')fail('회원을 찾을 수 없습니다.');if(method==='POST'){if(!await one('SELECT id FROM users WHERE id=? AND active=1',b.userId))fail('회원을 찾을 수 없습니다.');await q('INSERT OR IGNORE INTO editors(entry_id,user_id) VALUES(?,?)',eid,b.userId).run();return ok({success:true})}if(method==='DELETE'){await q('DELETE FROM editors WHERE entry_id=? AND user_id=?',eid,b.userId).run();return ok({success:true})}}
  const readComments=()=>all("SELECT c.id,c.author_id,c.character,CASE WHEN (c.hidden=0 OR (c.entry_id='practice' AND c.author_id=?)) AND c.deleted=0 THEN c.content ELSE '' END content,c.hidden,c.deleted,CASE WHEN (c.hidden=0 OR (c.entry_id='practice' AND c.author_id=?)) AND c.deleted=0 THEN c.dice ELSE NULL END dice,c.created,c.updated,CASE WHEN u.active=1 THEN u.username ELSE '탈퇴 사용자' END author FROM comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.entry_id=? AND (?!='practice' OR c.deleted=0) ORDER BY c.rowid",user?.id||'',user?.id||'',eid,eid);
  if(p[2]==='comments'){
   if(method==='GET')return ok(await readComments());
   auth();if(method==='POST'){if(pending)fail('예약 시각 이후에 레스를 작성할 수 있습니다.',409);if(e.kind==='wiki')fail('위키에는 댓글을 작성할 수 없습니다.');const character=characterName(b.character||user!.username),content=str(b.content,1,1500,'레스');let dice=null;try{const rolls=rollDice(content);if(rolls.length)dice=JSON.stringify(rolls)}catch(error){fail((error as Error).message)}const cid=id();const r=await q("INSERT INTO comments(id,entry_id,author_id,character,content,dice,created,updated) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM comments WHERE entry_id=? AND (?!='practice' OR deleted=0))<1500",cid,eid,user!.id,character,content,dice,now(),now(),eid,eid).run();if(!r.meta.changes)fail('댓글 1,500개에 도달했습니다.',409);await db.batch([q('INSERT OR IGNORE INTO names(user_id,name) VALUES(?,?)',user!.id,character),q('UPDATE entries SET updated=? WHERE id=?',now(),eid)]);return ok({id:cid})}
   if(!p[3])fail('레스 ID가 필요합니다.');
   const comment=await one('SELECT * FROM comments WHERE id=? AND entry_id=?',p[3],eid);if(!comment)fail('댓글을 찾을 수 없습니다.',404);
   if(method==='DELETE'){if(e.kind==='practice'){if(!isAdmin&&comment!.author_id!==user!.id)fail('내 연습장 레스만 삭제할 수 있습니다.',403);await q("DELETE FROM comments WHERE entry_id=? AND (id=? OR deleted=1)",eid,p[3]).run();await log('delete-practice-comment',p[3]);return ok({success:true})}admin();await q("UPDATE comments SET deleted=1,content='',dice=NULL,character='',updated=? WHERE id=? AND entry_id=?",now(),p[3],eid).run();await log('delete-comment',p[3]);return ok({success:true})}
   if(comment!.deleted)fail('삭제된 레스입니다.',410);
   if(method==='PATCH'){if(typeof b.hidden==='boolean'){if(!isAdmin&&!isOwner)fail('스레드 작성자 또는 관리자만 가릴 수 있습니다.',403);await q('UPDATE comments SET hidden=? WHERE id=?',b.hidden?1:0,p[3]).run();await log(b.hidden?'hide':'unhide',p[3]);return ok({success:true})}if(e.kind!=='practice'||comment!.author_id!==user!.id)fail('연습장에서 내가 쓴 댓글만 수정할 수 있습니다.',403);const edited=str(b.content,1,1500,'레스');let dice=null;try{const rolls=rollDice(edited);if(rolls.length)dice=JSON.stringify(rolls)}catch(error){fail((error as Error).message)}await q('UPDATE comments SET content=?,dice=?,updated=? WHERE id=?',edited,dice,now(),p[3]).run();return ok({success:true})}
   fail('지원하지 않는 레스 요청입니다.',405);
  }
  if(p[2])fail('요청을 찾을 수 없습니다.',404);
  if(method==='GET'){const {secret,...safe}=e;const replies=url.searchParams.get('include')==='comments'?{comments:e.kind==='wiki'?[]:await readComments()}:{};return ok({...safe,...replies,is_secret:!!secret,canEdit:e.kind!=='practice'&&canEdit,canManageCategories:e.kind!=='practice'&&(isAdmin||isOwner),canShare:e.kind!=='practice'&&(isAdmin||isOwner),canHide:isAdmin||isOwner,canDeleteComment:isAdmin,pending,canDelete:e.kind!=='practice'&&(isAdmin||(pending&&isOwner))})}
  if(method==='PATCH'){auth();if(!canEdit||e.kind==='practice')fail('편집 권한이 없습니다.',403);const title=str(b.title,1,120,'제목'),content=str(b.content,1,e.kind==='wiki'?50000:5000,'본문'),cats=Array.isArray(b.categories)?[...new Set(b.categories)]:JSON.parse(e.categories);if(cats.length>3)fail('카테고리는 최대 3개입니다.');if(cats.some((c:unknown)=>typeof c!=='string'))fail('잘못된 카테고리입니다.');for(const c of cats)if(!await one('SELECT id FROM categories WHERE id=?',c))fail('잘못된 카테고리입니다.');if(!isAdmin&&!isOwner&&JSON.stringify([...cats].sort())!==JSON.stringify([...JSON.parse(e.categories)].sort()))fail('작성자 또는 관리자만 카테고리를 변경할 수 있습니다.',403);const image=Object.hasOwn(b,'coverImage')?coverImage(b.coverImage):e.cover_image;if(Object.hasOwn(b,'scheduledAt')&&e.kind==='thread'){
 if(!pending)fail('공개된 스레드는 다시 예약할 수 없습니다.',409);
 const schedule=scheduleInput(b,!!e.secret);
 const changed=await q('UPDATE entries SET title=?,content=?,categories=(SELECT json_group_array(value) FROM json_each(?) WHERE value IN(SELECT id FROM categories)),updated=?,scheduled_at=?,schedule_listed=?,preview_open=?,schedule_meta=?,cover_image=? WHERE id=? AND scheduled_at>?',title,content,JSON.stringify(cats),now(),schedule.at,schedule.listed,schedule.open,schedule.meta,image,eid,now()).run();
 if(!changed.meta.changes)fail('이미 공개되었습니다. 새로고침 후 다시 수정해 주세요.',409);
 }else await q('UPDATE entries SET title=?,content=?,categories=(SELECT json_group_array(value) FROM json_each(?) WHERE value IN(SELECT id FROM categories)),updated=?,cover_image=? WHERE id=?',title,content,JSON.stringify(cats),now(),image,eid).run();return ok({success:true})}
  if(method==='DELETE'){auth();if(e.kind==='practice')fail('연습장은 삭제할 수 없습니다.');if(!isAdmin&&!isOwner)fail('삭제 권한이 없습니다.',403);const result=await q('UPDATE entries SET deleted=1 WHERE id=? AND (?=1 OR scheduled_at>?)',eid,isAdmin?1:0,now()).run();if(!result.meta.changes)fail('공개된 스레드는 관리자만 삭제할 수 있습니다.',403);await log('delete-entry',eid);return ok({success:true})}
 }
 fail('요청을 찾을 수 없습니다.',404);
 }catch(error){if(req.body&&!req.bodyUsed)await req.body.cancel().catch(()=>{});const e=error as Error&{status?:number};if(!e.status)console.error('RP LAND API',e);return new Response(JSON.stringify({error:e.status?e.message:'일시적으로 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.'}),{status:e.status||503,headers})}
}
