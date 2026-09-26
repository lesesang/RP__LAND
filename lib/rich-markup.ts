export type MarkupToken = {
  kind: string;
  value: string;
  body: string;
  start: number;
  bodyStart: number;
  raw: string;
};
export type AnchorContext = { entryId?: string; kind?: string };
export function anchorHref(context: AnchorContext, target: string | undefined, number: number) {
  if (!Number.isInteger(number) || number < 1 || number > 1500) return null;
  const destination = target || (context.kind === 'thread' ? context.entryId : undefined);
  if (!destination || destination === 'practice' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(destination)) return null;
  return `?view=thread&id=${destination}#res-${number}`;
}
export function isPracticeResponseLink(href = '') {
  try {
    const u = new URL(href, 'https://rp-land.lesesang123.chatgpt.site');
    return (u.searchParams.get('id') === 'practice' || u.searchParams.get('view') === 'practice') && !!u.hash;
  } catch { return false; }
}
// Replace only recognized non-code tokens with private placeholders. User input
// cannot supply those placeholders; every token is subsequently rendered as React.
export function prepareMarkup(source: string) {
  const text = source.replace(/[\uE000\uE001]/g, '\uFFFD');
  const tokens: MarkupToken[] = [];
  const pattern = /```[\s\S]*?```|`[^`\n]*`|\[(color|ruby|fold)=([^\]\n]{1,120})\]|\[(transparent)\]|\[dice:[^\]]*\]|>>>([a-z0-9-]+)\/(\d+)|>>(\d+)|\+\+([^+\n]+)\+\+/gi;
  let output = '', cursor = 0, m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    if (m[0].startsWith('`')) continue;
    const start = m.index;
    let kind = (m[1] || m[3] || (m[4] || m[6] ? 'anchor' : m[7] ? 'underline' : 'dice')).toLowerCase();
    let end = pattern.lastIndex, bodyStart = end, body = '', value = m[2] || '';
    if (kind === 'anchor') { value = m[4] || ''; body = m[5] || m[6]; }
    else if (kind === 'underline') { body = m[7]; bodyStart = start + 2; }
    else if (kind !== 'dice') {
      const close = `[/${kind}]`;
      const nested = new RegExp('```[\\s\\S]*?```|`[^`\\n]*`|\\[' + kind + '(?:=[^\\]\\n]*|)\\]|\\[/' + kind + '\\]', 'gi');
      nested.lastIndex = end; let level = 1, n: RegExpExecArray | null, found = false;
      while ((n = nested.exec(text))) {
        if (n[0].startsWith('`')) continue;
        level += n[0].toLowerCase() === close ? -1 : 1;
        if (!level) { body = text.slice(bodyStart, n.index); end = nested.lastIndex; found = true; break; }
      }
      if (!found || (kind === 'color' && !/^#[0-9a-f]{6}$/i.test(value))) continue;
    }
    output += text.slice(cursor, start);
    const marker = `\uE000${tokens.length}\uE001`;
    // Fold is a block, so it must not create a div inside a Markdown paragraph.
    output += kind === 'fold' ? `\n\n${marker}\n\n` : marker;
    tokens.push({ kind, value, body, start, bodyStart, raw: text.slice(start, end) });
    cursor = end; pattern.lastIndex = end;
  }
  output += text.slice(cursor);
  return { text: output, tokens };
}
export function markupPlugin() {
  return (tree: any) => {
    function visit(node: any) {
      if (!node.children || node.type === 'code' || node.type === 'inlineCode') return;
      node.children = node.children.flatMap((child: any) => {
        if (child.type !== 'text') { visit(child); return [child]; }
        // Convert CommonMark soft line breaks into explicit br elements.
        return child.value.split(/(\uE000\d+\uE001|\n)/g).filter(Boolean).map((part: string) => {
          if (part === '\n') return { type: 'break' };
          const token = /^\uE000(\d+)\uE001$/.exec(part);
          return token ? { type: 'rpToken', data: { hName: 'rp-token', hProperties: { 'data-index': token[1] } }, children: [] } : { type: 'text', value: part };
        });
      });
    }
    visit(tree);
  };
}
