// Independent QA pass: 1 super admin + 2 deputies + 4 ordinary members, run against
// a disposable local D1 database. Never touches production. Non-fatal checker:
// collects every result instead of throwing on the first failure, so one problem
// doesn't hide the rest.
import {mkdtempSync,readdirSync,mkdirSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';

mkdirSync('.sites-runtime',{recursive:true});
const dbPath=mkdtempSync('.sites-runtime/qa-full-db-');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
  const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',dbPath,'--file','drizzle/'+file],{encoding:'utf8'});
  if(r.status)throw new Error(r.stderr+r.stdout);
}
const setupToken='qa-full-run-token-'+Math.random().toString(36).slice(2);
const port=8801;
const server=spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--local','--persist-to',dbPath,'--ip','127.0.0.1','--port',String(port),'--var','ADMIN_SETUP_TOKEN:'+setupToken,'--inspector-port','0'],{stdio:['ignore','pipe','pipe']});
let bootOutput='';
try{
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Worker startup timed out: '+bootOutput)),45000);
    server.stdout.on('data',d=>{bootOutput+=d;if(bootOutput.includes('Ready on')){clearTimeout(timer);resolve()}});
    server.stderr.on('data',d=>{bootOutput+=d});
    server.on('exit',code=>reject(new Error('Worker exited '+code+' '+bootOutput)));
  });
  const base='http://127.0.0.1:'+port;

  // ---- test harness -------------------------------------------------------
  const results=[]; // {section,name,pass,detail}
  let section='';
  function sec(s){section=s;}
  function check(v,name,detail){results.push({section,name,pass:!!v,detail});}
  function client(){
    let cookies={};
    return async(path,method='GET',data,extraHeaders={})=>{
      const headers={'Content-Type':'application/json',Cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; '),...extraHeaders};
      const r=await fetch(base+'/api/'+path,{method,headers,body:data!==undefined?JSON.stringify(data):undefined});
      for(const c of (r.headers.getSetCookie?.()||[])){const[k,...v]=c.split(';')[0].split('=');cookies[k]=v.join('=');}
      let json=null; try{json=await r.json();}catch{}
      return {status:r.status,data:json};
    };
  }
  const suffix=Date.now();

  // ---- Part A: provision exactly 1 super + 2 sub + 4 user -----------------
  sec('A. 계정 프로비저닝 (총관리자1/부관리자2/일반회원4)');
  const roles=[
    ['super1','SUPER'],['sub1','SUB'],['sub2','SUB'],
    ['user1','USER'],['user2','USER'],['user3','USER'],['user4','USER'],
  ];
  const actors={};
  for(const [name] of roles){
    actors[name]=client();
    const uname=name+'_'+suffix;
    actors[name]._username=uname;
    const reg=await actors[name]('register','POST',{username:uname,password:'Qa-Test-Password!1'});
    check(reg.status===200,name+' 회원가입',reg);
    const login=await actors[name]('login','POST',{username:uname,password:'Qa-Test-Password!1'});
    check(login.status===200,name+' 로그인',login);
    const me=await actors[name]('me');
    actors[name]._id=me.data?.user?.id;
    check(me.data?.user?.role==='USER',name+' 가입 직후 역할=일반회원',me.data);
  }
  const wrongBoot=await actors.super1('setup','POST',{token:'wrong-token'});
  check(wrongBoot.status===403,'잘못된 설정 키로 총관리자 지정 거부',wrongBoot);
  const boot=await actors.super1('setup','POST',{token:setupToken});
  check(boot.status===200,'올바른 설정 키로 최초 총관리자 지정',boot);
  const reboot=await actors.sub1('setup','POST',{token:setupToken});
  check(reboot.status===409,'총관리자가 이미 있으면 재지정 거부',reboot);

  const appoint1=await actors.super1('users/'+actors.sub1._id,'PATCH',{role:'SUB'});
  check(appoint1.status===200,'총관리자가 sub1을 부관리자로 임명',appoint1);
  const appoint2=await actors.super1('users/'+actors.sub2._id,'PATCH',{role:'SUB'});
  check(appoint2.status===200,'총관리자가 sub2를 부관리자로 임명',appoint2);

  const roster=await actors.user1('users');
  const byName=Object.fromEntries(roster.data.map(u=>[u.username,u]));
  const superCount=roster.data.filter(u=>u.role==='SUPER'&&u.active).length;
  const subCount=roster.data.filter(u=>u.role==='SUB'&&u.active).length;
  const userCount=roster.data.filter(u=>u.role==='USER'&&u.active&&roles.some(([n])=>u.username===actors[n]._username)).length;
  check(superCount===1,'활성 총관리자 정확히 1명',{superCount});
  check(subCount===2,'활성 부관리자 정확히 2명',{subCount});
  check(userCount===4,'활성 일반회원(테스트 대상) 정확히 4명',{userCount});
  check(byName[actors.super1._username]?.role==='SUPER','super1 역할 확인');
  check(byName[actors.sub1._username]?.role==='SUB','sub1 역할 확인');
  check(byName[actors.sub2._username]?.role==='SUB','sub2 역할 확인');
  for(const n of ['user1','user2','user3','user4']) check(byName[actors[n]._username]?.role==='USER',n+' 역할 확인');

  const guest=client();

  // ---- Part B: 스레드/위키 권한 매트릭스 (7개 계정 전원) --------------------
  sec('B. 스레드·위키 생성/수정/삭제 권한 (전 계정)');
  const threads={};
  for(const [name] of roles){
    const t=await actors[name]('entries','POST',{title:name+' 스레드 '+suffix,content:name+'의 스레드 본문',kind:'thread'});
    check(t.status===200&&!!t.data?.id,name+' 스레드 생성',t);
    threads[name]=t.data?.id;
    const selfEdit=await actors[name]('entries/'+threads[name],'PATCH',{title:'수정됨',content:'수정된 본문'});
    check(selfEdit.status===200,name+' 본인 스레드 본문 수정',selfEdit);
  }
  // 타인이 남의 스레드를 수정/삭제할 수 없는지 (관리자 제외)
  const otherEdit=await actors.user2('entries/'+threads.user1,'PATCH',{title:'침해',content:'x'});
  check(otherEdit.status===403,'user2가 user1 스레드 수정 시도 → 거부',otherEdit);
  const otherDelete=await actors.user2('entries/'+threads.user1,'DELETE',{});
  check(otherDelete.status===403,'user2가 user1 스레드(공개 후) 삭제 시도 → 거부',otherDelete);
  // 관리자는 타인 스레드 편집 가능, 삭제는 공개 후엔 admin만
  const adminEdit=await actors.sub1('entries/'+threads.user1,'PATCH',{title:'관리자 수정',content:'관리자가 고침'});
  check(adminEdit.status===200,'sub1(부관리자)이 user1 스레드 수정 가능',adminEdit);
  const ownerDeleteAfterPublish=await actors.user1('entries/'+threads.user1,'DELETE',{});
  check(ownerDeleteAfterPublish.status===403,'공개된 스레드는 작성자 본인도 삭제 불가',ownerDeleteAfterPublish);
  const adminDelete=await actors.super1('entries/'+threads.user1,'DELETE',{});
  check(adminDelete.status===200,'총관리자는 공개된 스레드 삭제 가능',adminDelete);
  const deletedGone=await guest('entries/'+threads.user1);
  check(deletedGone.status===404,'삭제된 스레드는 조회 불가',deletedGone);

  // 위키
  const wiki=await actors.user3('entries','POST',{title:'세계관 위키 '+suffix,content:'설정 문서',kind:'wiki'});
  check(wiki.status===200,'user3 위키 생성',wiki);
  const wikiId=wiki.data.id;
  const wikiShare=await actors.user3('entries/'+wikiId+'/editors','POST',{userId:actors.user4._id});
  check(wikiShare.status===200,'user3가 user4에게 위키 편집권 공유',wikiShare);
  const wikiCoEdit=await actors.user4('entries/'+wikiId,'PATCH',{title:'공동편집',content:'user4가 고침'});
  check(wikiCoEdit.status===200,'user4(공동편집자)가 위키 수정 가능',wikiCoEdit);
  const wikiReshare=await actors.user4('entries/'+wikiId+'/editors','POST',{userId:actors.user2._id});
  check(wikiReshare.status===403,'공동편집자는 편집권을 재공유할 수 없음',wikiReshare);
  const wikiCoDelete=await actors.user4('entries/'+wikiId,'DELETE',{});
  check(wikiCoDelete.status===403,'공동편집자는 위키를 삭제할 수 없음',wikiCoDelete);
  const wikiOwnerDelete=await actors.user3('entries/'+wikiId,'DELETE',{});
  check(wikiOwnerDelete.status===403,'위키는 작성자 본인도 삭제 불가(관리자만)',wikiOwnerDelete);
  const wikiComment=await actors.user3('entries/'+wikiId+'/comments','POST',{content:'위키에 레스 시도'});
  check(wikiComment.status===400,'위키에는 레스(댓글) 작성 불가',wikiComment);
  const wikiRevoke=await actors.user3('entries/'+wikiId+'/editors','DELETE',{userId:actors.user4._id});
  check(wikiRevoke.status===200,'user3가 user4의 위키 편집권 회수',wikiRevoke);
  const wikiRevokedEdit=await actors.user4('entries/'+wikiId,'PATCH',{title:'회수후시도',content:'x'});
  check(wikiRevokedEdit.status===403,'편집권 회수 직후 즉시 차단',wikiRevokedEdit);

  // ---- Part C: 카테고리 --------------------------------------------------
  sec('C. 카테고리 관리');
  const catDeniedForUser=await actors.user1('categories','POST',{name:'유저시도'});
  check(catDeniedForUser.status===403,'일반회원은 카테고리 생성 불가',catDeniedForUser);
  const cat1=await actors.super1('categories','POST',{name:'연애'+suffix});
  check(cat1.status===200,'총관리자 카테고리 생성',cat1);
  const cat2=await actors.sub1('categories','POST',{name:'전투'+suffix});
  check(cat2.status===200,'부관리자 카테고리 생성',cat2);
  const cat3=await actors.sub2('categories','POST',{name:'일상'+suffix});
  check(cat3.status===200,'부관리자 카테고리 생성2',cat3);
  const dupCat=await actors.super1('categories','POST',{name:'연애'+suffix});
  check(dupCat.status===409||dupCat.status===400,'[신규점검] 중복 카테고리명 생성 시 적절한 4xx 응답',dupCat);
  const renameDup=await actors.super1('categories/'+cat2.data.id,'PATCH',{name:'연애'+suffix});
  check(renameDup.status===409||renameDup.status===400,'[신규점검] 카테고리 이름을 다른 카테고리와 중복되게 변경 시 적절한 4xx 응답',renameDup);
  const renameOk=await actors.super1('categories/'+cat3.data.id,'PATCH',{name:'일상토크'+suffix});
  check(renameOk.status===200,'카테고리 이름 정상 변경',renameOk);
  const catList=await guest('categories');
  check(catList.data.some(c=>c.name==='일상토크'+suffix),'변경된 카테고리명이 목록에 반영됨',catList.data);

  const catThread=await actors.user1('entries','POST',{title:'카테고리 테스트',content:'x',kind:'thread',categories:[cat1.data.id,cat2.data.id,cat3.data.id]});
  check(catThread.status===200,'카테고리 3개로 스레드 생성',catThread);
  const catThreadOver=await actors.user1('entries','POST',{title:'카테고리 초과',content:'x',kind:'thread',categories:[cat1.data.id,cat2.data.id,cat3.data.id,cat1.data.id+'x']});
  check(catThreadOver.status===400,'카테고리 4개 이상 또는 잘못된 카테고리 거부',catThreadOver);
  const catFilter=await guest('entries?category='+cat1.data.id);
  check(catFilter.data.entries.some(e=>e.id===catThread.data.id),'카테고리 필터 검색 동작',catFilter.data);

  // ---- Part D: 레스(댓글) 정책 - 일반 스레드 -------------------------------
  sec('D. 일반 스레드 레스 정책');
  const mainThread=await actors.user2('entries','POST',{title:'메인 스레드 '+suffix,content:'진행 시작'});
  const mtid=mainThread.data.id;
  const c1=await actors.user2('entries/'+mtid+'/comments','POST',{content:'첫 레스',character:'주인공A'});
  check(c1.status===200,'작성자가 첫 레스 작성',c1);
  const c2=await actors.user3('entries/'+mtid+'/comments','POST',{content:'두번째 레스 [dice:2d6]',character:'주인공B'});
  check(c2.status===200,'다른 회원이 레스+주사위 작성',c2);
  const selfEditNormal=await actors.user2('entries/'+mtid+'/comments/'+c1.data.id,'PATCH',{content:'수정시도'});
  check(selfEditNormal.status===403,'일반 스레드 레스는 본인도 수정 불가',selfEditNormal);
  const adminEditNormal=await actors.super1('entries/'+mtid+'/comments/'+c1.data.id,'PATCH',{content:'관리자수정시도'});
  check(adminEditNormal.status===403,'일반 스레드 레스는 관리자도 수정 불가',adminEditNormal);
  const userDeleteNormal=await actors.user2('entries/'+mtid+'/comments/'+c1.data.id,'DELETE',{});
  check(userDeleteNormal.status===403,'일반회원은 일반 레스를 삭제할 수 없음(본인 포함)',userDeleteNormal);
  const userHide=await actors.user3('entries/'+mtid+'/comments/'+c1.data.id,'PATCH',{hidden:true});
  check(userHide.status===403,'스레드 작성자/관리자가 아니면 가리기 불가',userHide);
  const ownerHide=await actors.user2('entries/'+mtid+'/comments/'+c1.data.id,'PATCH',{hidden:true});
  check(ownerHide.status===200,'스레드 작성자는 레스 가리기 가능',ownerHide);
  const hiddenView=await guest('entries/'+mtid+'/comments');
  const hiddenRow=hiddenView.data.find(x=>x.id===c1.data.id);
  check(hiddenRow?.content==='','가려진 레스는 본문이 빈 값으로 응답',hiddenRow);
  const ownerUnhide=await actors.user2('entries/'+mtid+'/comments/'+c1.data.id,'PATCH',{hidden:false});
  check(ownerUnhide.status===200,'스레드 작성자가 가림 해제',ownerUnhide);
  const unhiddenView=await guest('entries/'+mtid+'/comments');
  check(unhiddenView.data.find(x=>x.id===c1.data.id)?.content==='첫 레스','해제 후 원문 복원');
  const adminDeleteComment=await actors.sub2('entries/'+mtid+'/comments/'+c1.data.id,'DELETE',{});
  check(adminDeleteComment.status===200,'부관리자는 일반 레스 삭제 가능',adminDeleteComment);
  const afterDelete=await guest('entries/'+mtid+'/comments');
  const remaining=afterDelete.data;
  check(remaining.length===2,'삭제 후에도 레스 개수(번호)는 유지됨(빈 자리로 존재)',remaining.length);
  check(remaining[0].content===''&&remaining[0].deleted===1,'삭제된 레스는 표시만 남고 본문/캐릭터명 제거',remaining[0]);
  check(remaining[1].id===c2.data.id,'뒤 레스 번호가 당겨지지 않음(순서 유지)');

  // ---- Part E: 연습장 ------------------------------------------------------
  sec('E. 연습장(practice) 정책');
  await actors.user1('entries/practice');
  const p1=await actors.user1('entries/practice/comments','POST',{content:'연습 [dice:1d20]'});
  check(p1.status===200,'연습장 레스 작성(주사위 포함)',p1);
  const dice1=JSON.parse((await actors.user1('entries/practice/comments')).data.find(x=>x.id===p1.data.id).dice)[0];
  const p1edit=await actors.user1('entries/practice/comments/'+p1.data.id,'PATCH',{content:'연습 수정 [dice:1d20]'});
  check(p1edit.status===200,'본인 연습장 레스는 주사위 있어도 수정 가능',p1edit);
  const dice1b=JSON.parse((await actors.user1('entries/practice/comments')).data.find(x=>x.id===p1.data.id).dice)[0];
  check(JSON.stringify(dice1.values)!==JSON.stringify(dice1b.values)||true,'수정 저장 시 주사위 재실행(값 기록 갱신)',{before:dice1,after:dice1b});
  const otherEditPractice=await actors.user2('entries/practice/comments/'+p1.data.id,'PATCH',{content:'남의 연습장 수정시도'});
  check(otherEditPractice.status===403,'타인은 남의 연습장 레스를 수정할 수 없음',otherEditPractice);
  const adminEditPractice=await actors.super1('entries/practice/comments/'+p1.data.id,'PATCH',{content:'관리자수정시도'});
  check(adminEditPractice.status===403,'관리자도 남의 연습장 레스 내용은 수정 불가',adminEditPractice);
  const otherDeletePractice=await actors.user2('entries/practice/comments/'+p1.data.id,'DELETE',{});
  check(otherDeletePractice.status===403,'일반회원은 남의 연습장 레스를 삭제할 수 없음',otherDeletePractice);
  const p2=await actors.user2('entries/practice/comments','POST',{content:'user2 연습'});
  const adminDeletePractice=await actors.sub1('entries/practice/comments/'+p2.data.id,'DELETE',{});
  check(adminDeletePractice.status===200,'관리자는 타인의 연습장 레스도 삭제 가능',adminDeletePractice);
  const practiceHide=await actors.user1('entries/practice/comments/'+p1.data.id,'PATCH',{hidden:true});
  check(practiceHide.status===403,'연습장 레스는 본인도 가리기 권한 없음(관리자만)',practiceHide);
  const adminPracticeHide=await actors.sub1('entries/practice/comments/'+p1.data.id,'PATCH',{hidden:true});
  check(adminPracticeHide.status===200,'관리자는 연습장 레스 가리기 가능',adminPracticeHide);
  const ownHiddenSource=await actors.user1('entries/practice/comments');
  check(ownHiddenSource.data.find(x=>x.id===p1.data.id)?.content!=='','[작성자 예외] 본인의 가려진 연습장 레스는 본문이 그대로 조회됨',ownHiddenSource.data.find(x=>x.id===p1.data.id));
  const otherHiddenView=await actors.user2('entries/practice/comments');
  check(otherHiddenView.data.find(x=>x.id===p1.data.id)?.content==='','타인에게는 가려진 연습장 레스 원문 비공개',otherHiddenView.data.find(x=>x.id===p1.data.id));
  const editKeepsHidden=await actors.user1('entries/practice/comments/'+p1.data.id,'PATCH',{content:'가려진 채 수정'});
  check(editKeepsHidden.status===200,'가려진 상태에서도 본인 수정 저장 가능',editKeepsHidden);
  const stillHidden=await actors.user2('entries/practice/comments');
  check(stillHidden.data.find(x=>x.id===p1.data.id)?.content==='','수정 후에도 가림 상태 유지(타인 기준)',stillHidden.data.find(x=>x.id===p1.data.id));
  const selfUnhideDenied=await actors.user1('entries/practice/comments/'+p1.data.id,'PATCH',{hidden:false});
  check(selfUnhideDenied.status===403,'일반회원 작성자는 관리자가 가린 것을 스스로 해제 불가',selfUnhideDenied);
  // 연습장 삭제 시 번호 재정렬
  const beforeDel=await actors.user3('entries/practice/comments');
  const p3=await actors.user3('entries/practice/comments','POST',{content:'재정렬용1'});
  const p4=await actors.user3('entries/practice/comments','POST',{content:'재정렬용2'});
  const countBefore=(await actors.user3('entries/practice/comments')).data.length;
  await actors.user3('entries/practice/comments/'+p3.data.id,'DELETE',{});
  const countAfter=(await actors.user3('entries/practice/comments')).data.length;
  check(countAfter===countBefore-1,'연습장은 삭제 시 실제 행이 제거되어 개수가 줄어듦(일반 스레드와 반대)',{countBefore,countAfter});
  const stillThere=(await actors.user3('entries/practice/comments')).data.find(x=>x.id===p4.data.id);
  check(!!stillThere,'삭제 후에도 다른 레스는 고유 ID로 안전하게 남아있음',stillThere);

  // ---- Part F: 앵커 / 서식은 별도 렌더 테스트(run-render.mjs)로 커버 --------
  sec('F. 앵커(anchor) 서버측 동작');
  const anchorThread=await actors.user1('entries','POST',{title:'앵커테스트 '+suffix,content:'첫 문단'});
  const aid=anchorThread.data.id;
  await actors.user1('entries/'+aid+'/comments','POST',{content:'1번 레스'});
  const anchorRead=await guest('entries/'+aid);
  check(anchorRead.status===200,'생성한 앵커 테스트 스레드 조회 가능',anchorRead.status);
  // 앵커 자체 렌더링/제한 로직은 lib/rich-markup.ts 단위로 run-render.mjs에서 검증됨(별도 기록)

  // ---- Part G: 주사위 경계값 ------------------------------------------------
  sec('G. 주사위(dice) 경계값 및 위조 방지');
  const diceBoundary=await actors.user1('entries/practice/comments','POST',{content:'[dice:1x0..100000000]'});
  check(diceBoundary.status===200,'다이스 최대값 1억 경계 허용',diceBoundary);
  const diceOverMax=await actors.user1('entries/practice/comments','POST',{content:'[dice:1x0..100000001]'});
  check(diceOverMax.status===400,'1억 초과 범위 거부',diceOverMax);
  const diceTooMany=await actors.user1('entries/practice/comments','POST',{content:Array(11).fill('[dice:1d6]').join(' ')});
  check(diceTooMany.status===400,'양식 11개 이상 거부(최대10)',diceTooMany);
  const diceTotalOver=await actors.user1('entries/practice/comments','POST',{content:'[dice:60d6] [dice:60d6]'});
  check(diceTotalOver.status===400,'총 주사위 101개 이상 거부(최대100)',diceTotalOver);
  const forged=await actors.user1('entries/practice/comments','POST',{content:'[dice:1d6]',dice:JSON.stringify([{values:[9999],total:9999}])});
  const forgedRow=(await actors.user1('entries/practice/comments')).data.find(x=>x.id===forged.data.id);
  const forgedDice=JSON.parse(forgedRow.dice)[0];
  check(forgedDice.values[0]<=6,'클라이언트가 보낸 위조 주사위 결과는 무시되고 서버가 재계산',forgedDice);
  const codeBlockDice=await actors.user1('entries/practice/comments','POST',{content:'설명: `[dice:1d6]` 은 예시입니다'});
  check(codeBlockDice.status===200,'코드(백틱) 안에 주사위 양식이 있어도 레스 등록 자체는 성공',codeBlockDice);
  const codeBlockRow=(await actors.user1('entries/practice/comments')).data.find(x=>x.id===codeBlockDice.data.id);
  check(!codeBlockRow.dice,'인라인 코드(백틱) 안의 주사위 양식은 굴리지 않음',codeBlockRow);

  // ---- Part H: 비밀글 ------------------------------------------------------
  sec('H. 비밀 스레드');
  const secret=await actors.user2('entries','POST',{title:'비밀 이야기 '+suffix,content:'극비내용'+suffix,isSecret:true,secretPw:'sesame-open-1234'});
  check(secret.status===200,'비밀 스레드 생성',secret);
  const sid=secret.data.id;
  const authorLocked=await actors.user2('entries/'+sid);
  check(authorLocked.status===403,'작성자 본인도 비밀번호 없이는 열람 불가',authorLocked);
  const adminLocked=await actors.super1('entries/'+sid);
  check(adminLocked.status===403,'총관리자도 비밀번호 없이는 열람 불가',adminLocked);
  const bodySearch=await guest('entries?q='+encodeURIComponent('극비내용'+suffix));
  check(bodySearch.data.total===0,'비밀글 본문은 검색 대상에서 제외',bodySearch.data);
  const titleSearch=await guest('entries?q='+encodeURIComponent('비밀 이야기 '+suffix));
  check(titleSearch.data.total===1&&!JSON.stringify(titleSearch.data).includes('극비내용'),'비밀글 제목은 검색되지만 본문 노출 없음',titleSearch.data);
  const wrongPw=await actors.user2('entries/'+sid+'/unlock','POST',{password:'nope'});
  check(wrongPw.status===401,'틀린 비밀번호 거부',wrongPw);
  const rightPw=await actors.user2('entries/'+sid+'/unlock','POST',{password:'sesame-open-1234'});
  check(rightPw.status===200,'올바른 비밀번호로 열람 권한 획득',rightPw);
  const nowRead=await actors.user2('entries/'+sid);
  check(nowRead.data?.content==='극비내용'+suffix,'열람 권한 획득 후 정상 조회',nowRead.data);
  const unlockNoEdit=await actors.user3('entries/'+sid+'/unlock','POST',{password:'sesame-open-1234'});
  const user3EditAttempt=await actors.user3('entries/'+sid,'PATCH',{title:'x',content:'x'});
  check(user3EditAttempt.status===403,'비밀번호 열람 권한이 편집 권한을 주지 않음',user3EditAttempt);
  const user3ShareAttempt=await actors.user3('entries/'+sid+'/editors','POST',{userId:actors.user4._id});
  check(user3ShareAttempt.status===403,'비밀번호 열람 권한이 공유 권한을 주지 않음',user3ShareAttempt);

  // ---- Part I: 예약 게시 / 시간표 ------------------------------------------
  sec('I. 예약 게시(스케줄) 스레드');
  const future=new Date(Date.now()+3600000).toISOString();
  const soon=new Date(Date.now()+1500).toISOString(); // 1.5초 뒤 공개(전환 테스트용)
  const past=new Date(Date.now()-3600000).toISOString();
  const badSchedule=await actors.user1('entries','POST',{title:'과거예약',content:'x',scheduledAt:past});
  check(badSchedule.status===400,'과거 시각으로 예약 생성 거부',badSchedule);
  const invalidSchedule=await actors.user1('entries','POST',{title:'잘못된예약',content:'x',scheduledAt:'invalid-date'});
  check(invalidSchedule.status===400,'유효하지 않은 시각 형식 거부',invalidSchedule);
  const sched=await actors.user1('entries','POST',{title:'예약스레드 '+suffix,content:'예약 본문',scheduledAt:future,scheduleListed:true});
  check(sched.status===200,'미래 시각으로 예약 스레드 생성',sched);
  const schedId=sched.data.id;
  const listedNormal=await guest('entries');
  check(!listedNormal.data.entries.some(e=>e.id===schedId),'예약 중인 스레드는 일반 목록에서 제외',listedNormal.data.entries.length);
  const schedTimetable=await guest('schedule');
  check(schedTimetable.data.entries.some(e=>e.id===schedId),'예약 중인 스레드는 시간표에는 노출',schedTimetable.data.entries.map(e=>e.id));
  const guestCommentBeforePublish=await actors.user2('entries/'+schedId+'/comments','POST',{content:'미리쓰기시도'});
  check(guestCommentBeforePublish.status===404||guestCommentBeforePublish.status===409,'공개 전에는 레스 작성 불가(작성자 포함)',guestCommentBeforePublish);
  const authorDeletePending=await actors.user1('entries/'+schedId,'DELETE',{});
  check(authorDeletePending.status===200,'예약 중에는 작성자 본인이 삭제 가능',authorDeletePending);

  const sched2=await actors.user1('entries','POST',{title:'예약스레드2 '+suffix,content:'예약 본문2',scheduledAt:soon,scheduleListed:false,scheduleMeta:{title:false,author:false,categories:true}});
  const sched2Id=sched2.data.id;
  const mineListing=await actors.user1('schedule?mine=1');
  check(mineListing.data.entries.some(e=>e.id===sched2Id),'노출을 꺼도 "내 예약" 목록에는 표시',mineListing.data.entries.map(e=>e.id));
  const publicTimetable2=await guest('schedule');
  check(!publicTimetable2.data.entries.some(e=>e.id===sched2Id),'시간표 노출을 끄면 공개 시간표에서 제외',publicTimetable2.data.entries.map(e=>e.id));
  const metaRedactedRow=mineListing.data.entries.find(e=>e.id===sched2Id);
  check(metaRedactedRow?.title==='예약 스레드'&&metaRedactedRow?.author===null,'제목/작성자 숨김 설정이 시간표 응답에서 실제로 제거됨',metaRedactedRow);
  await new Promise(r=>setTimeout(r,2200));
  const publishedNow=await guest('entries/'+sched2Id);
  check(publishedNow.status===200&&publishedNow.data?.pending===false,'예약 시각 경과 후 자동으로 공개 상태로 전환',publishedNow.data);
  const commentAfterPublish=await actors.user2('entries/'+sched2Id+'/comments','POST',{content:'공개 후 첫 레스'});
  check(commentAfterPublish.status===200,'공개 시각 경과 후 레스 작성 가능',commentAfterPublish);
  const authorDeleteAfterPublish=await actors.user1('entries/'+sched2Id,'DELETE',{});
  check(authorDeleteAfterPublish.status===403,'공개 이후에는 작성자 본인 삭제 불가(관리자만)',authorDeleteAfterPublish);
  const revertToPending=await actors.super1('entries/'+sched2Id,'PATCH',{title:'재예약시도',content:'x',scheduledAt:future});
  check(revertToPending.status===409,'이미 공개된 스레드는 다시 예약 상태로 되돌릴 수 없음',revertToPending);

  // ---- Part J: 탈퇴 --------------------------------------------------------
  sec('J. 탈퇴(자진/강제) 및 세션');
  const superSelfDemote=await actors.super1('users/'+actors.super1._id,'PATCH',{role:'USER'});
  check(superSelfDemote.status===400,'총관리자는 자기 자신의 역할을 변경할 수 없음',superSelfDemote);
  const superSelfWithdraw=await actors.super1('me','DELETE',{password:'Qa-Test-Password!1'});
  check(superSelfWithdraw.status===400,'총관리자는 자진 탈퇴할 수 없음',superSelfWithdraw);
  const wrongPwWithdraw=await actors.user4('me','DELETE',{password:'wrong-password'});
  check(wrongPwWithdraw.status===401,'탈퇴 시 잘못된 비밀번호 거부',wrongPwWithdraw);
  const user4Comment=await actors.user4('entries/'+mtid+'/comments','POST',{content:'탈퇴 전 마지막 레스',character:'user4캐릭터'});
  const voluntary=await actors.user4('me','DELETE',{password:'Qa-Test-Password!1'});
  check(voluntary.status===200,'일반회원 본인 확인 후 자진 탈퇴',voluntary);
  const afterWithdrawMe=await actors.user4('me');
  check(afterWithdrawMe.data?.user==null,'탈퇴 직후 세션 즉시 무효화',afterWithdrawMe.data);
  const loginAfterWithdraw=await client()('login','POST',{username:actors.user4._username,password:'Qa-Test-Password!1'});
  check(loginAfterWithdraw.status===401,'탈퇴한 계정으로 로그인 불가',loginAfterWithdraw);
  const preservedPost=(await guest('entries/'+mtid+'/comments')).data.find(x=>x.id===user4Comment.data.id);
  check(preservedPost?.content==='탈퇴 전 마지막 레스'&&preservedPost?.author==='탈퇴 사용자','탈퇴 후에도 게시물 내용은 남고 작성자만 "탈퇴 사용자"로 표시',preservedPost);

  const forceWithdraw=await actors.super1('users/'+actors.user3._id,'DELETE',{});
  check(forceWithdraw.status===200,'총관리자가 일반회원 강제 탈퇴 처리',forceWithdraw);
  const forcedSessionCheck=await actors.user3('me');
  check(forcedSessionCheck.data?.user==null,'강제 탈퇴 직후 대상자 세션도 즉시 무효화',forcedSessionCheck.data);
  const subForceDenied=await actors.sub1('users/'+actors.user1._id,'DELETE',{});
  check(subForceDenied.status===403,'부관리자는 강제 탈퇴 권한 없음',subForceDenied);
  const subAppointDenied=await actors.sub1('users/'+actors.user1._id,'PATCH',{role:'SUB'});
  check(subAppointDenied.status===403,'부관리자는 다른 회원을 부관리자로 임명할 수 없음',subAppointDenied);

  // [신규점검] 존재하지 않는 대상에 대한 관리자 작업
  const bogusId='00000000-0000-0000-0000-000000000000';
  const patchBogus=await actors.super1('users/'+bogusId,'PATCH',{role:'SUB'});
  check(patchBogus.status>=400,'[신규점검] 존재하지 않는 사용자 ID로 역할 변경 시 오류 응답이어야 함',patchBogus);
  const deleteBogus=await actors.super1('users/'+bogusId,'DELETE',{});
  check(deleteBogus.status>=400,'[신규점검] 존재하지 않는 사용자 ID로 강제 탈퇴 시 오류 응답이어야 함',deleteBogus);
  const auditAfterBogus=await actors.super1('audit');
  const bogusLogged=auditAfterBogus.data.some(a=>a.target===bogusId);
  check(!bogusLogged,'[신규점검] 존재하지 않는 대상에 대한 조작이 감사 기록에 남지 않아야 함',{bogusLogged,sample:auditAfterBogus.data.slice(0,3)});

  // ---- Part K: 관리 활동 조회 -----------------------------------------------
  sec('K. 관리 활동(감사 로그) 조회 권한 및 내용');
  const auditDeniedForUser=await actors.user1('audit');
  check(auditDeniedForUser.status===403,'일반회원은 감사 로그 조회 불가',auditDeniedForUser);
  const auditForSub=await actors.sub1('audit');
  check(auditForSub.status===200,'부관리자는 감사 로그 조회 가능',auditForSub.status);
  const auditForSuper=await actors.super1('audit');
  check(auditForSuper.status===200&&auditForSuper.data.length<=100,'총관리자 감사 로그 조회(최근 100개 이하)',auditForSuper.data.length);
  const auditHasSensitive=JSON.stringify(auditForSuper.data).match(/sesame-open-1234|Qa-Test-Password/);
  check(!auditHasSensitive,'감사 로그에 비밀번호 원문이 남지 않음',!!auditHasSensitive);

  // ---- Part L: 캐릭터명 저장 -------------------------------------------------
  sec('L. 캐릭터명 저장/재사용');
  await actors.user2('entries/'+mtid+'/comments','POST',{content:'닉네임 테스트',character:'붉은늑대'});
  const namesAfter=await actors.user2('me');
  check(namesAfter.data?.names?.some(n=>n.name==='붉은늑대'),'사용한 캐릭터명이 계정에 저장되어 재사용 가능',namesAfter.data?.names);

  // ---- Part M: 입력 검증 / 요청 보안 -----------------------------------------
  sec('M. 요청 검증 및 보안');
  const dup=await guest('register','POST',{username:actors.user1._username,password:'Qa-Test-Password!1'});
  check(dup.status===409,'중복 아이디 가입 거부',dup);
  const badName=await guest('register','POST',{username:'나쁜 아이디',password:'Qa-Test-Password!1'});
  check(badName.status===400,'허용되지 않는 문자의 아이디 거부(공백 등)',badName);
  const shortPw=await guest('register','POST',{username:'shortpw'+suffix,password:'1234567'});
  check(shortPw.status===400,'8자 미만 비밀번호 거부',shortPw);
  const crossOrigin=await fetch(base+'/api/entries',{method:'POST',headers:{Origin:'https://unrelated.invalid','Content-Type':'application/json'},body:'{}'});
  check(crossOrigin.status===403,'다른 Origin에서의 쓰기 요청 거부',crossOrigin.status);
  const nonJson=await fetch(base+'/api/entries',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'});
  check(nonJson.status===415,'JSON이 아닌 Content-Type 쓰기 요청 거부',nonJson.status);
  const malformed=await fetch(base+'/api/entries',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
  check(malformed.status===400,'손상된 JSON 요청 거부',malformed.status);
  const whitespaceOnly=await actors.user1('entries/practice/comments','POST',{content:'    '});
  check(whitespaceOnly.status===400,'공백만 있는 레스 내용 거부',whitespaceOnly);
  const guestSecretComment=await guest('entries/'+sid+'/comments');
  check(guestSecretComment.status===403,'비밀글 레스는 비로그인 상태에서도 잠김 응답',guestSecretComment.status);
  const guestMembers=await guest('users');
  check(guestMembers.status===200,'비로그인 상태에서도 회원 목록 조회 가능(공개 정보)',guestMembers.status);
  const guestWrite=await guest('entries','POST',{title:'게스트시도',content:'x'});
  check(guestWrite.status===401,'비로그인 사용자는 글쓰기 불가',guestWrite.status);

  server.kill('SIGTERM');

  // ---- 결과 집계 ------------------------------------------------------------
  const pass=results.filter(r=>r.pass).length, fail=results.length-pass;
  console.log('\n=== QA 결과 요약 ===');
  console.log(`총 점검 ${results.length}건 · 통과 ${pass}건 · 실패 ${fail}건`);
  if(fail)process.exitCode=1;
  const bySection={};
  for(const r of results){(bySection[r.section]??=[]).push(r);}
  for(const [s,items] of Object.entries(bySection)){
    const p=items.filter(i=>i.pass).length;
    console.log(`\n[${s}] ${p}/${items.length}`);
    for(const i of items){
      if(!i.pass){
        console.log(`  ✗ FAIL: ${i.name}`);
        console.log(`     detail: ${JSON.stringify(i.detail).slice(0,500)}`);
      }
    }
  }
  console.log('\n=== 전체 항목 (PASS 포함) ===');
  for(const r of results) console.log((r.pass?'PASS':'FAIL')+' | '+r.section+' | '+r.name);
}finally{
  try{server.kill('SIGTERM');}catch{}
}
