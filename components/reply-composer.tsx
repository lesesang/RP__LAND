'use client';
import {useState} from 'react';
import {Editor} from '@/components/editor';
import type {AnchorContext} from '@/lib/rich-markup';

/** Pick the speaking character: type a new name or tap one already used. Empty means the account name. */
function CharacterPicker({value, onChange, names, account}: {value: string; onChange: (name: string) => void; names: string[]; account: string}) {
  const [open, setOpen] = useState(false);
  const current = value || account;
  const choices = [{name: '', label: `${account} · 아이디`}, ...names.filter(name => name && name !== account).map(name => ({name, label: name}))];
  return <details className="character-picker" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary title="레스에 표시할 캐릭터명">캐릭터 <b>{current}</b></summary>
    <div className="field">
      <label htmlFor="character">캐릭터명</label>
      <input id="character" value={value} maxLength={30} placeholder={`비워 두면 ${account}`} autoComplete="off" enterKeyHint="done"
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); setOpen(false); } }}/>
    </div>
    {choices.length > 1 && <div className="name-chips" role="group" aria-label="사용했던 캐릭터명">
      {choices.map(choice => <button type="button" key={choice.name || '\u0000account'} className="name-chip" aria-pressed={choice.name === value}
        onClick={() => { onChange(choice.name); setOpen(false); }}>{choice.label}</button>)}
    </div>}
  </details>;
}

type ReplyComposerProps = {
  text: string; onTextChange: (text: string) => void;
  character: string; onCharacterChange: (name: string) => void; names: string[]; account: string;
  editing: boolean; sending: boolean; canSend: boolean; full: string;
  context: AnchorContext; calculatorOpen: boolean; onCalculatorToggle: () => void;
  onSend: () => void; onCancelEdit: () => void;
};

/** The docked reply form: character, formatting tools, text and submit, with Ctrl/⌘+Enter to send. */
export function ReplyComposer({text, onTextChange, character, onCharacterChange, names, account, editing, sending, canSend, full, context, calculatorOpen, onCalculatorToggle, onSend, onCancelEdit}: ReplyComposerProps) {
  return <section className="compose" id="composer" onKeyDown={e => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.nativeEvent.isComposing || !(e.target instanceof HTMLTextAreaElement)) return;
    e.preventDefault();
    if (canSend) onSend();
  }}>
    {full && <p className="error">{full}</p>}
    <Editor compact value={text} onChange={onTextChange} max={1500} allowDice context={context} label="레스 내용"
      calculatorOpen={calculatorOpen} onCalculatorToggle={onCalculatorToggle}
      leading={<CharacterPicker value={character} onChange={onCharacterChange} names={names} account={account}/>}
      footerEnd={<div className="actions compose-actions">
        {editing && <button type="button" className="btn" onClick={onCancelEdit}>취소</button>}
        <button type="button" className="btn primary" disabled={!canSend} aria-keyshortcuts="Control+Enter Meta+Enter" title="Ctrl+Enter(⌘+Enter)로도 등록할 수 있습니다" onClick={onSend}>
          {sending ? '등록 중…' : editing ? '수정 저장' : '레스 등록'}
        </button>
      </div>}/>
  </section>;
}
