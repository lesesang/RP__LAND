import assert from 'node:assert/strict';
import {calculate} from '../lib/calculator';
for(const [input,result] of [['1+2*3',7],['(1+2)*3',9],['-2*-3',6],['10÷4',2.5],['10%3',1],['.1+.2',.3],[' 2 × (5 − 1) ',8],['1--2',3],['0',0],['1e+21+1e+21',2e21]] as const)assert.equal(calculate(input),result,input);
for(const input of ['', '1/0','1%0','globalThis.process.exit()', '1;alert(1)','2**3','(1+2','1e999', '('.repeat(40)+'1'+')'.repeat(40),'1'.repeat(301)])assert.throws(()=>calculate(input),input);
console.log('PASS calculator: precedence, decimals, unary signs, bounds and injection rejection');
