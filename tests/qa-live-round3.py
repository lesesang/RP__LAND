# Authorized QA against a disposable/test Site only. Creates, edits and deletes test content.
# Supply API URL and existing Sites bearer token at hidden prompt; never hard-code credentials.
# This script does NOT reset data or create/deactivate accounts.
import json,getpass,secrets,urllib.request,urllib.error,urllib.parse,time,sys,os,http.client,ssl,base64
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(os.environ['RP_QA_PRIVATE_DIR'])
# Directory must contain accounts.json (username, role, id, session cookies). Never commit it.
cfg=json.loads(getpass.getpass('API configuration: '));base=cfg['url']
results=[]
class Client:
 def __init__(self,cookies=None):self.cookies=cookies or {};self.conn=None
 def call(self,path,method='GET',data=None,raw=None,headers=None):
  h={'OAI-Sites-Authorization':'Bearer '+cfg['token'],'Content-Type':'application/json','Cookie':'; '.join(k+'='+v for k,v in self.cookies.items())}
  h.update(headers or {});body=raw if raw is not None else (json.dumps(data,ensure_ascii=False) if data is not None else None)
  for attempt in range(2 if method=='GET' else 1):
   try:
    if self.conn is None:
     target=urllib.parse.urlsplit(base);proxy=urllib.parse.urlsplit(os.environ.get('HTTPS_PROXY',''))
     if proxy.hostname:
      self.conn=http.client.HTTPSConnection(proxy.hostname,proxy.port or 80,timeout=20)
      ph={}
      if proxy.username:ph['Proxy-Authorization']='Basic '+base64.b64encode((urllib.parse.unquote(proxy.username)+':'+urllib.parse.unquote(proxy.password or '')).encode()).decode()
      self.conn.set_tunnel(target.hostname,443,headers=ph)
     else:self.conn=http.client.HTTPSConnection(target.hostname,timeout=20)
    self.conn.request(method,'/api/'+path,body=body.encode() if body is not None else None,headers=h)
    r=self.conn.getresponse();text=r.read().decode();status=r.status
    for k,c in r.getheaders():
     if k.lower()=='set-cookie':
      key,value=c.split(';')[0].split('=',1);self.cookies[key]=value
    try:b=json.loads(text)
    except:b={'text':text[:200]}
    return {'status':status,'body':b,'retry':r.getheader('Retry-After')}
   except Exception as e:
    if self.conn:self.conn.close()
    self.conn=None
    if method!='GET' or attempt==1:return {'status':0,'body':{'transport':str(e)}}
def check(name,r,expected=200,predicate=None):
 passed=r['status'] in (expected if isinstance(expected,list) else [expected]) and (predicate(r['body']) if predicate and r['status']==200 else True)
 results.append({'name':name,'pass':passed,'expected':expected,'actual':r['status'],'detail':r['body'] if not passed else None})
 (ROOT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
 print(('PASS' if passed else 'FINDING')+' '+name+' ['+str(r['status'])+']',flush=True)
 return r
accounts=json.loads((ROOT/'accounts.json').read_text());clients=[Client(a['cookies']) for a in accounts];admin,sub1,sub2,owner,editor,attacker,other,last=clients;guest=Client()
def create(c,title='QA 악의적 입력 검사',**kw):
 r=c.call('entries','POST',dict(title=title,content='검증용 원문',**kw));check('문서 생성: '+title,r);return r['body']['id']
thread=create(owner);victim=accounts[3]['id'];eid=accounts[4]['id']
for i,c in enumerate(clients):
 label=accounts[i]['username'];check(label+' 역할 확인',c.call('me'),predicate=lambda b:b['user']['role']==accounts[i]['role'])
 r=check(label+' 연습장 주사위 작성',c.call('entries/practice/comments','POST',{'character':'검증 '+str(i),'content':'첫 줄\n둘째 줄 [dice:3x0..100!+5]'}));cid=r['body']['id']
 check(label+' 본인 연습장 주사위 수정',c.call('entries/practice/comments/'+cid,'PATCH',{'content':'수정 [dice:1x0..0-1]'}))
 check(label+' 본인 연습장 삭제',c.call('entries/practice/comments/'+cid,'DELETE',{}))
 check(label+' 타인 문서 수정 권한',c.call('entries/'+thread,'PATCH',{'title':'권한 검사','content':'원문'}),200 if i<=3 else 403)
for c,n in [(guest,'비로그인'),(attacker,'일반회원'),(sub1,'부관리자')]:
 for method,payload in [('PATCH',{'role':'SUPER'}),('DELETE',{})]:check(n+' 회원 관리 권한 '+method,c.call('users/'+victim,method,payload),401 if c==guest else 403)
check('총관리자 자기 강등 차단',admin.call('users/'+accounts[0]['id'],'PATCH',{'role':'USER'}),400)
check('총관리자 자기 탈퇴 차단',admin.call('me','DELETE',{'password':accounts[0]['password']}),400)
check('편집 권한 부여',owner.call('entries/'+thread+'/editors','POST',{'userId':eid}))
check('공동 편집자 수정',editor.call('entries/'+thread,'PATCH',{'title':'공유 수정','content':'검증'}))
check('공동 편집자 권한 재공유 차단',editor.call('entries/'+thread+'/editors','POST',{'userId':accounts[5]['id']}),403)
check('권한 회수',owner.call('entries/'+thread+'/editors','DELETE',{'userId':eid}))
check('회수 즉시 수정 차단',editor.call('entries/'+thread,'PATCH',{'title':'금지','content':'금지'}),403)
secret=create(owner,'QA 비밀글',isSecret=True,secretPw='QA-secret-password')
for c,n in [(guest,'비로그인'),(admin,'총관리자'),(sub1,'부관리자'),(owner,'작성자')]:check(n+' 비밀번호 없는 비밀글 차단',c.call('entries/'+secret),403)
check('일반회원 비밀글 열기',attacker.call('entries/'+secret+'/unlock','POST',{'password':'QA-secret-password'}))
check('열람 권한으로 편집 불가',attacker.call('entries/'+secret,'PATCH',{'title':'침입','content':'침입'}),403)
second=create(owner,'QA 비밀글2',isSecret=True,secretPw='another-secret')
forged=Client({'rp_grant_'+second:attacker.cookies.get('rp_grant_'+secret,'')});check('다른 비밀글 토큰 재사용 차단',forged.call('entries/'+second),403)
check('위조 로그인 쿠키 차단',Client({'rp_session':'forged'}).call('entries','POST',{'title':'권한 위조','content':'실패해야 함'}),401)
r=owner.call('entries/'+thread+'/comments','POST',{'content':'가릴 내용 [dice:1d6]'});cid=r['body']['id']
check('일반 레스 본인 수정 차단',owner.call('entries/'+thread+'/comments/'+cid,'PATCH',{'content':'변조'}),403)
check('작성자 레스 가림',owner.call('entries/'+thread+'/comments/'+cid,'PATCH',{'hidden':True}))
check('가린 본문과 주사위 제거',attacker.call('entries/'+thread+'/comments'),predicate=lambda b:all(x['content']=='' and x['dice'] is None for x in b if x['id']==cid))
check('일반 작성자의 공개 스레드 삭제 차단',owner.call('entries/'+thread,'DELETE',{}),403)
from datetime import datetime,timezone,timedelta
pending=create(owner,'QA 예약 스레드',scheduledAt=(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat(),scheduleListed=False,previewOpen=False)
check('비노출 예약 외부 열람 차단',attacker.call('entries/'+pending),404)
check('예약 중 작성자도 레스 등록 차단',owner.call('entries/'+pending+'/comments','POST',{'content':'공개 전'}),409)
check('예약 작성자 삭제 허용',owner.call('entries/'+pending,'DELETE',{}))
wiki=create(owner,'QA 위키',kind='wiki')
check('위키에 레스 등록 차단',owner.call('entries/'+wiki+'/comments','POST',{'content':'위키 답글'}),400)
check('부관리자 위키 삭제',sub2.call('entries/'+wiki,'DELETE',{}))
check('위키 삭제 후 조회 차단',guest.call('entries/'+wiki),404)
# Malformed inputs and authorization boundaries; no request flooding.
for raw in ['null','[]','true','1','"text"','{']:
 check('가입 JSON '+raw,guest.call('register','POST',raw=raw),400)
for cats in [[{}],[[]],[None],[1]]:check('수정 카테고리 타입 '+repr(cats),owner.call('entries/'+thread,'PATCH',{'title':'검사','content':'검사','categories':cats}),400)
for uid in [{},[],None,1]:check('공유 대상 타입 '+repr(uid),owner.call('entries/'+thread+'/editors','POST',{'userId':uid}),400)
for path in ['entries?page=1.5','entries?page=Infinity','entries?page=abc','schedule?page=Infinity']:
 check('페이지 입력 '+path,guest.call(path),[200,400])
check('카테고리 경로 누락',admin.call('categories','PATCH',{'name':'누락 경로'}),[400,404,405])
check('잘못된 예약 객체',owner.call('entries','POST',{'title':'기형 예약','content':'검사','scheduledAt':{'toString':None,'valueOf':None}}),400)
check('잘못된 예약 표시 자료형',owner.call('entries','POST',{'title':'기형 표시','content':'검사','scheduledAt':(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat(),'scheduleMeta':{'title':{},'author':[],'categories':1}}),400)
check('문자열 false 비밀 설정',owner.call('entries','POST',{'title':'기형 비밀 설정','content':'검사','isSecret':'false','secretPw':'test-pass'}),400)
check('교차 출처 쓰기',owner.call('entries','POST',{'title':'CSRF','content':'검사'},headers={'Origin':'https://attacker.invalid'}),403)
check('text/plain 쓰기',owner.call('entries','POST',raw='{}',headers={'Content-Type':'text/plain'}),415)
check('본문 초과 제한',owner.call('entries','POST',{'title':'초과','content':'x'*150001}),413)
for ch in ['a\u200bb','a\u202eb','a\u200db','\u3164']:
 check('이름 제어문자 '+repr(ch),owner.call('entries/practice/comments','POST',{'character':ch,'content':'검사'}),400)
check('결합 이모지 허용',owner.call('entries/practice/comments','POST',{'character':'👨‍👩‍👧‍👦 검증','content':'검사'}))
for dice in ['[dice:0d6]','[dice:101d6]','[dice:1x0..100000001]','[dice:3x0..1!]','[dice:1x0..1+100000001]']:
 check('잘못된 주사위 '+dice,owner.call('entries/practice/comments','POST',{'content':dice}),400)
check('최대 경계 주사위',owner.call('entries/practice/comments','POST',{'content':'[dice:100x99999901..100000000!]'}))
r=check('위조 결과 무시',owner.call('entries/practice/comments','POST',{'content':'[dice:1x0..0]','dice':[{'total':999}],'author_id':accounts[0]['id'],'role':'SUPER'}));pcid=r['body']['id']
check('주사위 작성자 및 결과 서버 결정',owner.call('entries/practice/comments'),predicate=lambda b:any(x['id']==pcid and x['author_id']==victim and json.loads(x['dice'])[0]['total']==0 for x in b))
with ThreadPoolExecutor(max_workers=4) as pool:
 responses=list(pool.map(lambda n:Client(owner.cookies.copy()).call('entries/practice/comments','POST',{'content':'동시 등록 '+str(n)}),range(8)))
check('동시 등록 ID 충돌 없음',{'status':200,'body':responses},predicate=lambda b:all(x['status']==200 for x in b) and len({x['body']['id'] for x in b})==8)
with ThreadPoolExecutor(max_workers=2) as pool:rr=list(pool.map(lambda _:Client(owner.cookies.copy()).call('entries/practice/comments/'+pcid,'DELETE',{}),range(2)))
check('동시 삭제는 성공 또는 이미 없음',{'status':200,'body':rr},predicate=lambda b:all(x['status'] in [200,404] for x in b))
check('SQL 삽입 문자열 검색',guest.call('entries?q='+urllib.parse.quote("' OR 1=1 --")))
rate_responses=[]
for j in range(12):
 rr=guest.call('register','POST',{'username':accounts[0]['username'],'password':'Duplicate-Test!1'},headers={'oai-authenticated-user-id':'forged-platform-'+str(j)})
 rate_responses.append(rr)
 check('위조 플랫폼 헤더 중복 가입 '+str(j),rr,[409,429])
check('헤더를 바꿔도 가입 제한 작동',{'status':200,'body':rate_responses},predicate=lambda b:any(x['status']==429 for x in b) and all(x['status']==429 for x in b[next((i for i,x in enumerate(b) if x['status']==429),len(b)):]))
check('역할 구성 유지',guest.call('users'),predicate=lambda b:len(b)==8 and [sum(x['role']==r and x['active']==1 for x in b) for r in ['SUPER','SUB','USER']]==[1,2,5])
# An existing legitimate session should keep working after failed auth tests.
check('테스트 후 총관리자 세션 정상',admin.call('me'),predicate=lambda b:b['user']['role']=='SUPER')
print(json.dumps({'checks':len(results),'passed':sum(x['pass'] for x in results),'findings':[x for x in results if not x['pass']]},ensure_ascii=False),flush=True)
