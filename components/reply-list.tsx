'use client';
import {memo, useMemo} from 'react';
import {Dices, Eye, EyeOff, Trash2} from 'lucide-react';
import {Empty, EmptyDescription} from '@/components/ui/empty';
import {Rich} from '@/components/rich-text';
import type {DiceRoll} from '@/lib/roleplay';
import {fullDate, shortDate} from '@/lib/format';

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- rows come straight from the JSON API
export type ReplyAction = 'anchor' | 'copy' | 'edit' | 'hide' | 'delete';
export type ReplyActionHandler = (action: ReplyAction, reply: R, number: number) => void;
type LegacyRoll = {values: number[]; total: number};

/** Replies store dice as JSON: an array of inline rolls, or one legacy whole-reply roll. */
function parseDice(raw: unknown): {rolls: DiceRoll[]; legacy: LegacyRoll | null} {
  if (typeof raw !== 'string' || !raw) return {rolls: [], legacy: null};
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? {rolls: data, legacy: null} : {rolls: [], legacy: data};
  } catch {
    return {rolls: [], legacy: null};
  }
}

type ItemProps = {
  reply: R; number: number; entryId: string; kind: string; isSuper: boolean;
  canAnchor: boolean; canEdit: boolean; canHide: boolean; canDelete: boolean; onAction: ReplyActionHandler;
};

// Memoized per reply: typing in the composer or changing one reply leaves the others untouched.
const ReplyItem = memo(function ReplyItem({reply, number, entryId, kind, isSuper, canAnchor, canEdit, canHide, canDelete, onAction}: ItemProps) {
  const {rolls, legacy} = useMemo(() => parseDice(reply.dice), [reply.dice]);
  const context = useMemo(() => ({entryId, kind}), [entryId, kind]);
  const withdrawn = reply.author === '탈퇴 사용자';
  const body = <>
    <Rich text={reply.content} context={context} rolls={rolls}/>
    {legacy && <div className="dice"><Dices size={24}/>{legacy.values.join(' + ')} = {legacy.total}</div>}
  </>;
  return <article className="comment" data-thread-reply id={kind === 'thread' && !reply.hidden ? `res-${number}` : undefined}>
    <div className="comment-top">
      <span className="avatar">{withdrawn ? '–' : reply.character.slice(0, 1)}</span>
      <b>{withdrawn ? '탈퇴 사용자' : reply.character}</b>
      <small className="muted" title={fullDate(reply.created)}>{shortDate(reply.created)}</small>
      {canAnchor && !reply.hidden
        ? <button type="button" className="comment-num" title={`>>${number} 앵커를 작성칸에 넣기`} aria-label={`${number}번 레스 앵커를 작성칸에 넣기`} onClick={() => onAction('anchor', reply, number)}>#{number}</button>
        : <span className="comment-num">#{number}</span>}
      {kind === 'thread' && <button className="btn" title="이 레스의 슈퍼 앵커 복사" onClick={() => onAction('copy', reply, number)}>앵커 복사</button>}
    </div>
    {reply.hidden
      ? <><p className="muted">가려진 레스입니다.</p>{isSuper && <details className="hidden-reply-review"><summary>가려진 내용 확인 · 총관리자</summary><small className="muted">가림 상태를 유지한 채 확인합니다.</small>{body}</details>}</>
      : body}
    {(canEdit || canHide || canDelete) && <div className="actions" style={{marginTop: 12}}>
      {canEdit && <button className="btn" onClick={() => onAction('edit', reply, number)}>수정</button>}
      {canHide && <button className="btn" onClick={() => onAction('hide', reply, number)}>{reply.hidden ? <Eye size={14}/> : <EyeOff size={14}/>} {reply.hidden ? '가림 해제' : '가리기'}</button>}
      {canDelete && <button className="btn danger" onClick={() => onAction('delete', reply, number)}><Trash2 size={14}/>삭제</button>}
    </div>}
  </article>;
});

/** The reply list of a thread or the practice board. Re-renders only when the entry, replies or viewer change. */
export const ReplyList = memo(function ReplyList({entry, comments, viewer, onAction}: {entry: R; comments: R[]; viewer: R | null; onAction: ReplyActionHandler}) {
  const practice = entry.kind === 'practice';
  return <>
    <div className="list-head"><span>레스 <strong>{comments.length.toLocaleString()} / 1,500</strong></span></div>
    {comments.map((reply, index) => {
      if (reply.deleted) return null;
      const own = !!viewer && reply.author_id === viewer.id;
      return <ReplyItem key={reply.id} reply={reply} number={index + 1} entryId={entry.id} kind={entry.kind}
        isSuper={viewer?.role === 'SUPER'} canAnchor={entry.kind === 'thread' && !!viewer && !entry.pending}
        canEdit={practice && own} canHide={!!entry.canHide} canDelete={!!entry.canDeleteComment || (practice && own)} onAction={onAction}/>;
    })}
    {!comments.length && <Empty><EmptyDescription>아직 레스가 없습니다.</EmptyDescription></Empty>}
  </>;
});
