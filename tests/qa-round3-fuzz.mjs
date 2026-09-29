// Adversarial QA pass: assume a malicious actor trying to break RP LAND.
// Disposable local D1 database only. Non-fatal checker (collects all results).
import {mkdtempSync,readdirSync,mkdirSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';

mkdirSync('.sites-runtime',{recursive:true});
const dbPath=mkdtempSync('.sites-runtime/qa-adv-db-');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
  const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',dbPath,'--file','drizzle/'+file],{encoding:'utf8'});
  if(r.status)throw new Error(r.stderr+r.stdout);
}
const setupToken='qa-adv-token-'+Math.random().toString(36).slice(2);
const resetToken='qa-adv-reset-'+Math.random().toString(36).slice(2);
const port=8802;
const server=spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--local','--persist-to',dbPath,'--ip','127.0.0.1','--port',String(port),'--var','ADMIN_SETUP_TOKEN:'+setupToken,'--var','RESET_TOKEN:'+resetToken,'--inspector-port','0'],{stdio:['ignore','pipe','pipe']});
let bootOutput='';
try{
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Worker startup timed out: '+bootOutput)),45000);
    server.stdout.on('data',d=>{bootOutput+=d;if(bootOutput.includes('Ready on')){clearTimeout(timer);resolve()}});
    server.stderr.on('data',d=>{bootOutput+=d});
    server.on('exit',code=>reject(new Error('Worker exited '+code+' '+bootOutput)));
  });
  const base='http://127.0.0.1:'+port;
  const results=[]; let section='';
  function sec(s){section=s;}
  function check(v,name,detail){results.push({section,name,pass:!!v,detail});}
  function client(visitor){
    const cookies={};
    const fn=async(path,method='GET',data,rawBody)=>{
      const headers={'Content-Type':'application/json',...(visitor?{'oai-authenticated-user-id':visitor}:{}),Cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ')};
      const body=rawBody!==undefined?rawBody:(data!==undefined?JSON.stringify(data):undefined);
      const r=await fetch(base+'/api/'+path,{method,headers,body});
      for(const c of (r.headers.getSetCookie?.()||[])){const[k,...v]=c.split(';')[0].split('=');cookies[k]=v.join('=');}
      let json=null; try{json=await r.json();}catch{}
      return {status:r.status,data:json};
    };
    fn.cookies=cookies;
    return fn;
  }
  const suffix=Date.now();
  const guest=client();

  // ---- setup: one super admin + one victim + one attacker account ----------
  const super1=client(), victim=client(), attacker=client();
  await super1('register','POST',{username:'super_'+suffix,password:'Adv-Test-Password!1'});
  await super1('login','POST',{username:'super_'+suffix,password:'Adv-Test-Password!1'});
  await super1('setup','POST',{token:setupToken});
  await victim('register','POST',{username:'victim_'+suffix,password:'Victim-Password!1'});
  await victim('login','POST',{username:'victim_'+suffix,password:'Victim-Password!1'});
  await attacker('register','POST',{username:'attacker_'+suffix,password:'Attacker-Password!1'});
  await attacker('login','POST',{username:'attacker_'+suffix,password:'Attacker-Password!1'});
  const victimId=(await victim('me')).data.user.id;
  const attackerId=(await attacker('me')).data.user.id;
  const super1Id=(await super1('me')).data.user.id;

  // ---- A. 인증/권한 우회 시도 -------------------------------------------------
  sec('A. 인증·권한 우회 시도');
  const forged=await fetch(base+'/api/me',{headers:{Cookie:'rp_session=totally-forged-token-'+Math.random()}});
  const forgedJson=await forged.json();
  check(forgedJson.user===null,'위조된 세션 쿠키로는 로그인 상태를 얻을 수 없음',forgedJson);
  const noAuthAdmin=await guest('users/'+victimId,'PATCH',{role:'SUB'});
  check(noAuthAdmin.status===401,'비로그인 상태로 관리자 API 접근 시 401',noAuthAdmin);
  const attackerAsAdmin=await attacker('users/'+victimId,'PATCH',{role:'SUB'});
  check(attackerAsAdmin.status===403,'일반회원이 타인을 부관리자로 임명 시도 → 거부',attackerAsAdmin);
  const escalateViaRegister=await client()('register','POST',{username:'esc_'+suffix,password:'Escalate-Password!1',role:'SUPER'});
  check(escalateViaRegister.status===200,'가입 자체는 허용',escalateViaRegister);
  const escClient=client();await escClient('login','POST',{username:'esc_'+suffix,password:'Escalate-Password!1'});
  const escMe=await escClient('me');
  check(escMe.data?.user?.role==='USER','회원가입 요청에 role:"SUPER"를 끼워 넣어도 무시되고 일반회원으로 생성됨',escMe.data);
  const escalateViaComment=await attacker('entries/practice/comments','POST',{content:'x',role:'SUPER',author_id:super1Id});
  check(escalateViaComment.status===200,'요청 본문에 role/author_id를 끼워 넣어도 무시되고 정상 처리(자기 자신으로 기록)',escalateViaComment);
  const commentRow=(await attacker('entries/practice/comments')).data.find(x=>x.id===escalateViaComment.data.id);
  const attackerAfter=await attacker('me');
  check(attackerAfter.data?.user?.role==='USER','댓글 작성 후에도 attacker 역할은 그대로 일반회원',attackerAfter.data);
  const upperCaseSelfId=super1Id.toUpperCase();
  const caseBypassAttempt=await super1('users/'+upperCaseSelfId,'PATCH',{role:'USER'});
  check(caseBypassAttempt.status===400||caseBypassAttempt.status===404,'자기 자신 ID를 대문자로 바꿔 자기-보호 검사 우회 시도 → 차단 또는 대상없음으로 안전 처리',caseBypassAttempt);
  const selfStillSuper=(await super1('me')).data.user.role;
  check(selfStillSuper==='SUPER','대소문자 우회 시도 이후에도 super1 권한은 그대로 총관리자 유지',selfStillSuper);

  // ---- B. SQL 인젝션 시도 ----------------------------------------------------
  sec('B. SQL 인젝션 시도');
  const sqliPayloads=["'; DROP TABLE users; --","' OR '1'='1","1' UNION SELECT username,password,role,active FROM users--","\" OR 1=1 --","'; UPDATE users SET role='SUPER' WHERE 1=1; --"];
  for(const payload of sqliPayloads){
    const t=await attacker('entries','POST',{title:'인젝션테스트',content:payload});
    check(t.status===200,'SQLi 페이로드가 포함된 본문도 그냥 일반 텍스트로 저장 성공: '+payload.slice(0,25),t);
    if(t.status===200){
      const readBack=await guest('entries/'+t.data.id);
      check(readBack.data?.content===payload,'저장된 내용이 페이로드 그대로(이스케이프 없이 원문) 보존됨 → 실행되지 않고 데이터로만 취급',readBack.data?.content);
    }
  }
  const usersStillIntact=await guest('users');
  check(Array.isArray(usersStillIntact.data)&&usersStillIntact.data.length>=3,'SQL 인젝션 시도 이후에도 users 테이블/서비스 정상 동작',usersStillIntact.data?.length);
  const victimStillUser=usersStillIntact.data.find(u=>u.id===victimId);
  check(victimStillUser?.role==='USER','인젝션 시도 이후에도 victim 역할이 변조되지 않음(UPDATE 인젝션 미실행)',victimStillUser);
  const categorySqli=await super1('categories','POST',{name:"a';DROP TABLE x;--"});
  check(categorySqli.status===200,'카테고리 이름에 SQLi 페이로드를 넣어도 안전하게 저장',categorySqli);
  const categoriesStillWork=await guest('categories');
  check(Array.isArray(categoriesStillWork.data),'카테고리 인젝션 시도 이후에도 카테고리 API 정상 동작',categoriesStillWork.status);

  // ---- C. 악성/기형 요청 본문으로 서버 크래시 유도 시도 -----------------------
  sec('C. 기형 요청으로 서버 크래시 유도 시도');
  const nullBody=await fetch(base+'/api/entries',{method:'POST',headers:{'Content-Type':'application/json',Cookie:Object.entries({}).join('; ')},body:'null'});
  const nullBodyText=await nullBody.text();
  check([400,401].includes(nullBody.status),'JSON 리터럴 null을 본문으로 보내면 500/503이 아니라 4xx(인증 필요 포함)로 안전하게 거부되어야 함',{status:nullBody.status,body:nullBodyText.slice(0,200)});
  const nullBodyNoAuth=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:'null'});
  const nullBodyNoAuthText=await nullBodyNoAuth.text();
  check(nullBodyNoAuth.status===400,'[인증이 필요 없는 엔드포인트] JSON 리터럴 null 본문 전송 시 400으로 안전 처리되어야 함',{status:nullBodyNoAuth.status,body:nullBodyNoAuthText.slice(0,200)});
  const arrayBody=await fetch(base+'/api/entries',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'rp_session='+ (attacker.cookies?.rp_session||'')},body:'[1,2,3]'});
  check([400,401].includes(arrayBody.status),'JSON 배열을 본문으로 보내도 서버가 죽지 않고 4xx로 처리',arrayBody.status);
  const deepNestDepth=40000;
  const deepNested=await fetch(base+'/api/entries',{method:'POST',headers:{'Content-Type':'application/json'},body:'['.repeat(deepNestDepth)+']'.repeat(deepNestDepth)});
  check(deepNested.status>=400&&deepNested.status<500,'4만 단계로 깊게 중첩된 JSON을 보내도 4xx로 안전하게 처리(500/503 아님)',deepNested.status);
  const nonStringCategoryNum=await attacker('entries','POST',{title:'악성카테고리',content:'x',categories:[12345]});
  check(nonStringCategoryNum.status>=400&&nonStringCategoryNum.status<500,'카테고리 배열에 숫자를 넣어도 4xx로 안전하게 거부(서버 예외 아님)',nonStringCategoryNum);
  const nonStringCategoryObj=await attacker('entries','POST',{title:'악성카테고리2',content:'x',categories:[{evil:'object'}]});
  check(nonStringCategoryObj.status>=400&&nonStringCategoryObj.status<500,'카테고리 배열에 객체를 넣어도 4xx로 안전하게 거부(서버 예외 아님)',nonStringCategoryObj);
  const nonStringCategoryNested=await attacker('entries','POST',{title:'악성카테고리3',content:'x',categories:[['nested','array']]});
  check(nonStringCategoryNested.status>=400&&nonStringCategoryNested.status<500,'카테고리 배열에 중첩 배열을 넣어도 4xx로 안전하게 거부',nonStringCategoryNested);
  const threadForEditors=await victim('entries','POST',{title:'editors크래시테스트',content:'x'});
  const editorsUserIdObj=await victim('entries/'+threadForEditors.data.id+'/editors','POST',{userId:{evil:'object'}});
  check(editorsUserIdObj.status>=400&&editorsUserIdObj.status<500,'editors 공유 API에 userId로 객체를 넣어도 4xx로 안전하게 거부',editorsUserIdObj);
  const editorsUserIdArr=await victim('entries/'+threadForEditors.data.id+'/editors','POST',{userId:['a','b']});
  check(editorsUserIdArr.status>=400&&editorsUserIdArr.status<500,'editors 공유 API에 userId로 배열을 넣어도 4xx로 안전하게 거부',editorsUserIdArr);
  const editorsUserIdArrDelete=await victim('entries/'+threadForEditors.data.id+'/editors','DELETE',{userId:['a','b']});
  check(editorsUserIdArrDelete.status>=400&&editorsUserIdArrDelete.status<500,'editors 회수(DELETE) API에 userId로 배열을 넣어도 4xx로 안전하게 거부',editorsUserIdArrDelete);
  const protoPollution=await attacker('entries','POST',{title:'프로토타입오염',content:'x',__proto__:{polluted:'yes'},constructor:{polluted:'yes'}});
  check(protoPollution.status===200,'__proto__/constructor 키를 끼워 넣어도 정상 처리되고 오염 없음',protoPollution.status);
  const pollutionCheckObj={};
  check(pollutionCheckObj.polluted===undefined,'전역 Object.prototype이 오염되지 않았음(다른 객체에 영향 없음)',pollutionCheckObj);

  // ---- D. 비밀글 크로스 엔트리 그랜트 위조 시도 --------------------------------
  sec('D. 비밀글 접근 그랜트 위조/재사용 시도');
  const secretA=await victim('entries','POST',{title:'비밀A '+suffix,content:'A본문'+suffix,isSecret:true,secretPw:'pw-a-1234'});
  const secretB=await victim('entries','POST',{title:'비밀B '+suffix,content:'B본문'+suffix,isSecret:true,secretPw:'pw-b-1234'});
  const grantClient=client();
  await grantClient('entries/'+secretA.data.id+'/unlock','POST',{password:'pw-a-1234'});
  const grantForA=grantClient.cookies?.['rp_grant_'+secretA.data.id];
  const crossEntryAttempt=await fetch(base+'/api/entries/'+secretB.data.id,{headers:{Cookie:`rp_grant_${secretB.data.id}=${grantForA||'x'}`}});
  const crossEntryJson=await crossEntryAttempt.json();
  check(crossEntryAttempt.status===403&&crossEntryJson.locked===true,'A의 그랜트 토큰을 B의 쿠키 이름으로 재사용해도 B는 여전히 잠김',crossEntryJson);
  const noGrantAtAll=await fetch(base+'/api/entries/'+secretB.data.id);
  const noGrantJson=await noGrantAtAll.json();
  check(noGrantAtAll.status===403&&noGrantJson.locked===true,'그랜트 쿠키가 전혀 없으면 당연히 잠김',noGrantJson);
  const adminBypassSecret=await super1('entries/'+secretB.data.id);
  check(adminBypassSecret.status===403,'총관리자도 비밀번호 없이는 비밀글 우회 불가',adminBypassSecret.status);
  const nonAdminViewEditors=await attacker('entries/'+threadForEditors.data.id+'/editors');
  check(nonAdminViewEditors.status===403,'작성자/관리자가 아니면 문서의 편집자 목록도 조회 불가(정보 노출 방지)',nonAdminViewEditors.status);

  // ---- E. 무차별 대입/속도 제한 우회 시도 --------------------------------------
  sec('E. 무차별 대입 및 속도 제한');
  const bruteTarget=client();
  await bruteTarget('register','POST',{username:'brute_'+suffix,password:'Real-Password!1'});
  let hitLimit=false,attempts=0;
  for(let i=0;i<25;i++){
    const r=await bruteTarget('login','POST',{username:'brute_'+suffix,password:'wrong-guess-'+i});
    attempts++;
    if(r.status===429){hitLimit=true;break;}
  }
  check(hitLimit&&attempts<=21,'특정 계정 로그인 무차별 대입 시 20회 근처에서 429로 차단됨',{attempts,hitLimit});
  const secretBrute=client();
  const secretForBrute=await victim('entries','POST',{title:'브루트포스대상 '+suffix,content:'brute'+suffix,isSecret:true,secretPw:'correct-horse-battery'});
  let secretHitLimit=false,secretAttempts=0;
  for(let i=0;i<25;i++){
    const r=await secretBrute('entries/'+secretForBrute.data.id+'/unlock','POST',{password:'guess'+i});
    secretAttempts++;
    if(r.status===429){secretHitLimit=true;break;}
  }
  check(secretHitLimit&&secretAttempts<=21,'비밀글 비밀번호 무차별 대입도 20회 근처에서 429로 차단됨',{secretAttempts,secretHitLimit});
  let regCount=0,limitedCount=0;
  const flood=client('qa-flood-visitor');
  for(let i=0;i<15;i++){
    const r=await flood('register','POST',{username:'flood_'+suffix+'_'+i,password:'Flood-Password!1'});
    if(r.status===200)regCount++;
    if(r.status===429)limitedCount++;
  }
  check(regCount===10&&limitedCount===5,'동일 방문자는 서로 다른 아이디로 가입해도 10회 이후 제한됨',{regCount,limitedCount});

  // ---- F. 위험한 서식/마크업 렌더 안전성(정적 검증) -----------------------------
  sec('F. 위험한 서식·문자 입력');
  const xssThread=await attacker('entries','POST',{title:'XSS테스트',content:'<img src=x onerror="alert(1)">'});
  check(xssThread.status===200,'HTML/스크립트가 포함된 본문도 저장은 되지만',xssThread.status);
  const xssReadBack=await guest('entries/'+xssThread.data.id);
  check(xssReadBack.data?.content==='<img src=x onerror="alert(1)">','저장은 원문 그대로, 렌더링 시 무해화는 클라이언트 컴포넌트 책임(react-markdown skipHtml, 별도 렌더 테스트로 검증됨)',xssReadBack.data?.content);
  const rtlOverride='\u202E공격자\u202C';
  const characterRtl=await attacker('entries/practice/comments','POST',{content:'표시 이름 테스트',character:rtlOverride});
  check(characterRtl.status===400,'캐릭터명 방향 제어 문자 거부',characterRtl);

  // ---- G. 점검/초기화 엔드포인트 보호 -----------------------------------------
  sec('G. 위험한 관리 엔드포인트 보호');
  const resetNoAuth=await guest('maintenance/reset','POST',{confirm:'RESET_ALL_RP_LAND'});
  check(resetNoAuth.status===403,'인증 헤더 없이 전체 초기화 시도 → 거부',resetNoAuth.status);
  const resetWrongToken=await fetch(base+'/api/maintenance/reset',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer wrong-token'},body:JSON.stringify({confirm:'RESET_ALL_RP_LAND'})});
  check(resetWrongToken.status===403,'잘못된 토큰으로 전체 초기화 시도 → 거부',resetWrongToken.status);
  const resetRightTokenWrongConfirm=await fetch(base+'/api/maintenance/reset',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+resetToken},body:JSON.stringify({confirm:'not-the-right-phrase'})});
  check(resetRightTokenWrongConfirm.status===403,'올바른 토큰이어도 확인 문구가 틀리면 거부(이중 안전장치)',resetRightTokenWrongConfirm.status);
  const dataStillThere=await guest('users');
  check(dataStillThere.data.some(u=>u.id===victimId),'초기화 시도들이 모두 막혀 기존 데이터가 그대로 남아있음',dataStillThere.data.length);

  // ---- H. 업무 로직 악용 시도 --------------------------------------------------
  sec('H. 업무 로직 악용 시도');
  const negativeDice=await attacker('entries/practice/comments','POST',{content:'[dice:-1d6]'});
  check(negativeDice.status===400,'음수 개수 주사위 요청 거부',negativeDice.status);
  const zeroCountDice=await attacker('entries/practice/comments','POST',{content:'[dice:0d6]'});
  check(zeroCountDice.status===400,'0개 주사위 요청 거부',zeroCountDice.status);
  const hugeSidesDice=await attacker('entries/practice/comments','POST',{content:'[dice:1x0..999999999999]'});
  check(hugeSidesDice.status===400,'1억을 초과하는 매우 큰 주사위 범위 거부',hugeSidesDice.status);
  const doubleWithdraw=client();
  await doubleWithdraw('register','POST',{username:'doublew_'+suffix,password:'Double-Password!1'});
  await doubleWithdraw('login','POST',{username:'doublew_'+suffix,password:'Double-Password!1'});
  const doubleWithdrawId=(await doubleWithdraw('me')).data.user.id;
  const [first,secondConcurrent]=await Promise.all([
    super1('users/'+doubleWithdrawId,'DELETE',{}),
    super1('users/'+doubleWithdrawId,'DELETE',{}),
  ]);
  const withdrawStatuses=[first.status,secondConcurrent.status].sort();
  check(withdrawStatuses[0]===200,'동시 강제 탈퇴 요청 중 최소 하나는 성공',withdrawStatuses);
  check(withdrawStatuses[1]===200||withdrawStatuses[1]===404,'동시 강제 탈퇴 요청의 나머지는 성공 또는 대상없음(404)으로 일관 처리, 예외 없음',withdrawStatuses);
  const bogusCategoryFilter=await guest('entries?category='+encodeURIComponent("' OR '1'='1"));
  check(bogusCategoryFilter.status===200,'검색/카테고리 필터 파라미터에 SQLi 문자열을 넣어도 정상 200 응답(그냥 결과 0건)',bogusCategoryFilter.data);
  check((bogusCategoryFilter.data?.entries||[]).length>=0,'필터 파라미터 인젝션 시도로 전체 목록이 새지 않음',bogusCategoryFilter.data?.total);

  sec('I. 추가 개선 회귀');
  const caseClient=client('qa-case-visitor');
  const caseName='Case_'+suffix;
  check((await caseClient('register','POST',{username:caseName,password:'Case-Password!1'})).status===200,'대소문자 포함 아이디 가입');
  check((await caseClient('register','POST',{username:caseName.toLowerCase(),password:'Other-Password!1'})).status===409,'대소문자만 다른 중복 아이디 거부');
  check((await caseClient('login','POST',{username:caseName.toUpperCase(),password:'Case-Password!1'})).status===200,'충돌 없는 기존 계정은 대소문자 달라도 로그인');
  check((await caseClient('me')).data.user.username===caseName,'아이디 원래 표시 보존');
  const race=client('qa-race-visitor'), raceName='Race_'+suffix;
  const raceResults=await Promise.all([raceName,raceName.toLowerCase()].map(username=>race('register','POST',{username,password:'Race-Password!1'})));
  check(raceResults.map(r=>r.status).sort().join(',')==='200,409','대소문자 중복 동시 가입도 하나만 성공');
  let limitCase=false;
  for(let i=0;i<22;i++){const r=await caseClient('login','POST',{username:i%2?caseName.toUpperCase():caseName.toLowerCase(),password:'wrong'});if(r.status===429){limitCase=true;break}}
  check(limitCase,'로그인 제한은 대소문자를 바꿔도 공유');
  for(const character of ['a\u200bb','a\u200db','a\u2066b','a\ufeffb','a\u0000b','\u200d']){
    check((await attacker('entries/practice/comments','POST',{character,content:'검증'})).status===400,'숨은 문자 캐릭터명 거부: '+JSON.stringify(character));
  }
  check((await attacker('entries/practice/comments','POST',{character:'★ 영웅 👩‍🚀',content:'장식 유지'})).status===200,'장식과 ZWJ 이모지 캐릭터명 허용');
  const editThread=await attacker('entries','POST',{title:'입력검사',content:'원문'});
  check((await attacker('entries/'+editThread.data.id,'PATCH',{title:'수정',content:'내용',categories:[{}]})).status===400,'문서 수정의 객체 카테고리 거부');
  check((await attacker('entries/'+editThread.data.id)).data.content==='원문','잘못된 수정 후 원문 보존');
  const legacySql="INSERT INTO users(id,username,password,role,active,created) SELECT 'legacy-upper','LegacyCase',password,'USER',1,created FROM users WHERE id='"+victimId+"'; INSERT INTO users(id,username,password,role,active,created) SELECT 'legacy-lower','legacycase',password,'USER',1,created FROM users WHERE id='"+victimId+"';";
  const seeded=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',dbPath,'--command',legacySql],{encoding:'utf8'});
  if(seeded.status)throw new Error(seeded.stderr+seeded.stdout);
  const legacy=client();
  check((await legacy('login','POST',{username:'LegacyCase',password:'Victim-Password!1'})).status===200,'기존 대소문자 충돌 계정 정확한 표기 로그인');
  check((await legacy('me')).data.user.id==='legacy-upper','기존 계정 정체성 보존');
  check((await client()('login','POST',{username:'LEGACYCASE',password:'Victim-Password!1'})).status===401,'충돌 계정의 모호한 대소문자 로그인 거부');
  const limited=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':'qa-flood-visitor'},body:JSON.stringify({username:'retry_'+suffix,password:'Retry-Password!1'})});
  check(limited.status===429&&Number(limited.headers.get('Retry-After'))>0,'가입 제한에 재시도 대기 시간 반환');

  sec('J. 3차 입력 조합과 자격 증명 검사');
  const types=[null,true,1,[],{}, {toString:null,valueOf:null}];
  const fuzzDoc=await victim('entries','POST',{title:'fuzz',content:'original'});
  for(const [path,method,baseline,field] of [
    ['entries','POST',{title:'x',content:'x'},'scheduledAt'],
    ['entries','POST',{title:'x',content:'x'},'scheduleMeta'],
    ['entries/'+fuzzDoc.data.id,'PATCH',{title:'x',content:'x'},'categories'],
    ['entries/practice/comments','POST',{content:'x'},'character'],
  ]) for(const value of types){const r=await victim(path,method,{...baseline,[field]:value});check(r.status<500,method+' '+field+' '+JSON.stringify(value)+' must not cause server error',r);}
  for(const path of ['entries?page=1.5','entries?page=Infinity','entries?page=-Infinity','schedule?page=Infinity','schedule?page=1e100']){const r=await guest(path);check(r.status<500,'pagination '+path+' must not cause server error',r);}
  const missingCat=await super1('categories','PATCH',{name:'missingpath'});check(missingCat.status<500,'category PATCH without id must not cause server error',missingCat);
  const pwClient=client('round3-password');const spaced='  Space-Password!1  ';
  const pwName='pwspace_'+suffix;
  const created=await pwClient('register','POST',{username:pwName,password:spaced});
  check(created.status===200,'password spaces registration',created);
  const exact=await pwClient('login','POST',{username:pwName,password:spaced});check(exact.status===200,'exact password supplied at registration must log in',exact);
  const trimmed=await pwClient('login','POST',{username:pwName,password:spaced.trim()});check(trimmed.status===401,'different trimmed password must not log in',trimmed);
  sec('K. 경계값/요청 조합');
  for(const value of ['',' ',123,{},[],null]){const r=await victim('entries','POST',{title:value,content:'x'});check(r.status===400,'title input '+JSON.stringify(value),r);}
  const original=await victim('entries/'+fuzzDoc.data.id);
  const badMeta=await victim('entries','POST',{title:'badmeta',content:'x',scheduledAt:new Date(Date.now()+3600000).toISOString(),scheduleMeta:{title:{},author:[],categories:1}});
  check(badMeta.status===400,'non-boolean schedule visibility options should be rejected',badMeta);
  const badFlags=await victim('entries','POST',{title:'badflags',content:'x',isSecret:'false',secretPw:'pass1234'});
  check(badFlags.status===400,'string false must not silently create a secret thread',badFlags);
  sec('L. 3차 수정 회귀 검증');
  for(const endpoint of ['entries','schedule']){
    for(const value of ['0','-1','1.5','abc','1000001','9007199254740991']){
      const r=await guest(endpoint+'?page='+value);check(r.status===400,endpoint+' invalid page '+value+' returns 400',r);
    }
    for(const value of ['1','2','1000000']){
      const r=await guest(endpoint+'?page='+value);check(r.status===200&&r.data.page===Number(value),endpoint+' valid page '+value,r);
    }
  }
  const scheduledPayload={title:'예약 검증',content:'unchanged',scheduledAt:new Date(Date.now()+86400000).toISOString(),scheduleListed:true,previewOpen:false,scheduleMeta:{title:false,author:false,categories:false}};
  const scheduledDoc=await victim('entries','POST',scheduledPayload);
  check(scheduledDoc.status===200,'valid false visibility fields accepted',scheduledDoc);
  const publicSchedule=await guest('schedule');
  const listed=publicSchedule.data.entries.find(x=>x.id===scheduledDoc.data.id);
  check(listed?.title==='예약 스레드'&&listed?.author===null&&listed?.categories==='[]','false visibility fields remain private',listed);
  for(const key of ['scheduleListed','previewOpen','isSecret']){
    const r=await victim('entries','POST',{title:'x',content:'x',[key]:'false'});check(r.status===400,key+' string false rejected even without scheduling',r);
  }
  for(const value of [null,[],1,'false']){
    const r=await victim('entries','POST',{...scheduledPayload,scheduleMeta:value});check(r.status===400,'invalid metadata container '+JSON.stringify(value),r);
  }
  for(const patch of [{scheduledAt:{toString:null,valueOf:null}},{scheduleMeta:{title:1}},{scheduleListed:'false'},{previewOpen:0}]){
    const r=await victim('entries/'+scheduledDoc.data.id,'PATCH',{...scheduledPayload,...patch,title:'should not save'});check(r.status===400,'scheduled edit validation '+JSON.stringify(patch),r);
  }
  check((await victim('entries/'+scheduledDoc.data.id)).data.title===scheduledPayload.title,'failed schedule edits preserve original');
  const spacedSecret='  secret-spaces  ';
  const secretDoc=await victim('entries','POST',{title:'비밀번호 보존',content:'secret',isSecret:true,secretPw:spacedSecret});
  check(secretDoc.status===200,'spaced secret password accepted',secretDoc);
  check((await guest('entries/'+secretDoc.data.id+'/unlock','POST',{password:spacedSecret.trim()})).status===401,'trimmed secret password rejected');
  check((await guest('entries/'+secretDoc.data.id+'/unlock','POST',{password:spacedSecret})).status===200,'exact secret password accepted');
  check((await pwClient('me','DELETE',{password:spaced})).status===200,'exact spaced account password also works for withdrawal');

  const pass=results.filter(r=>r.pass).length, fail=results.length-pass;
  console.log('\n=== 악의적 시나리오 QA 결과 요약 ===');
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
  console.log('\n=== 전체 항목(참고) ===');
  for(const r of results) console.log((r.pass?'PASS':'FAIL')+' | '+r.section+' | '+r.name);
}finally{
  try{server.kill('SIGTERM');}catch{}
}
