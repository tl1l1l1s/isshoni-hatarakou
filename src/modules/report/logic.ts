/** 디스코드 웹훅에 보낼 본문 (OPS-03). 멘션은 울리지 않고 디스코드 한도 2000자 안으로 자른다 */
export function hookBody(name: string, version: string, text: string): { content: string; allowed_mentions: { parse: never[] } } {
  const head = `[버그 제보] ${name || '이름 없음'} (v${version})`;
  return { content: `${head}\n${text}`.slice(0, 1900), allowed_mentions: { parse: [] } };
}
