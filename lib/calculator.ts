/** A bounded arithmetic parser: never executes JavaScript or accesses objects. */
export function calculate(source:string):number {
 if(source.length>300)throw new Error('수식은 300자 이하로 입력해 주세요.');
 const text=source.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-');let at=0,depth=0;
 const space=()=>{while(/\s/.test(text[at]||'')&&at<text.length)at++};
 function atom():number{space();if(++depth>32)throw new Error('괄호가 너무 깊습니다.');let value:number;
 if(text[at]==='+'||text[at]==='-'){const sign=text[at++];value=(sign==='-'?-1:1)*atom()}
 else if(text[at]==='('){at++;value=sum();space();if(text[at++]!==')')throw new Error('괄호를 확인해 주세요.')}
 else{const m=/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(at));if(!m)throw new Error('숫자와 사칙연산, 괄호를 입력해 주세요.');at+=m[0].length;value=Number(m[0])}depth--;return value}
 function product():number{let v=atom();space();while(['*','/','%'].includes(text[at])){const op=text[at++],n=atom();if((op==='/'||op==='%')&&n===0)throw new Error('0으로 나눌 수 없습니다.');v=op==='*'?v*n:op==='/'?v/n:v%n;space()}return v}
 function sum():number{let v=product();space();while(text[at]==='+'||text[at]==='-'){const op=text[at++],n=product();v=op==='+'?v+n:v-n;space()}return v}
 const result=sum();space();if(at!==text.length)throw new Error('수식을 확인해 주세요.');if(!Number.isFinite(result))throw new Error('계산 가능한 범위를 벗어났습니다.');return Number(result.toPrecision(15));
}
