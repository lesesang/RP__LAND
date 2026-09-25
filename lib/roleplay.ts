// Text-only markup: no user HTML, class names, event handlers or arbitrary CSS.
export type DiceRoll={start:number;notation:string;sides:number;values:number[];total:number};
export const tokenPattern=/```[\s\S]*?```|`[^`\n]*`|\[dice:([^\]]*)\]/gi;
export function diceTokens(text:string){
 const tokens:{start:number;notation:string;count:number;sides:number}[]=[];
 for(const m of text.matchAll(new RegExp(tokenPattern))){if(m[1]===undefined)continue;const spec=/^(\d{1,2})d(\d{1,3})$/i.exec(m[1]);if(!spec)throw new Error('주사위 양식은 [dice:2d6]처럼 입력해 주세요.');const count=Number(spec[1]),sides=Number(spec[2]);if(count<1||count>10||![4,6,8,10,12,20,100].includes(sides))throw new Error('주사위는 1~10개, D4·6·8·10·12·20·100을 사용할 수 있습니다.');tokens.push({start:m.index!,notation:m[0],count,sides})}
 if(tokens.length>10||tokens.reduce((n,t)=>n+t.count,0)>50)throw new Error('한 레스에는 주사위 양식 10개, 총 50개까지 사용할 수 있습니다.');return tokens;
}
export function rollDice(text:string):DiceRoll[]{return diceTokens(text).map(t=>{const values=Array.from({length:t.count},()=>{const limit=Math.floor(4294967296/t.sides)*t.sides;let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0]}while(n>=limit);return n%t.sides+1});return{start:t.start,notation:t.notation,sides:t.sides,values,total:values.reduce((a,b)=>a+b,0)}})}
