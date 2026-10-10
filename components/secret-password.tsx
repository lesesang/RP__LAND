'use client';
import {useState} from 'react';
export function SecretPassword({entryId}:{entryId:string}){
 const [password,setPassword]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function reveal(){setBusy(true);setError('');try{
  const response=await fetch(`/api/entries/${entryId}/password`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  const data=await response.json() as {error?:string;password:string};if(!response.ok)throw new Error(data.error||'비밀번호를 확인할 수 없습니다.');setPassword(data.password);
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="field"><button type="button" className="btn" disabled={busy} onClick={()=>password===null?void reveal():setPassword(null)}>{busy?'확인 중…':password===null?'비밀번호 확인':'비밀번호 숨기기'}</button>{password!==null&&<><p><code style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',userSelect:'all'}}>{password}</code></p><small className="muted">비밀번호 확인은 입장 인증과 별개입니다.</small></>}{error&&<p className="error" role="alert">{error}</p>}</div>;
}
