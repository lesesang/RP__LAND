'use client';
import {toast} from 'sonner';
import { Fragment, memo, type ReactElement } from 'react';
import Markdown from 'react-markdown';
import { Dices } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { prepareMarkup, markupPlugin, anchorHref, isPracticeResponseLink, type AnchorContext } from '@/lib/rich-markup';
import type { DiceRoll } from '@/lib/roleplay';

type RichProps = { text: string; rolls?: DiceRoll[]; offset?: number; depth?: number; inline?: boolean; context?: AnchorContext };
export const Rich = memo(function RichContent({ text, rolls = [], offset = 0, depth = 0, inline = false, context = {} }: RichProps): ReactElement {
  if (depth > 12) return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;
  const prepared = prepareMarkup(text);
  function token(index: number) {
    const item = prepared.tokens[index];
    if (!item) return null;
    const child = <Rich text={item.body} rolls={rolls} offset={offset + item.bodyStart} depth={depth + 1} inline={inline || item.kind !== 'fold'} context={context} />;
    switch (item.kind) {
      case 'image': return <img src={item.value} alt="" loading="lazy" referrerPolicy="no-referrer"/>;
      case 'ruby':
        return <ruby className="rp-ruby"><span className="rp-ruby-base">{child}</span><rp>(</rp><rt>{item.value}</rt><rp>)</rp></ruby>;
      case 'color': return <span style={{ color: item.value }}>{child}</span>;
      case 'underline': return <u>{child}</u>;
      case 'transparent': return <span className="rp-transparent" tabIndex={0} aria-label="투명글: 선택하거나 초점을 맞춰 읽기">{child}</span>;
      case 'fold':
        return inline ? <span>{child}</span> : <Collapsible className="rp-fold"><CollapsibleTrigger className="rp-fold-title">▸ {item.value}</CollapsibleTrigger><CollapsibleContent className="rp-fold-body">{child}</CollapsibleContent></Collapsible>;
      case 'anchor': {
        const href = anchorHref(context, item.value || undefined, Number(item.body));
        return href ? <a href={href} className="rp-anchor" title={item.value?`다른 스레드의 ${Number(item.body)}번 레스`:undefined} onClick={async event=>{
          event.preventDefault();
          try{
            const destination=item.value||context.entryId,origin=location.href;
            const response=await fetch(`/api/entries/${destination}/anchors/${Number(item.body)}`);
            const data=await response.json() as {status?:string;error?:string};if(location.href!==origin)return;if(!response.ok)throw new Error(data.error||'레스를 찾을 수 없습니다.');
            if(data.status!=='visible'){toast.error(data.status==='deleted'?'삭제된 레스입니다.':'가려진 레스입니다.');return}
            const current=new URLSearchParams(location.search).get('id');
            if(current===destination){const target=document.getElementById('res-'+Number(item.body));if(target){history.replaceState(null,'',href);target.scrollIntoView({block:'center'});return}}
            location.assign(href);
          }catch(error){toast.error((error as Error).message)}
        }}>{item.value?`↗${Number(item.body)}`:item.raw}</a> : <span className="rp-anchor-disabled" title="연습장 레스는 앵커 대상으로 지정할 수 없습니다.">{item.raw}</span>;
      }
      case 'dice': {
        const roll = rolls.find(r => r.start === offset + item.start && r.notation === item.raw);
        return roll ? <span className="dice" title={roll.notation + (roll.modifier ? ` · 각 결과에 ${roll.modifier>0?'+':''}${roll.modifier} 보정` : '')}><Dices size={14}/><span>{roll.notation.replace(/\]$/, '')}= {roll.values.join(', ')}{roll.values.length>1&&<> · 합계 {roll.total}</>}]</span></span> : <code className="dice-pending">{item.raw} · 등록할 때 굴림</code>;
      }
    }
    return item.raw;
  }
  const components: any = {
    'rp-gap': (props: any) => <span aria-hidden="true" className="rp-line-gap" style={{height:`${Number(props['data-lines']) * 1.9}em`}}/>,
    'rp-token': (props: any) => token(Number(props['data-index'])),
    p: ({ node, children }: any) => {
      const only = node?.children?.length === 1 ? node.children[0] : null;
      const i = only?.tagName === 'rp-token' ? Number(only.properties?.['data-index'] ?? only.properties?.dataIndex) : -1;
      if (prepared.tokens[i]?.kind === 'fold') return <Fragment>{children}</Fragment>;
      return inline ? <span className="rp-inline-paragraph">{children}</span> : <p>{children}</p>;
    },
    img: ({node, ...props}: any) => <img {...props} alt={props.alt||''} loading="lazy" referrerPolicy="no-referrer"/>,
    a: ({ node, href, children, ...props }: any) => isPracticeResponseLink(href)
      ? <span className="rp-anchor-disabled" title="연습장 레스를 향하는 링크는 비활성화됩니다.">{children}</span>
      : <a {...props} href={href} rel="noopener noreferrer" referrerPolicy="no-referrer" target={href?.startsWith('?') || href?.startsWith('#') ? undefined : '_blank'}>{children}</a>,
  };
  const leading = /^\n+/.exec(prepared.text)?.[0].length || 0;
  const trailing = /\n+$/.exec(prepared.text)?.[0].length || 0;
  const content = <>{leading>0&&<span aria-hidden="true" className="rp-line-gap" style={{height:`${leading*1.9}em`}}/>}<Markdown skipHtml remarkPlugins={[markupPlugin]} components={components}>{prepared.text}</Markdown>{trailing>0&&<span aria-hidden="true" className="rp-line-gap" style={{height:`${trailing*1.9}em`}}/>}</>;
  return inline ? <span className="rp-inline-content">{content}</span> : <div className="prose rp-prose">{content}</div>;
},(previous,next)=>previous.text===next.text
 && previous.offset===next.offset && previous.depth===next.depth && previous.inline===next.inline
 && previous.context?.entryId===next.context?.entryId && previous.context?.kind===next.context?.kind
 && (previous.rolls===next.rolls || JSON.stringify(previous.rolls||[])===JSON.stringify(next.rolls||[])));
