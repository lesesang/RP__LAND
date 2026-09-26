// Recorded server results; legacy NdS notation remains supported.
export type DiceRoll={start:number;notation:string;sides:number;min?:number;max?:number;modifier?:number;unique?:boolean;rawValues?:number[];values:number[];total:number};
export const tokenPattern=/```[\s\S]*?```|`[^`\n]*`|\[dice:([^\]]*)\]/gi;
export function diceTokens(text:string){
 const tokens:{start:number;notation:string;count:number;sides:number;min:number;max:number;unique:boolean;modifier:number}[]=[];
 for(const m of text.matchAll(new RegExp(tokenPattern))){
  if(m[1]===undefined)continue;
  const legacy=/^(\d+)d(\d+)([+-]\d+)?$/i.exec(m[1]);
  const spec=/^(\d+)x(\d+)\.\.(\d+)(!)?([+-]\d+)?$/i.exec(m[1]);
  if(!legacy&&!spec)throw new Error('주사위 양식을 확인해 주세요. 예: [dice:2d6], [dice:3x0..100!+5]');
  const count=Number((legacy||spec)![1]),min=legacy?1:Number(spec![2]),max=legacy?Number(legacy[2]):Number(spec![3]),unique=!!spec?.[4],modifier=Number(legacy?.[3]||spec?.[5]||0);
  if(![count,min,max,modifier].every(Number.isSafeInteger)||count<1||count>100||min<0||max>100000000||min>max||Math.abs(modifier)>100000000)throw new Error('범위는 0~100,000,000, 개수는 1~100, 보정값은 -100,000,000~100,000,000입니다.');
  const sides=max-min+1;
  if(unique&&count>sides)throw new Error('중복 제외 개수는 범위 안의 정수 개수보다 많을 수 없습니다.');
  tokens.push({start:m.index!,notation:m[0],count,sides,min,max,unique,modifier});
 }
 if(tokens.length>10||tokens.reduce((n,t)=>n+t.count,0)>100)throw new Error('한 레스에 주사위 양식 10개, 총 100개까지 사용할 수 있습니다.');
 return tokens;
}
function randomBelow(size:number){const limit=Math.floor(4294967296/size)*size;let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0]}while(n>=limit);return n%size}
export function rollDice(text:string):DiceRoll[]{return diceTokens(text).map(t=>{
 // Sparse Fisher–Yates: bounded work even when selecting an entire tiny range.
 const swaps=new Map<number,number>();let remaining=t.sides;
 const rawValues=Array.from({length:t.count},()=>{if(!t.unique)return t.min+randomBelow(t.sides);const index=randomBelow(remaining),value=swaps.get(index)??index;remaining--;swaps.set(index,swaps.get(remaining)??remaining);return t.min+value});
 const values=rawValues.map(n=>n+t.modifier);
 return{start:t.start,notation:t.notation,sides:t.sides,min:t.min,max:t.max,modifier:t.modifier,unique:t.unique,rawValues,values,total:values.reduce((a,b)=>a+b,0)};
})}
