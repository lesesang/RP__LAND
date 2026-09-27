export async function run({a,c,d,guest,au,cu,du,suffix,client,check,sql,base,later}){
 const e=client(),f=client(),g=client(),accounts=[];
 for(const [actor,name]of[[e,'sub2'],[f,'user2'],[g,'user3']]){
  const username=name+suffix;check((await actor('register','POST',{username,password:'test-only-Password!'})).status===200,'create '+name);
  check((await actor('login','POST',{username,password:'test-only-Password!'})).status===200,'login '+name);
  accounts.push((await actor('me')).data.user);
 }
 const [eu,fu,gu]=accounts.map(x=>x.id);
 check((await a('users/'+eu,'PATCH',{role:'SUB'})).status===200,'appoint second deputy');
 const roster=(await a('users')).data.filter(x=>x.active);
 check(roster.filter(x=>x.role==='SUPER').length===1&&roster.filter(x=>x.role==='SUB').length===2&&roster.filter(x=>x.role==='USER').length===3,'one super, two deputies and three ordinary users active together');
 const actors=[['super',a],['deputy1',c],['deputy2',e],['user1',d],['user2',f],['user3',g]];
 const thread=(await d('entries','POST',{title:'권한 교차 확인',content:'원본'})).data.id;
 for(const [name,actor]of actors){
  check((await actor('users')).status===200,name+' reads member list');
  const own=(await actor('entries','POST',{title:name+' thread',content:'첫 줄\n둘째 줄'})).data.id;
  check(!!own,name+' creates thread');
  check((await actor('entries/'+own,'PATCH',{title:name+' edited',content:'고친 글'})).status===200,name+' edits own thread');
  const reply=(await actor('entries/'+thread+'/comments','POST',{content:'테스트 [dice:2x0..100!-3]',character:name+' 캐릭터'})).data.id;
  check(!!reply,name+' posts dice response');
  check((await actor('me')).data.names.some(x=>x.name===name+' 캐릭터'),name+' retains character name');
  check((await actor('entries/'+thread+'/comments/'+reply,'PATCH',{content:'다시 굴리기'})).status===403,name+' cannot edit normal response even when privileged');
  const practice=(await actor('entries/practice/comments','POST',{content:'[dice:1x0..0]'})).data.id;
  check((await actor('entries/practice/comments/'+practice,'PATCH',{content:'변경 [dice:1x1..1]'})).status===200,name+' edits own practice dice');
  check((await actor('entries/practice/comments/'+practice,'DELETE',{})).status===200,name+' deletes own practice dice');
 }
 for(const [name,actor]of[['user2',f],['user3',g]]){
  check((await actor('entries/'+thread,'PATCH',{title:'침범',content:'금지'})).status===403,name+' cannot edit other thread');
  check((await actor('entries/'+thread,'DELETE',{})).status===403,name+' cannot delete other thread');
  check((await actor('categories','POST',{name:'unauthorized'})).status===403,name+' cannot manage categories');
  check((await actor('audit')).status===403,name+' cannot read administrative audit');
 }
 check((await d('entries/'+thread+'/editors','POST',{userId:fu})).status===200,'owner shares with ordinary editor');
 check((await f('entries/'+thread+'/editors','GET')).status===403,'shared editor cannot list/manage grants');
 check((await f('entries/'+thread,'PATCH',{title:'공동 수정',content:'수정됨'})).status===200,'ordinary shared editor edits');
 check((await d('entries/'+thread+'/editors')).data.some(x=>x.id===fu),'owner sees shared editor');
 check((await d('entries/'+thread+'/editors','DELETE',{userId:fu})).status===200,'owner revokes editing');
 check((await f('entries/'+thread,'PATCH',{title:'취소 후 수정',content:'거부'})).status===403,'revocation immediately enforced');
 const reply=(await f('entries/'+thread+'/comments','POST',{content:'숨김 확인 [dice:1d6]'})).data.id;
 check((await d('entries/'+thread+'/comments/'+reply,'PATCH',{hidden:true})).status===200,'thread owner hides response');
 check((await guest('entries/'+thread+'/comments')).data.find(x=>x.id===reply).dice===null,'hidden roll is redacted');
 check((await d('entries/'+thread+'/comments/'+reply,'PATCH',{hidden:false})).status===200,'thread owner unhides response');
 check((await guest('entries/'+thread+'/comments')).data.find(x=>x.id===reply).content.includes('숨김 확인'),'unhide restores content');
 for(const [name,actor]of[['deputy1',c],['deputy2',e]]){
  check((await actor('entries/'+thread,'PATCH',{title:name+' 운영 수정',content:'관리 수정'})).status===200,name+' edits another thread');
  check((await actor('entries/'+thread+'/comments/'+reply,'PATCH',{hidden:true})).status===200,name+' hides response');
  check((await actor('entries/'+thread+'/comments/'+reply,'PATCH',{hidden:false})).status===200,name+' unhides response');
  check((await actor('audit')).status===200,name+' reads audit');
  check((await actor('users/'+fu,'PATCH',{role:'SUB'})).status===403,name+' cannot appoint another deputy');
  check((await actor('users/'+fu,'DELETE',{})).status===403,name+' cannot forcibly withdraw member');
  const cat=(await actor('categories','POST',{name:name+suffix})).data.id;
  check(!!cat,name+' creates category');
  check((await actor('categories/'+cat,'PATCH',{name:name+' renamed'})).status===200,name+' renames category');
  check((await guest('categories')).data.some(x=>x.id===cat&&x.name===name+' renamed'),name+' category rename visible');
  const victim=(await f('entries/practice/comments','POST',{content:'타인 연습장 [dice:1d6]'})).data.id;
  check((await actor('entries/practice/comments/'+victim,'DELETE',{})).status===200,name+' deletes another practice response');
 }
 const hidden=(await f('entries/practice/comments','POST',{content:'내 숨긴 글 [dice:1d6]'})).data.id;
 await c('entries/practice/comments/'+hidden,'PATCH',{hidden:true});
 check((await f('entries/practice/comments')).data.find(x=>x.id===hidden).content.includes('내 숨긴 글'),'author retrieves hidden practice source');
 check((await g('entries/practice/comments')).data.find(x=>x.id===hidden).content==='','others cannot retrieve hidden practice source');
 check((await f('entries/practice/comments/'+hidden,'PATCH',{content:'숨김 유지 [dice:1x4..4]'})).status===200,'owner edits hidden practice source');
 check((await guest('entries/practice/comments')).data.find(x=>x.id===hidden).hidden===1,'editing does not remove moderation');
 check((await f('entries/practice/comments/'+hidden,'PATCH',{hidden:false})).status===403,'ordinary author cannot unhide moderated practice response');
 const wiki=(await f('entries','POST',{kind:'wiki',title:'위키 기능',content:'세계관'})).data.id;
 check((await f('entries/'+wiki+'/editors','POST',{userId:gu})).status===200,'wiki editor sharing');
 check((await g('entries/'+wiki,'PATCH',{title:'위키 갱신',content:'공동 문서'})).status===200,'ordinary wiki shared editing');
 check((await f('entries/'+wiki+'/comments','POST',{content:'불가'})).status===400,'wiki rejects responses');
 check((await f('entries/'+wiki,'DELETE',{})).status===403,'wiki ordinary owner cannot delete');
 check((await e('entries/'+wiki,'DELETE',{})).status===200,'second deputy deletes wiki');
 const secret=(await f('entries','POST',{title:'개별 비밀',content:'비밀 본문',isSecret:true,secretPw:'secret-fixture'})).data.id;
 for(const [name,actor]of[['super',a],['deputy1',c],['deputy2',e]])check((await actor('entries/'+secret)).status===403,name+' cannot bypass secret password');
 check((await g('entries/'+secret+'/unlock','POST',{password:'secret-fixture'})).status===200,'ordinary member unlocks secret');
 check((await g('entries/'+secret+'/comments','POST',{content:'비밀 답글'})).status===200,'unlocked member posts secret response');
 check((await g('entries/'+secret,'PATCH',{title:'무권한',content:'본문'})).status===403,'secret unlock does not grant editing');
 check((await g('entries/'+secret+'/editors','POST',{userId:gu})).status===403,'secret unlock does not grant sharing');
 const scheduled=(await f('entries','POST',{title:'비노출 예약',content:'예약 원본',scheduledAt:later,scheduleListed:false,previewOpen:false})).data.id;
 check((await g('entries/'+scheduled)).status===404,'unshared user cannot inspect hidden scheduled thread');
 await f('entries/'+scheduled+'/editors','POST',{userId:gu});
 check((await g('entries/'+scheduled)).data.canEdit===true,'shared ordinary user accesses closed scheduled thread');
 check((await g('schedule?mine=1')).data.entries.some(x=>x.id===scheduled),'shared ordinary editor sees hidden reservation in own management');
 check((await g('entries/'+scheduled,'PATCH',{title:'공동 예약 수정',content:'새 본문'})).status===200,'shared ordinary editor edits reservation');
 check((await g('entries/'+scheduled,'DELETE',{})).status===403,'shared editor cannot delete reservation');
 check((await f('entries/'+scheduled,'PATCH',{title:'즉시 공개',content:'지금 공개',scheduledAt:null})).status===200,'author cancels delay and publishes immediately');
 check((await guest('entries/'+scheduled)).data.pending===false,'immediate publication removes pending state');
 check((await f('entries','POST',{title:'과거 예약',content:'본문',scheduledAt:'2000-01-01T00:00:00Z'})).status===400,'past scheduled time rejected');
 check((await f('entries','POST',{title:'잘못된 예약',content:'본문',scheduledAt:'invalid'})).status===400,'invalid scheduled time rejected');
 // Content and request boundaries.
 check((await guest('register','POST',{username:'user2'+suffix,password:'test-only-Password!'})).status===409,'duplicate username rejected');
 check((await guest('register','POST',{username:'bad user',password:'12345678'})).status===400,'invalid username rejected');
 check((await guest('register','POST',{username:'shortpass',password:'123'})).status===400,'short password rejected');
 check((await f('entries','POST',{title:'빈 본문',content:'   '})).status===400,'whitespace-only content rejected');
 const wrongOrigin=await fetch(base+'/api/entries',{method:'POST',headers:{Origin:'https://unrelated.invalid','Content-Type':'application/json'},body:'{}'});
 check(wrongOrigin.status===403,'cross-origin write rejected');
 check((await fetch(base+'/api/entries',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status===415,'non-JSON write rejected');
 check((await fetch(base+'/api/entries',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status===400,'malformed JSON rejected');
 check((await f('entries/practice/comments','POST',{content:'[dice:1x0..0+100000001]'})).status===400,'out-of-range modifier rejected');
 check((await f('entries/practice/comments','POST',{content:Array(11).fill('[dice:1d6]').join(' ')})).status===400,'more than ten dice expressions rejected');
 check((await f('entries/practice/comments','POST',{content:'[dice:60d6] [dice:60d6]'})).status===400,'more than one hundred total dice rejected');
 const maxDice=(await f('entries/practice/comments','POST',{content:'[dice:100x0..99!]'})).data.id;
 const all=JSON.parse((await f('entries/practice/comments')).data.find(x=>x.id===maxDice).dice)[0];
 check(all.values.length===100&&new Set(all.values).size===100&&all.total===4950,'one hundred unique dice records complete range');
 check((await a('users/'+au,'PATCH',{role:'USER'})).status===400,'super cannot demote self');
 check((await a('me','DELETE',{password:'test-only-Password!'})).status===400,'super cannot withdraw self');
 check((await a('users/'+eu,'PATCH',{role:'USER'})).status===200,'super demotes second deputy');
 check((await e('audit')).status===403,'demotion immediately revokes admin privileges');
 check((await a('users/'+eu,'PATCH',{role:'SUB'})).status===200,'super reappoints second deputy');
 check((await g('logout','POST',{})).status===200,'logout succeeds');
 check((await g('me')).data.user===null,'logout clears session identity');
 check((await g('entries','POST',{title:'로그아웃 후',content:'거부'})).status===401,'logged-out user cannot write');
 check((await g('login','POST',{username:'user3'+suffix,password:'test-only-Password!'})).status===200,'login after logout');
 check((await a('users/'+gu,'DELETE',{})).status===200,'super forcibly withdraws member');
 check((await g('me')).data.user===null,'forced withdrawal revokes existing session');
 check((await g('login','POST',{username:'user3'+suffix,password:'test-only-Password!'})).status===401,'withdrawn member cannot log in');
 check((await f('me','DELETE',{password:'incorrect'})).status===401,'withdrawal requires correct password');
 check((await f('me','DELETE',{password:'test-only-Password!'})).status===200,'ordinary user voluntarily withdraws');
 check((await f('me')).data.user===null,'voluntary withdrawal revokes session');
 // Each supported account and content action is now represented; literal UI rendering tested separately.
 console.log('PASS role matrix: 1 super, 2 deputies, 3 concurrent ordinary members, plus withdrawal fixture');
}
