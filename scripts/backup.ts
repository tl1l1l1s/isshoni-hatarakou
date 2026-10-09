// 서버 백업 (ACC-08, 10.10.3). 선물하는 사람 PC의 예약 작업으로 하루 한 번 실행한다.
// 날짜를 붙인 JSON에 files/를 뺀 모든 경로를 담고 최근 7개만 남긴다.
// files/는 내용 해시가 이름이라 바뀌지 않으므로 해시마다 한 번만 받는다 (10.7.5 내려받기 비용).
// 사용:  node scripts/backup.ts [폴더]      기본 폴더는 ~/isshoni-hatarakou-backups (저장소 밖)
// 환경 변수: GOOGLE_APPLICATION_CREDENTIALS(서비스 계정 JSON 경로), FIREBASE_DATABASE_URL
//            에뮬레이터에는 FIREBASE_DATABASE_EMULATOR_HOST를 함께 넣는다
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const KEEP = 7;
const DATED = /^\d{4}-\d{2}-\d{2}\.json$/;

/** 지울 백업: 날짜 이름 파일 가운데 최근 keep개를 뺀 나머지. 다른 파일은 건드리지 않는다 */
export function expired(names: string[], keep = KEEP): string[] {
  return names.filter((n) => DATED.test(n)).sort().reverse().slice(keep);
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function main(): Promise<void> {
  const dir = process.argv[2] ?? join(homedir(), 'isshoni-hatarakou-backups');
  const databaseURL = process.env.FIREBASE_DATABASE_URL ?? fail('FIREBASE_DATABASE_URL을 넣어 주세요.');
  const emulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  initializeApp({ databaseURL });
  const db = getDatabase();
  const credential = applicationDefault();

  // 관리 SDK에는 키만 받는 기능이 없어 REST의 shallow로 키 목록만 받는다
  const keys = async (path: string): Promise<string[]> => {
    const base = new URL(databaseURL);
    const url = new URL(`/${path}.json`, emulator ? `http://${emulator}` : base.origin);
    url.searchParams.set('shallow', 'true');
    if (emulator) url.searchParams.set('ns', base.searchParams.get('ns') ?? base.hostname.split('.')[0]!);
    const token = emulator ? 'owner' : (await credential.getAccessToken()).access_token;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`${path || '/'} 키 목록을 받지 못했습니다 (${res.status} ${await res.text()})`);
    return Object.keys(((await res.json()) as Record<string, unknown> | null) ?? {});
  };

  const filesDir = join(dir, 'files');
  mkdirSync(filesDir, { recursive: true });
  const have = new Set(readdirSync(filesDir).map((f) => f.replace(/\.json$/, '')));
  let added = 0;
  for (const hash of await keys('files')) {
    if (have.has(hash)) continue;
    writeFileSync(join(filesDir, `${hash}.json`), JSON.stringify((await db.ref(`files/${hash}`).get()).val()));
    added++;
  }

  const data: Record<string, unknown> = {};
  for (const k of await keys('')) if (k !== 'files') data[k] = (await db.ref(k).get()).val();
  // sv-SE 형식이 지역 날짜 YYYY-MM-DD다. 중간에 끊겨도 반쪽 파일이 백업으로 세어지지 않게 이름을 마지막에 바꾼다
  const name = `${new Date().toLocaleDateString('sv-SE')}.json`;
  writeFileSync(join(dir, `${name}.tmp`), JSON.stringify(data));
  renameSync(join(dir, `${name}.tmp`), join(dir, name));
  for (const old of expired(readdirSync(dir))) rmSync(join(dir, old));
  console.log(`${join(dir, name)}: 경로 ${Object.keys(data).length}개, 새 파일 ${added}개`);
}

if (import.meta.main) {
  await main();
  process.exit(0);
}
