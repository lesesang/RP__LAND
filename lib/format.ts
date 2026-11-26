// Intl formatters are costly to build, so create each once and reuse it for every row.
const shortFormat = new Intl.DateTimeFormat('ko-KR', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul'});
const fullFormat = new Intl.DateTimeFormat('ko-KR', {dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Seoul'});

// Intl formatters throw on an invalid date; show the stored text instead of breaking the page.
const safe = (format: Intl.DateTimeFormat, value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value ?? '') : format.format(date); };
export const shortDate = (value: string) => safe(shortFormat, value);
export const fullDate = (value: string) => safe(fullFormat, value);

/** Recent times read better as "5분 전"; anything a week or older falls back to the date. */
export function timeAgo(value: string, now = Date.now()) {
  const diff = now - new Date(value).getTime();
  if (!(diff >= 0)) return shortDate(value);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}일 전` : shortDate(value);
}
