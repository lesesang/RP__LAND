'use client';
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowUp,ArrowDown,ChevronDown,ChevronUp} from 'lucide-react';

export function ThreadDock({children,title,editing}:{children:ReactNode;title:string;editing:string}){
 const [collapsed,setCollapsed]=useState(false),[height,setHeight]=useState(0);
 const ref=useRef<HTMLElement>(null);
 useEffect(()=>{if(editing){setCollapsed(false);const frame=requestAnimationFrame(()=>ref.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame)}},[editing]);
 useLayoutEffect(()=>{
  const el=ref.current;if(!el)return;
  const measure=()=>{const h=Math.ceil(el.getBoundingClientRect().height);setHeight(h);document.documentElement.style.setProperty('--rp-dock-height',`${h}px`)};
  const viewport=()=>{const v=window.visualViewport;document.documentElement.style.setProperty('--rp-keyboard-offset',`${v?Math.max(0,window.innerHeight-v.height-v.offsetTop):0}px`);document.documentElement.style.setProperty('--rp-visible-height',`${v?.height||window.innerHeight}px`)};
  const observer=new ResizeObserver(measure);observer.observe(el);measure();viewport();
  window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);
  return()=>{observer.disconnect();window.visualViewport?.removeEventListener('resize',viewport);window.visualViewport?.removeEventListener('scroll',viewport);for(const name of ['--rp-dock-height','--rp-keyboard-offset','--rp-visible-height'])document.documentElement.style.removeProperty(name)};
 },[]);
 return <><div aria-hidden="true" style={{height:height+20}}/><section ref={ref} className="thread-dock" aria-label="고정 레스 작성칸">
 <div className="thread-dock-heading"><h2>{title}</h2><button type="button" className="btn" aria-expanded={!collapsed} aria-controls="thread-dock-body" onClick={()=>setCollapsed(v=>!v)}>{collapsed?<ChevronUp size={16}/>:<ChevronDown size={16}/>}작성칸 {collapsed?'펼치기':'접기'}</button></div>
 <div id="thread-dock-body" className="thread-dock-body" hidden={collapsed}>{children}</div>
 </section></>;
}
export function ThreadJump(){
 function jump(last:boolean){
  const reply=last?Array.from(document.querySelectorAll('[data-thread-reply]')).at(-1):null;
  const target=reply||document.getElementById('thread-top');
  if(!target)return;
  const box=target.getBoundingClientRect(),v=window.visualViewport;
  const dock=document.querySelector('.thread-dock')?.getBoundingClientRect();
  const bottom=dock?.top??((v?.height||window.innerHeight)+(v?.offsetTop||0));
  window.scrollTo({top:Math.max(0,window.scrollY+(reply?box.bottom-bottom+16:box.top-(v?.offsetTop||0)-16)),behavior:'instant'});
 }
 return <nav className="thread-jump" aria-label="스레드 빠른 이동"><button className="btn" type="button" title="본문 맨 위로" aria-label="본문 맨 위로" onClick={()=>jump(false)}><ArrowUp size={20}/></button><button className="btn" type="button" title="마지막 레스로" aria-label="마지막 레스로" onClick={()=>jump(true)}><ArrowDown size={20}/></button></nav>;
}
