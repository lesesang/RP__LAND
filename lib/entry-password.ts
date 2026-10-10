import {env} from 'cloudflare:workers';
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function encryptionKey(){
 const value=(env as unknown as {ENTRY_PASSWORD_KEY?:string}).ENTRY_PASSWORD_KEY;
 if(!value)return null;
 const bytes=decode(value.trim());
 if(bytes.length!==32)throw new Error('ENTRY_PASSWORD_KEY must be a 32-byte base64 key');
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
export async function sealEntryPassword(entryId:string,password:string){
 const key=await encryptionKey();if(!key)return null;
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(entryId)},key,new TextEncoder().encode(password));
 return `v1.${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
export async function openEntryPassword(entryId:string,sealed:string){
 const key=await encryptionKey();if(!key)throw Object.assign(new Error('비밀번호 확인 기능의 서버 암호화 키가 설정되지 않았습니다.'),{status:503});
 const [version,iv,data]=sealed.split('.');if(version!=='v1')throw new Error('Unknown password format');
 const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:new TextEncoder().encode(entryId)},key,decode(data));
 return new TextDecoder().decode(decrypted);
}
