'use client';
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowUp,ArrowDown,ChevronDown,ChevronUp,RefreshCw} from 'lucide-react';

export function ThreadDock({children,title,editing}:{children:ReactNode;title:string;editing:string}){
 const [collapsed,setCollapsed]=useState(true),[height,setHeight]=useState(0);
 const ref=useRef<HTMLElement>(null);
 const [size,setSize]=useState<number|null>(null);
 const drag=useRef<{y:number;height:number}|null>(null);
 const resize=(value:number)=>{const visible=window.visualViewport?.height||window.innerHeight;const compact=window.matchMedia('(max-width:760px), (hover:none) and (pointer:coarse)').matches;const max=Math.max(0,Math.min(580,visible*(compact?.85:.65),visible-56));setSize(Math.round(Math.max(Math.min(140,max),Math.min(value,max))))};
 useEffect(()=>{if(editing){setCollapsed(false);const frame=requestAnimationFrame(()=>ref.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame)}},[editing]);
 useLayoutEffect(()=>{
  const el=ref.current;if(!el)return;
  const measure=()=>{const h=Math.ceil(el.getBoundingClientRect().height);setHeight(h);document.documentElement.style.setProperty('--rp-dock-height',`${h}px`)};
  const viewport=()=>{const v=window.visualViewport;document.documentElement.style.setProperty('--rp-keyboard-offset',`${v?Math.max(0,window.innerHeight-v.height-v.offsetTop):0}px`);document.documentElement.style.setProperty('--rp-visible-height',`${v?.height||window.innerHeight}px`)};
  const observer=new ResizeObserver(measure);observer.observe(el);measure();viewport();
  window.addEventListener('resize',viewport);window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);
  return()=>{observer.disconnect();window.removeEventListener('resize',viewport);window.visualViewport?.removeEventListener('resize',viewport);window.visualViewport?.removeEventListener('scroll',viewport);for(const name of ['--rp-dock-height','--rp-keyboard-offset','--rp-visible-height'])document.documentElement.style.removeProperty(name)};
 },[]);
 return <><div aria-hidden="true" style={{height:height+20}}/><section ref={ref} className="thread-dock" data-collapsed={collapsed?true:undefined} data-sized={!collapsed&&size!==null?true:undefined} style={{height:!collapsed&&size!==null?size:undefined}} aria-label="고정 레스 작성칸">
 {!collapsed&&<div className="dock-resize" role="separator" tabIndex={0} aria-label="작성칸 높이 조절" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={580} aria-valuenow={height} aria-valuetext={`${height}px, 위아래 방향키로 조절`} title="위아래로 끌어 크기 조절 · 두 번 클릭하면 기본 크기" onDoubleClick={()=>setSize(null)} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();drag.current={y:e.clientY,height:ref.current?.getBoundingClientRect().height||height};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(drag.current)resize(drag.current.height+drag.current.y-e.clientY)}} onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{drag.current=null}} onLostPointerCapture={()=>{drag.current=null}} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();resize(height+(e.key==='ArrowUp'?20:-20))}else if(e.key==='Home'){e.preventDefault();setSize(null)}}}><span/></div>}
 <div className="thread-dock-heading"><h2>{title}</h2>{size!==null&&<button type="button" className="btn dock-reset" onClick={()=>setSize(null)}>기본 크기</button>}<button type="button" className="btn" aria-expanded={!collapsed} aria-controls="thread-dock-body" onClick={()=>setCollapsed(v=>!v)}>{collapsed?<ChevronUp size={16}/>:<ChevronDown size={16}/>}작성칸 {collapsed?'펼치기':'접기'}</button></div>
 <div id="thread-dock-body" className="thread-dock-body" hidden={collapsed}>{children}</div>
 </section></>;
}
export function ThreadJump({onRefresh,loading}:{onRefresh:()=>void;loading:boolean}){
 function jump(last:boolean){
  const reply=last?Array.from(document.querySelectorAll('[data-thread-reply]')).at(-1):null;
  const target=reply||document.getElementById('thread-top');
  if(!target)return;
  const box=target.getBoundingClientRect(),v=window.visualViewport;
  const dock=document.querySelector('.thread-dock')?.getBoundingClientRect();
  const bottom=dock?.top??((v?.height||window.innerHeight)+(v?.offsetTop||0));
  window.scrollTo({top:Math.max(0,window.scrollY+(reply?box.bottom-bottom+16:box.top-(v?.offsetTop||0)-16)),behavior:'instant'});
 }
 return <nav className="thread-jump" aria-label="스레드 이동과 새로고침"><button className="btn" type="button" title="본문 맨 위로" aria-label="본문 맨 위로" onClick={()=>jump(false)}><ArrowUp size={20}/></button><button className="btn" type="button" title="레스 새로고침" aria-label="레스 새로고침" aria-busy={loading} disabled={loading} onClick={onRefresh}><RefreshCw size={19}/></button><button className="btn" type="button" title="마지막 레스로" aria-label="마지막 레스로" onClick={()=>jump(true)}><ArrowDown size={20}/></button></nav>;
}
