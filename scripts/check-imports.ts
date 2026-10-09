// 모듈 경계 검사 (10.5 모듈 규칙 1). ESLint는 import 문자열만 비교하므로 경로를 해석해서 확인한다.
// 모듈 파일이 쓸 수 있는 것: 같은 모듈 폴더, @shared/*, @core/types, @modules/<다른 id>/api, react, zod
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const modulesDir = join(root, 'src/modules');
const IMPORT = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

export function violation(file: string, spec: string): string | null {
  const rel = relative(modulesDir, file).split(sep);
  const own = rel[0]!;
  if (rel.length === 1) return null; // src/modules/index.ts는 등록 목록이라 모든 모듈을 import한다
  if (spec === 'react' || spec.startsWith('react/') || spec === 'zod') return null;
  if (spec.startsWith('@shared/') || spec === '@core/types') return null;
  const other = /^@modules\/([^/]+)\/api$/.exec(spec);
  if (other) return null;
  // 규칙 조각은 템플릿 타입만 가져온다
  if (rel.at(-1) === 'rules.ts' && spec.endsWith('/rules/core.ts')) return null;
  if (spec.startsWith('.')) {
    const target = relative(modulesDir, resolve(dirname(file), spec)).split(sep);
    return target[0] === own ? null : `다른 모듈 내부 파일 ${spec}`;
  }
  return `모듈 밖 import ${spec}`;
}

if (import.meta.main) {
  const problems: string[] = [];
  for (const f of files(modulesDir)) {
    for (const m of readFileSync(f, 'utf8').matchAll(IMPORT)) {
      const spec = m[1] ?? m[2]!;
      const v = violation(f, spec);
      if (v) problems.push(`${relative(root, f)}: ${v}`);
    }
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('check-imports: 모듈 경계 위반 없음');
}
