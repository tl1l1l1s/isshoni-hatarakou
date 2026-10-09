// 규칙 파일 만들기 (10.7.2). 코어 규칙과 src/modules/<id>/rules.ts 조각을 합쳐 database.rules.json을 쓴다.
// 사용: node rules/build.ts [--check]  (--check는 파일이 최신이 아니면 실패)
// 조각은 템플릿을 인자로 받아 mod/<id> 아래 규칙을 돌려준다. 예: export default (t: Templates) => ({ u: { $uid: { notes: t.owner() } } })
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { coreRules, ISSUED, templates, TEMPLATE_REFS, type RuleNode, type Templates } from './core.ts';

export type Fragment = (t: Templates) => RuleNode;

/** 조각이 root로 자기 mod/<id> 밖을 참조하면 실패한다. 템플릿이 만든 식만 예외 */
// ponytail: parent() 체인으로 namespace 위로 올라가는 참조는 확인하지 않는다. 필요해지면 경로 깊이를 센다
export function checkFragment(id: string, node: RuleNode, at = `mod/${id}`): void {
  const own = new RegExp(`^root\\.child\\(['"]mod/${id}/`);
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'object' && !Array.isArray(v)) {
      checkFragment(id, v, `${at}/${k}`);
      continue;
    }
    if (typeof v !== 'string') continue;
    const rest = TEMPLATE_REFS.reduce((s, ref) => s.split(ref).join(''), v);
    for (const m of rest.matchAll(/\broot\b/g)) {
      if (!own.test(rest.slice(m.index))) throw new Error(`${at}/${k}: ${id} 모듈 규칙이 자기 namespace 밖을 참조합니다: ${v}`);
    }
  }
}

/** 서버 조정값 mod/<id>/g/tunables는 로그인한 사용자가 읽고 선물하는 사람의 스크립트(관리 SDK)만 쓴다 (10.5 tunables, OPS-12).
 *  이름을 적은 모듈 노드에는 $mid가 닿지 않으므로 조각마다 함께 넣는다 */
const TUNABLES: RuleNode = { '.read': `auth != null && ${ISSUED}` };

export function buildRules(fragments: Record<string, Fragment>): { rules: RuleNode } {
  const mod: RuleNode = { $mid: { g: { tunables: TUNABLES } } };
  for (const [id, fragment] of Object.entries(fragments)) {
    const node = fragment(templates);
    checkFragment(id, node);
    const g = (node.g ?? {}) as RuleNode;
    mod[id] = { ...node, g: { ...g, tunables: { ...TUNABLES, ...(g.tunables as RuleNode | undefined) } } };
  }
  return { rules: Object.keys(fragments).length ? { ...coreRules(), mod } : coreRules() };
}

if (import.meta.main) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const modules = `${root}src/modules`;
  const fragments: Record<string, Fragment> = {};
  for (const id of existsSync(modules) ? readdirSync(modules).sort() : []) {
    const file = `${modules}/${id}/rules.ts`;
    if (existsSync(file)) fragments[id] = ((await import(pathToFileURL(file).href)) as { default: Fragment }).default;
  }
  const json = `${JSON.stringify(buildRules(fragments), null, 2)}\n`;
  const out = `${root}database.rules.json`;
  if (process.argv.includes('--check')) {
    if (!existsSync(out) || readFileSync(out, 'utf8') !== json) {
      console.error('database.rules.json이 최신이 아닙니다. node rules/build.ts를 실행하세요.');
      process.exit(1);
    }
  } else {
    writeFileSync(out, json);
    console.log(`database.rules.json (모듈 조각 ${Object.keys(fragments).length}개)`);
  }
}
