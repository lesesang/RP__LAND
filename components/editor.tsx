'use client';
import {useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {Dices, Calculator} from 'lucide-react';
import {Checkbox} from '@/components/ui/checkbox';
import {Rich} from '@/components/rich-text';
import {diceTokens} from '@/lib/roleplay';
import type {AnchorContext} from '@/lib/rich-markup';
import {toast} from 'sonner';

function numberError(value: string, label: string, min: number, max: number) {
  const range = `${min.toLocaleString('ko-KR')}~${max.toLocaleString('ko-KR')}`;
  if (!/^[+-]?\d+$/.test(value)) return `${label}: ${range} 사이의 정수를 입력해 주세요.`;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) return `${label}: ${range} 범위로 다시 입력해 주세요.`;
  return '';
}

type ScrollPosition = {element: HTMLElement; top: number; left: number};
const scrollPositions = (from: HTMLElement) => {
  const positions: ScrollPosition[] = [];
  for (let element: HTMLElement | null = from; element; element = element.parentElement) positions.push({element, top: element.scrollTop, left: element.scrollLeft});
  return positions;
};
const restoreScroll = (positions: ScrollPosition[]) => { for (const {element, top, left} of positions) { element.scrollTop = top; element.scrollLeft = left; } };

type EditorProps = {
  value: string; onChange: (s: string) => void; max?: number; allowDice?: boolean; context?: AnchorContext;
  onCalculatorToggle?: () => void; calculatorOpen?: boolean;
  /** Docked reply mode: tools fold away, the box grows with its text and the footer holds the actions. */
  compact?: boolean;
  /** Compact mode: shown on the same row as the tools toggle (e.g. the character picker). */
  leading?: ReactNode;
  /** Compact mode: shown at the end of the footer row (e.g. the submit button). */
  footerEnd?: ReactNode;
  label?: string; placeholder?: string;
};

export function Editor({value, onChange, max = 5000, allowDice = false, context = {}, onCalculatorToggle, calculatorOpen = false, compact = false, leading, footerEnd, label = '본문', placeholder = '이야기를 남겨 주세요.'}: EditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [color, setColor] = useState('#6154d9');
  const [ruby, setRuby] = useState('루비');
  const [ds, setDs] = useState('6');
  const [dc, setDc] = useState('1');
  const [minimum, setMinimum] = useState('1');
  const [modifier, setModifier] = useState('0');
  const [unique, setUnique] = useState(false);
  const [diceOpen, setDiceOpen] = useState(false);
  const [showDiceErrors, setShowDiceErrors] = useState(false);
  const diceId = useId();

  // Fallback insertion path: restore the selection after React updates the controlled textarea,
  // before the browser paints its temporary end-of-text caret position.
  const pendingInsertion = useRef<{start: number; end: number; direction: 'forward' | 'backward' | 'none'; scroll: ScrollPosition[]} | null>(null);
  useLayoutEffect(() => {
    const pending = pendingInsertion.current, t = ref.current;
    if (!pending || !t) return;
    pendingInsertion.current = null;
    t.setSelectionRange(pending.start, pending.end, pending.direction);
    t.focus({preventScroll: true});
    restoreScroll(pending.scroll);
  }, [value]);

  // The docked reply box grows with its text (CSS caps the height) unless the dock was sized by hand.
  const autoGrow = useCallback(() => {
    const t = ref.current;
    if (!t || !compact || t.hidden) return;
    if (t.closest('[data-sized]')) { t.style.height = ''; return; }
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight + 2}px`;
  }, [compact]);
  useLayoutEffect(autoGrow, [value, preview, autoGrow]);
  useEffect(() => {
    window.addEventListener('resize', autoGrow);
    return () => window.removeEventListener('resize', autoGrow);
  }, [autoGrow]);

  const errors = {
    minimum: numberError(minimum, '최소값', 0, 100000000),
    maximum: numberError(ds, '최대값', 0, 100000000),
    count: numberError(dc, '개수', 1, 100),
    modifier: numberError(modifier, '보정값', -100000000, 100000000),
  };
  if (!errors.minimum && !errors.maximum && Number(minimum) > Number(ds)) errors.maximum = '최대값은 입력한 최소값 이상이어야 합니다.';

  function diceField(key: keyof typeof errors, fieldLabel: string, fieldValue: string, setValue: (v: string) => void, hint: string, signed = false) {
    const fieldId = diceId + '-' + key, error = showDiceErrors ? errors[key] : '';
    return <label htmlFor={fieldId}>{fieldLabel}
      <input id={fieldId} aria-label={'주사위 ' + fieldLabel} aria-describedby={fieldId + '-hint' + (error ? ' ' + fieldId + '-error' : '')} aria-invalid={!!error} type="text" inputMode={signed ? 'text' : 'numeric'} autoComplete="off" spellCheck={false} value={fieldValue} onChange={e => setValue(e.target.value)} onBlur={() => setShowDiceErrors(true)}/>
      <small className="dice-hint" id={fieldId + '-hint'}>{hint}</small>
      {error && <small className="dice-field-error" id={fieldId + '-error'} role="alert">{error}</small>}
    </label>;
  }

  /** Wraps the selection (or inserts at the caret) while keeping the browser's undo history. */
  function wrap(before: string, after = '') {
    const t = ref.current;
    if (!t) return;
    const a = t.selectionStart, z = t.selectionEnd;
    const inserted = before + value.slice(a, z) + after;
    const next = value.slice(0, a) + inserted + value.slice(z);
    if (Array.from(next).length > max) { toast.error(`최대 ${max.toLocaleString()}자까지 입력할 수 있어 양식을 넣지 못했습니다.`); return; }
    const scroll = scrollPositions(t);
    if (!t.hidden) {
      // A native insertion is undoable with Ctrl+Z; it also fires the input event that updates React.
      t.focus({preventScroll: true});
      t.setSelectionRange(a, z);
      if (document.execCommand?.('insertText', false, inserted) && t.value === next) {
        t.setSelectionRange(a + before.length, z + before.length);
        restoreScroll(scroll);
        return;
      }
    }
    pendingInsertion.current = {start: a + before.length, end: z + before.length, direction: t.selectionDirection, scroll};
    onChange(next);
  }

  function insertDice() {
    try {
      setShowDiceErrors(true);
      const error = Object.values(errors).find(Boolean);
      if (error) throw new Error(error);
      const mod = Number(modifier);
      const notation = `[dice:${Number(dc)}x${Number(minimum)}..${Number(ds)}${unique ? '!' : ''}${mod > 0 ? '+' : ''}${mod ? mod : ''}]`;
      diceTokens(notation);
      wrap(notation);
      setDiceOpen(false);
    } catch (e) { toast.error((e as Error).message); }
  }

  const length = Array.from(value).length;
  const countClass = 'editor-count' + (length >= max ? ' at-limit' : length >= max * 0.9 ? ' near-limit' : '');
  const count = <span className={countClass} aria-live={length >= max * 0.9 ? 'polite' : undefined}>{length.toLocaleString()} / {max.toLocaleString()}</span>;
  const previewToggle = <button type="button" className={compact ? 'btn preview-toggle' : undefined} style={compact ? undefined : {marginLeft: 'auto'}} aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? '작성' : '미리보기'}</button>;

  const tools = <details className={compact ? 'editor-tools compact' : 'editor-tools'} open={compact ? undefined : true}>
    <summary>꾸미기 · 주사위 · 계산기</summary>
    <div className="toolbar">
      <button type="button" onClick={() => wrap('**', '**')} aria-label="굵게"><b>B</b></button>
      <button type="button" onClick={() => wrap('*', '*')} aria-label="기울임"><i>I</i></button>
      <button type="button" onClick={() => wrap('++', '++')} aria-label="밑줄"><u>U</u></button>
      <button type="button" onClick={() => wrap('\n```\n', '\n```\n')} aria-label="코드 블록">코드 블록</button>
      <button type="button" onClick={() => wrap('\n- ')} aria-label="목록">≡</button>
      <button type="button" onClick={() => wrap('\n> ')} aria-label="인용">❞</button>
      <button type="button" onClick={() => wrap('`', '`')} aria-label="코드">{'</>'}</button>
      <button type="button" onClick={() => wrap('[', '](https://)')}>링크</button>
      <button type="button" onClick={() => wrap('!(', ')')}>이미지 주소</button>
      <a className="image-host-link" href="https://postimages.org/" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title="Postimages 새 탭에서 열기">이미지 올리기 ↗</a>
      <label className="color-picker" title="글자 색상"><span className="sr-only">글자 색상</span><input type="color" aria-label="글자 색상" value={color} onChange={e => setColor(e.target.value)}/></label>
      <button type="button" onClick={() => wrap(`[color=${color}]`, '[/color]')}>색상 적용</button>
      <button type="button" onClick={() => wrap('[fold=접어보기]', '[/fold]')}>접어보기</button>
      <button type="button" onClick={() => wrap('[transparent]', '[/transparent]')}>투명글</button>
      <input className="ruby-input" aria-label="루비 읽기" value={ruby} maxLength={120} onChange={e => setRuby(e.target.value.replace(/[\]\n]/g, ''))}/>
      <button type="button" onClick={() => wrap(`[ruby=${ruby || '루비'}]`, '[/ruby]')}>루비</button>
      {allowDice && <button type="button" onClick={() => setDiceOpen(!diceOpen)} aria-expanded={diceOpen}><Dices size={16}/>주사위</button>}
      {onCalculatorToggle && <button type="button" aria-expanded={calculatorOpen} onClick={onCalculatorToggle}><Calculator size={16}/>계산기</button>}
      {!compact && previewToggle}
    </div>
    {allowDice && diceOpen && <div className="dice-options">
      {diceField('minimum', '최소', minimum, setMinimum, '0~100,000,000')}
      {diceField('maximum', '최대', ds, setDs, '0~100,000,000')}
      {diceField('count', '개수', dc, setDc, '1~100개')}
      {diceField('modifier', '보정값', modifier, setModifier, '-100,000,000~100,000,000', true)}
      <label className="check-label"><Checkbox checked={unique} onCheckedChange={v => setUnique(v === true)}/>중복 제외</label>
      <button type="button" className="btn" onClick={insertDice}>양식 삽입</button>
    </div>}
  </details>;

  return <>
    {compact ? <div className="editor-head">{leading}{tools}</div> : tools}
    {preview && <div className="panel article editor-preview"><Rich text={value || '미리 볼 내용을 입력해 주세요.'} context={context}/></div>}
    <textarea hidden={preview} aria-label={label} ref={ref} value={value} maxLength={max} onChange={e => onChange(e.target.value)} placeholder={placeholder}/>
    {compact
      ? <div className="editor-footer">{previewToggle}{count}{footerEnd}</div>
      : <div className="editor-count-row">{count}</div>}
  </>;
}
