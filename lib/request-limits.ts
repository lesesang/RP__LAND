// Cloudflare supplies this header on incoming requests. Never trust OAI or forwarded headers here.
export function clientAddress(req: Request): string {
  const ip = req.headers.get('CF-Connecting-IP');
  if (ip && /^[0-9a-f:.]{3,64}$/i.test(ip)) return ip.toLowerCase();
  if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(req.url).hostname)) return 'local';
  throw Object.assign(new Error('접속 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.'), {status:503});
}
export function credentialLimitKey(kind: 'login' | 'secret', address: string, target: string) {
  return JSON.stringify([kind, address, kind === 'login' ? target.toLowerCase() : target]);
}
