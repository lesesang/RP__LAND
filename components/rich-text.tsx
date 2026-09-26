'use client';
import { Fragment } from 'react';
import Markdown from 'react-markdown';
import { Dices } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { prepareMarkup, markupPlugin, anchorHref, isPracticeResponseLink, type AnchorContext } from '@/lib/rich-markup';
import type { DiceRoll } from '@/lib/roleplay';

type RichProps = { text: string; rolls?: DiceRoll[]; offset?: number; depth?: number; inline?: boolean; context?: AnchorContext };
export function Rich({ text, rolls = [], offset = 0, depth = 0, inline = false, context = {} }: RichProps) {
  if (depth > 12) return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;
  const prepared = prepareMarkup(text);
  function token(index: number) {
    const item = prepared.tokens[index];
    if (!item) return null;
    const child = <Rich text={item.body} rolls={rolls} offset={offset + item.bodyStart} depth={depth + 1} inline={inline || item.kind !== 'fold'} context={context} />;
    switch (item.kind) {
      case 'ruby':
        return <ruby className="rp-ruby"><span className="rp-ruby-base">{child}</span><rp>(</rp><rt>{item.value}</rt><rp>)</rp></ruby>;
      case 'color': return <span style={{ color: item.value }}>{child}</span>;
      case 'underline': return <u>{child}</u>;
      case 'transparent': return <span className="rp-transparent" tabIndex={0} aria-label="투명글: 선택하거나 초점을 맞춰 읽기">{child}</span>;
      case 'fold':
        return inline ? <span>{child}</span> : <Collapsible className="rp-fold"><CollapsibleTrigger className="rp-fold-title">▸ {item.value}</CollapsibleTrigger><CollapsibleContent className="rp-fold-body">{child}</CollapsibleContent></Collapsible>;
      case 'anchor': {
        const href = anchorHref(context, item.value || undefined, Number(item.body));
        return href ? <a href={href} className="rp-anchor">{item.raw}</a> : <span className="rp-anchor-disabled" title="연습장 레스는 앵커 대상으로 지정할 수 없습니다.">{item.raw}</span>;
      }
      case 'dice': {
        const roll = rolls.find(r => r.start === offset + item.start && r.notation === item.raw);
        return roll ? <span className="dice"><Dices size={20}/>{roll.values.join(' + ')} = {roll.total}<small>D{roll.sides} · 기록된 결과</small></span> : <code className="dice-pending">{item.raw} · 등록할 때 굴림</code>;
      }
    }
    return item.raw;
  }
  const components: any = {
    'rp-token': (props: any) => token(Number(props['data-index'])),
    p: ({ node, children }: any) => {
      const only = node?.children?.length === 1 ? node.children[0] : null;
      const i = only?.tagName === 'rp-token' ? Number(only.properties?.['data-index'] ?? only.properties?.dataIndex) : -1;
      if (prepared.tokens[i]?.kind === 'fold') return <Fragment>{children}</Fragment>;
      return inline ? <span className="rp-inline-paragraph">{children}</span> : <p>{children}</p>;
    },
    a: ({ node, href, children, ...props }: any) => isPracticeResponseLink(href)
      ? <span className="rp-anchor-disabled" title="연습장 레스를 향하는 링크는 비활성화됩니다.">{children}</span>
      : <a {...props} href={href} rel="noopener noreferrer" target={href?.startsWith('?') || href?.startsWith('#') ? undefined : '_blank'}>{children}</a>,
  };
  const content = <Markdown skipHtml remarkPlugins={[markupPlugin]} components={components}>{prepared.text}</Markdown>;
  return inline ? <span className="rp-inline-content">{content}</span> : <div className="prose rp-prose">{content}</div>;
}
