'use client';
import {Fragment} from 'react';
import Markdown from 'react-markdown';
import {Dices} from 'lucide-react';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import type {DiceRoll} from '@/lib/roleplay';
function underlinePlugin(){return(tree:any)=>{function visit(node:any){if(!node.children)return;node.children=node.children.flatMap((child:any)=>{if(child.type!=='text'){visit(child);return[child]}return child.value.split(/(\+\+[^+\n]+\+\+)/g).map((s:string)=>s.startsWith('++')&&s.endsWith('++')?{type:'emphasis',data:{hName:'u'},children:[{type:'text',value:s.slice(2,-2)}]}:{type:'text',value:s})})}visit(tree)}}
function Plain({text,inline=false}:{text:string;inline?:boolean}){const leading=text.match(/^\s+/)?.[0]||'',trailing=text.trim()?text.match(/\s+$/)?.[0]||'':'';return <><span style={{whiteSpace:'pre-wrap'}}>{leading}</span><Markdown skipHtml remarkPlugins={[underlinePlugin]} components={{p:({node,...props})=>inline?<span {...props}/>:<p {...props}/>,a:({node,...props})=><a {...props} rel="noopener noreferrer" target="_blank"/>}}>{text.trim()}</Markdown><span style={{whiteSpace:'pre-wrap'}}>{trailing}</span></>}
export function Rich({text,rolls=[],offset=0,depth=0}:{text:string;rolls?:DiceRoll[];offset?:number;depth?:number}){
 if(depth>12)return <Plain inline={depth>0} text={text}/>;
 const pattern=/```[\s\S]*?```|`[^`\n]*`|\[(color|ruby|fold)=([^\]\n]{1,120})\]|\[(transparent)\]|\[dice:[^\]]*\]/gi;
 const parts:React.ReactNode[]=[];let cursor=0;let m:RegExpExecArray|null;
 while((m=pattern.exec(text))){if(m[0].startsWith('`'))continue;const start=m.index,kind=(m[1]||m[3]||'dice').toLowerCase();
 if(kind==='dice'){const roll=rolls.find(r=>r.start===offset+start&&r.notation===m![0]);if(cursor<start)parts.push(<Plain inline={depth>0} key={'p'+cursor} text={text.slice(cursor,start)}/>);parts.push(roll?<span key={start} className="dice"><Dices size={20}/>{roll.values.join(' + ')} = {roll.total}<small>D{roll.sides} · 기록된 결과</small></span>:<code key={start} className="dice-pending">{m[0]} · 등록할 때 굴림</code>);cursor=pattern.lastIndex;continue}
 const close=`[/${kind}]`;let end=-1,level=1;const nested=new RegExp(`\\[${kind}(?:=[^\\]\\n]*|)\\]|\\[/${kind}\\]`,'gi');nested.lastIndex=pattern.lastIndex;let n;while((n=nested.exec(text))){level+=n[0].toLowerCase()===close?-1:1;if(level===0){end=n.index;break}}
 if(end<0||kind==='color'&&!/^#[0-9a-f]{6}$/i.test(m[2]))continue;
 if(cursor<start)parts.push(<Plain inline={depth>0} key={'p'+cursor} text={text.slice(cursor,start)}/>);
 const body=text.slice(pattern.lastIndex,end),child=<Rich text={body} rolls={rolls} offset={offset+pattern.lastIndex} depth={depth+1}/>;
 if(kind==='color')parts.push(<span className="rp-inline" key={start} style={{color:m[2]}}>{child}</span>);
 if(kind==='ruby')parts.push(<ruby className="rp-inline" key={start}>{child}<rp>(</rp><rt>{m[2]}</rt><rp>)</rp></ruby>);
 if(kind==='transparent')parts.push(<span className="rp-transparent rp-inline" key={start} tabIndex={0} aria-label="투명글: 선택하거나 초점을 맞춰 읽기">{child}</span>);
 if(kind==='fold')parts.push(<Collapsible className="rp-fold" key={start}><CollapsibleTrigger className="rp-fold-title">▸ {m[2]}</CollapsibleTrigger><CollapsibleContent className="rp-fold-body">{child}</CollapsibleContent></Collapsible>);
 cursor=end+close.length;pattern.lastIndex=cursor;
 }
 if(cursor<text.length)parts.push(<Plain inline={depth>0} key={'p'+cursor} text={text.slice(cursor)}/>);
 const children=parts.map((p,i)=><Fragment key={i}>{p}</Fragment>);return depth?<span className='rp-fragment'>{children}</span>:<div className='prose'>{children}</div>
}
